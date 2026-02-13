import axios from 'axios';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const openStatesAPI = axios.create({
  baseURL: 'https://v3.openstates.org',
  headers: {
    'X-API-KEY': process.env.OPEN_STATES_API_KEY
  }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Helper function to determine bill stage
function determineBillStage(bill) {
  if (!bill.actions || bill.actions.length === 0) {
    return 'introduced';
  }

  const actionTypes = bill.actions.map(a => a.classification?.[0]).filter(Boolean);
  
  if (actionTypes.includes('executive-signature')) return 'signed';
  if (actionTypes.includes('executive-veto')) return 'vetoed';
  if (actionTypes.includes('became-law')) return 'became_law';
  if (actionTypes.includes('passage')) {
    const passageActions = bill.actions.filter(a => a.classification?.includes('passage'));
    if (passageActions.length >= 2) return 'enrolled';
    return 'passed_chamber';
  }
  if (actionTypes.includes('committee-passage')) return 'committee_approved';
  if (actionTypes.includes('referral-committee')) return 'committee';
  if (actionTypes.includes('reading-3')) return 'floor_calendar';
  if (actionTypes.includes('introduction')) return 'introduced';
  
  return 'introduced';
}

// Sync legislators
async function syncLegislators() {
  console.log('📥 Syncing legislators...');
  
  try {
    let page = 1;
    let totalSynced = 0;
    
    while (page <= 10) {
      const response = await openStatesAPI.get('/people', {
        params: {
          jurisdiction: 'ok',
          page: page,
          per_page: 20
        }
      });
      
      const legislators = response.data.results;
      if (legislators.length === 0) break;
      
      for (const legislator of legislators) {
        await pool.query(`
          INSERT INTO legislators (
            openstates_id, name, party, chamber, district, 
            image_url, email, phone
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (openstates_id) 
          DO UPDATE SET
            name = EXCLUDED.name,
            party = EXCLUDED.party,
            chamber = EXCLUDED.chamber,
            district = EXCLUDED.district,
            updated_at = NOW()
        `, [
          legislator.id,
          legislator.name,
          legislator.party?.[0]?.name || legislator.current_party,
          legislator.current_role?.chamber,
          legislator.current_role?.district,
          legislator.image,
          legislator.email || null,
          legislator.phone || null
        ]);
      }
      
      totalSynced += legislators.length;
      console.log(`  Synced ${totalSynced} legislators...`);
      
      if (!response.data.pagination || page >= response.data.pagination.max_page) break;
      page++;
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    await pool.query(`
      UPDATE sync_metadata 
      SET last_sync_at = NOW(), 
          last_success_at = NOW(),
          status = 'success',
          records_synced = $1
      WHERE sync_type = 'legislators'
    `, [totalSynced]);
    
    console.log(`✅ Synced ${totalSynced} legislators`);
    return totalSynced;
  } catch (error) {
    console.error('❌ Error syncing legislators:', error.message);
    await pool.query(`
      UPDATE sync_metadata 
      SET last_sync_at = NOW(), 
          status = 'error',
          error_message = $1
      WHERE sync_type = 'legislators'
    `, [error.message]);
    throw error;
  }
}

// Sync bills
async function syncBills() {
  console.log('📥 Syncing bills...');
  
  try {
    let page = 1;
    let totalSynced = 0;
    const maxPages = 20; // Fetch up to 400 bills
    
    while (page <= maxPages) {
      const response = await openStatesAPI.get('/bills', {
        params: {
          jurisdiction: 'ok',
          page: page,
          per_page: 20
        }
      });
      
      const bills = response.data.results;
      if (bills.length === 0) break;
      
      for (const bill of bills) {
        const stage = determineBillStage(bill);
        
        // Insert/update bill
        const billResult = await pool.query(`
          INSERT INTO bills (
            openstates_id, session_id, identifier, title, description,
            classification, subject, current_status, current_chamber, stage,
            first_action_date, latest_action_date, latest_action_description,
            full_text_url, openstates_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (openstates_id) 
          DO UPDATE SET
            title = EXCLUDED.title,
            current_status = EXCLUDED.current_status,
            stage = EXCLUDED.stage,
            latest_action_date = EXCLUDED.latest_action_date,
            latest_action_description = EXCLUDED.latest_action_description,
            updated_at = NOW()
          RETURNING id, stage, 
            (SELECT stage FROM bills WHERE openstates_id = $1) as old_stage
        `, [
          bill.id,
          bill.session?.identifier || '2026',
          bill.identifier,
          bill.title,
          bill.description || bill.title,
          bill.classification,
          JSON.stringify(bill.subject || []),
          bill.latest_action_description,
          bill.from_organization?.classification,
          stage,
          bill.first_action_date,
          bill.latest_action_date,
          bill.latest_action_description,
          bill.versions?.[0]?.url || null,
          `https://openstates.org/ok/bills/${bill.session?.identifier}/${bill.identifier}`
        ]);
        
        const billId = billResult.rows[0].id;
        const oldStage = billResult.rows[0].old_stage;
        
        // Track stage change in history
        if (oldStage && oldStage !== stage) {
          await pool.query(`
            INSERT INTO bill_history (bill_id, stage, status, previous_stage)
            VALUES ($1, $2, $3, $4)
          `, [billId, stage, bill.latest_action_description, oldStage]);
        }
        
        // Sync actions
        if (bill.actions && bill.actions.length > 0) {
          for (let i = 0; i < bill.actions.length; i++) {
            const action = bill.actions[i];
            await pool.query(`
              INSERT INTO bill_actions (
                bill_id, date, description, classification, chamber, order_index
              ) VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT DO NOTHING
            `, [
              billId,
              action.date,
              action.description,
              action.classification?.[0] || null,
              action.organization?.classification,
              i
            ]);
          }
        }
        
        // Sync sponsorships
        if (bill.sponsorships && bill.sponsorships.length > 0) {
          for (const sponsor of bill.sponsorships) {
            // Try to find legislator
            const legislatorResult = await pool.query(
              'SELECT id FROM legislators WHERE name = $1 LIMIT 1',
              [sponsor.name]
            );
            
            await pool.query(`
              INSERT INTO sponsorships (
                bill_id, legislator_id, name, classification, entity_type, primary_sponsor
              ) VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT DO NOTHING
            `, [
              billId,
              legislatorResult.rows[0]?.id || null,
              sponsor.name,
              sponsor.classification,
              sponsor.entity_type,
              sponsor.classification === 'primary' || sponsor.primary
            ]);
          }
        }
      }
      
      totalSynced += bills.length;
      console.log(`  Synced ${totalSynced} bills...`);
      
      if (!response.data.pagination || page >= response.data.pagination.max_page) break;
      page++;
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    await pool.query(`
      UPDATE sync_metadata 
      SET last_sync_at = NOW(), 
          last_success_at = NOW(),
          status = 'success',
          records_synced = $1
      WHERE sync_type = 'bills'
    `, [totalSynced]);
    
    console.log(`✅ Synced ${totalSynced} bills`);
    return totalSynced;
  } catch (error) {
    console.error('❌ Error syncing bills:', error.message);
    await pool.query(`
      UPDATE sync_metadata 
      SET last_sync_at = NOW(), 
          status = 'error',
          error_message = $1
      WHERE sync_type = 'bills'
    `, [error.message]);
    throw error;
  }
}

// Main sync function
async function runSync() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║         Oklahoma Bill Tracker - Database Sync                ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');
    
    // Sync legislators first
    await syncLegislators();
    console.log('');
    
    // Sync bills and related data
    await syncBills();
    console.log('');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                                                               ║');
    console.log('║                    Sync Complete! 🎉                          ║');
    console.log('║                                                               ║');
    console.log(`║   Duration: ${duration} seconds                                    ║`);
    console.log('║                                                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the sync
runSync();
