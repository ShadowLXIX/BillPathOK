import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import crypto from 'crypto';
import emailService from './services/email-service.js';
import exportService from './services/export-service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Test database connection on startup
pool.query('SELECT NOW()').then(() => {
  console.log('✅ Database connected');
}).catch(err => {
  console.error('❌ Database connection error:', err);
});

// Open States API client
const openStatesAPI = axios.create({
  baseURL: 'https://v3.openstates.org',
  headers: {
    'X-API-KEY': process.env.OPEN_STATES_API_KEY
  },
  timeout: 30000
});

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Simple session management (for favorites without login)
app.use((req, res, next) => {
  if (!req.headers['x-session-id']) {
    req.sessionId = crypto.randomUUID();
  } else {
    req.sessionId = req.headers['x-session-id'];
  }
  res.setHeader('X-Session-ID', req.sessionId);
  next();
});

// ============================================================================
// BILL ENDPOINTS
// ============================================================================

// Get all bills from database
app.get('/api/bills', async (req, res) => {
  try {
    const { page = 1, per_page = 10, chamber, stage, search } = req.query;
    
    let query = `
      SELECT 
        b.*,
        (SELECT name FROM sponsorships WHERE bill_id = b.id AND primary_sponsor = TRUE LIMIT 1) as primary_sponsor,
        (SELECT COUNT(*) FROM bill_actions WHERE bill_id = b.id) as action_count
      FROM bills b
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (chamber) {
      const prefix = chamber === 'upper' ? 'SB' : 'HB';
      query += ` AND b.identifier LIKE $${paramIndex}`;
      params.push(`${prefix}%`);
      paramIndex++;
    }
    
    if (stage) {
      query += ` AND b.stage = $${paramIndex}`;
      params.push(stage);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (b.title ILIKE $${paramIndex} OR b.identifier ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // Get total count
    const countQuery = query.replace('SELECT b.*', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const totalItems = parseInt(countResult.rows[0].count);
    
    // Add pagination
    const offset = (page - 1) * per_page;
    query += ` ORDER BY b.latest_action_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(per_page, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      results: result.rows,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(per_page),
        total_items: totalItems,
        total_pages: Math.ceil(totalItems / per_page)
      }
    });
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ error: 'Failed to fetch bills', message: error.message });
  }
});

// Get single bill with full details
app.get('/api/bills/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    
    const billQuery = `
      SELECT 
        b.*,
        (
          SELECT json_agg(
            json_build_object(
              'name', s.name,
              'primary', s.primary_sponsor,
              'classification', s.classification
            )
          )
          FROM sponsorships s
          WHERE s.bill_id = b.id
        ) as sponsors,
        (
          SELECT json_agg(
            json_build_object(
              'date', ba.date,
              'description', ba.description,
              'classification', ba.classification,
              'chamber', ba.chamber
            ) ORDER BY ba.date DESC
          )
          FROM bill_actions ba
          WHERE ba.bill_id = b.id
        ) as actions,
        (
          SELECT json_agg(
            json_build_object(
              'stage', bh.stage,
              'previous_stage', bh.previous_stage,
              'changed_at', bh.changed_at
            ) ORDER BY bh.changed_at DESC
          )
          FROM bill_history bh
          WHERE bh.bill_id = b.id
        ) as history
      FROM bills b
      WHERE b.identifier = $1
    `;
    
    const result = await pool.query(billQuery, [identifier]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching bill details:', error);
    res.status(500).json({ error: 'Failed to fetch bill details', message: error.message });
  }
});

// Get bills grouped by stage
app.get('/api/bills/by-stage', async (req, res) => {
  try {
    const query = `
      SELECT 
        b.stage,
        json_agg(
          json_build_object(
            'id', b.id,
            'identifier', b.identifier,
            'title', b.title,
            'latest_action_date', b.latest_action_date,
            'primary_sponsor', (
              SELECT name FROM sponsorships WHERE bill_id = b.id AND primary_sponsor = TRUE LIMIT 1
            )
          ) ORDER BY b.latest_action_date DESC
        ) as bills
      FROM bills b
      GROUP BY b.stage
    `;
    
    const result = await pool.query(query);
    
    const byStage = {};
    result.rows.forEach(row => {
      byStage[row.stage] = row.bills;
    });
    
    res.json({
      by_stage: byStage,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching bills by stage:', error);
    res.status(500).json({ error: 'Failed to fetch bills by stage', message: error.message });
  }
});

// ============================================================================
// STATISTICS ENDPOINTS
// ============================================================================

app.get('/api/stats/summary', async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_bills,
        COUNT(*) FILTER (WHERE stage NOT IN ('signed', 'became_law', 'vetoed', 'dead')) as active_bills,
        COUNT(*) FILTER (WHERE stage IN ('signed', 'became_law')) as passed_bills,
        COUNT(*) FILTER (WHERE stage = 'vetoed') as vetoed_bills,
        COUNT(*) FILTER (WHERE identifier LIKE 'HB%') as house_bills,
        COUNT(*) FILTER (WHERE identifier LIKE 'SB%') as senate_bills
      FROM bills
    `;
    
    const result = await pool.query(query);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching summary stats:', error);
    res.status(500).json({ error: 'Failed to fetch summary statistics', message: error.message });
  }
});

app.get('/api/stats/pipeline', async (req, res) => {
  try {
    const query = `
      SELECT 
        stage,
        COUNT(*) as count
      FROM bills
      GROUP BY stage
    `;
    
    const result = await pool.query(query);
    
    const byStage = {};
    result.rows.forEach(row => {
      byStage[row.stage] = parseInt(row.count);
    });
    
    const totalQuery = await pool.query('SELECT COUNT(*) as total FROM bills');
    
    res.json({
      total_bills: parseInt(totalQuery.rows[0].total),
      by_stage: byStage,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching pipeline stats:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline statistics', message: error.message });
  }
});

// ============================================================================
// SEARCH ENDPOINTS
// ============================================================================

app.post('/api/search/advanced', async (req, res) => {
  try {
    const { text, chamber, stage, sponsor, dateFrom, dateTo, subject } = req.body;
    
    let query = `
      SELECT 
        b.*,
        (SELECT name FROM sponsorships WHERE bill_id = b.id AND primary_sponsor = TRUE LIMIT 1) as primary_sponsor
      FROM bills b
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (text) {
      query += ` AND (
        to_tsvector('english', b.title) @@ plainto_tsquery('english', $${paramIndex})
        OR to_tsvector('english', b.description) @@ plainto_tsquery('english', $${paramIndex})
        OR b.identifier ILIKE $${paramIndex + 1}
      )`;
      params.push(text, `%${text}%`);
      paramIndex += 2;
    }
    
    if (chamber) {
      const prefix = chamber === 'upper' ? 'SB' : 'HB';
      query += ` AND b.identifier LIKE $${paramIndex}`;
      params.push(`${prefix}%`);
      paramIndex++;
    }
    
    if (stage) {
      query += ` AND b.stage = $${paramIndex}`;
      params.push(stage);
      paramIndex++;
    }
    
    if (sponsor) {
      query += ` AND EXISTS (
        SELECT 1 FROM sponsorships s 
        WHERE s.bill_id = b.id AND s.name ILIKE $${paramIndex}
      )`;
      params.push(`%${sponsor}%`);
      paramIndex++;
    }
    
    if (dateFrom) {
      query += ` AND b.latest_action_date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }
    
    if (dateTo) {
      query += ` AND b.latest_action_date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }
    
    if (subject) {
      query += ` AND b.subject::text ILIKE $${paramIndex}`;
      params.push(`%${subject}%`);
      paramIndex++;
    }
    
    query += ' ORDER BY b.latest_action_date DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    
    res.json({
      results: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error in advanced search:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// ============================================================================
// FAVORITES ENDPOINTS
// ============================================================================

// Get user's favorite bills
app.get('/api/favorites', async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { email } = req.query;
    
    const query = `
      SELECT * FROM favorite_bills_view
      WHERE ${email ? 'email = $1' : 'session_id = $1'}
      ORDER BY favorited_at DESC
    `;
    
    const result = await pool.query(query, [email || sessionId]);
    
    res.json({
      favorites: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: 'Failed to fetch favorites', message: error.message });
  }
});

// Add bill to favorites
app.post('/api/favorites', async (req, res) => {
  try {
    const { billId, billIdentifier, notes, notificationEnabled, email } = req.body;
    const sessionId = req.sessionId;
    
    let actualBillId = billId;
    
    // If billIdentifier provided instead of billId, look it up
    if (!billId && billIdentifier) {
      const billResult = await pool.query(
        'SELECT id FROM bills WHERE identifier = $1',
        [billIdentifier]
      );
      if (billResult.rows.length === 0) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      actualBillId = billResult.rows[0].id;
    }
    
    const query = `
      INSERT INTO bill_favorites (session_id, email, bill_id, notes, notification_enabled)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (${email ? 'email' : 'session_id'}, bill_id) 
      DO UPDATE SET 
        notes = EXCLUDED.notes,
        notification_enabled = EXCLUDED.notification_enabled
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      email ? null : sessionId,
      email || null,
      actualBillId,
      notes || null,
      notificationEnabled !== false
    ]);
    
    // If email provided and notifications enabled, create email subscription
    if (email && notificationEnabled !== false) {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      await pool.query(`
        INSERT INTO email_subscriptions (email, bill_id, notification_type, verification_token, from_favorite)
        VALUES ($1, $2, 'status_change', $3, TRUE)
        ON CONFLICT (email, bill_id, notification_type) DO NOTHING
      `, [email, actualBillId, verificationToken]);
      
      // Get bill details and send verification email
      const billData = await pool.query(
        'SELECT identifier, title FROM bills WHERE id = $1',
        [actualBillId]
      );
      
      if (billData.rows.length > 0) {
        await emailService.sendVerificationEmail(email, verificationToken, billData.rows[0]);
      }
    }
    
    res.json({
      success: true,
      favorite: result.rows[0],
      message: email ? 'Added to favorites! Check your email to confirm notifications.' : 'Added to favorites!'
    });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: 'Failed to add favorite', message: error.message });
  }
});

// Remove bill from favorites
app.delete('/api/favorites/:billId', async (req, res) => {
  try {
    const { billId } = req.params;
    const sessionId = req.sessionId;
    const { email } = req.query;
    
    const query = `
      DELETE FROM bill_favorites
      WHERE bill_id = $1 AND ${email ? 'email = $2' : 'session_id = $2'}
      RETURNING *
    `;
    
    const result = await pool.query(query, [billId, email || sessionId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }
    
    res.json({
      success: true,
      message: 'Removed from favorites'
    });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: 'Failed to remove favorite', message: error.message });
  }
});

// Check if bill is favorited
app.get('/api/favorites/check/:billId', async (req, res) => {
  try {
    const { billId } = req.params;
    const sessionId = req.sessionId;
    const { email } = req.query;
    
    const query = `
      SELECT * FROM bill_favorites
      WHERE bill_id = $1 AND ${email ? 'email = $2' : 'session_id = $2'}
    `;
    
    const result = await pool.query(query, [billId, email || sessionId]);
    
    res.json({
      isFavorited: result.rows.length > 0,
      favorite: result.rows[0] || null
    });
  } catch (error) {
    console.error('Error checking favorite:', error);
    res.status(500).json({ error: 'Failed to check favorite', message: error.message });
  }
});

// ============================================================================
// EMAIL SUBSCRIPTION ENDPOINTS
// ============================================================================

// Subscribe to bill updates
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, billId, notificationType = 'status_change', name } = req.body;
    
    if (!email || !billId) {
      return res.status(400).json({ error: 'Email and billId are required' });
    }
    
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    const query = `
      INSERT INTO email_subscriptions (email, name, bill_id, notification_type, verification_token)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email, bill_id, notification_type) 
      DO UPDATE SET is_active = TRUE, verification_token = EXCLUDED.verification_token
      RETURNING *
    `;
    
    const result = await pool.query(query, [email, name, billId, notificationType, verificationToken]);
    
    // Get bill details
    const billData = await pool.query(
      'SELECT identifier, title FROM bills WHERE id = $1',
      [billId]
    );
    
    if (billData.rows.length > 0) {
      // Send verification email
      await emailService.sendVerificationEmail(email, verificationToken, billData.rows[0]);
    }
    
    res.json({
      success: true,
      message: 'Subscription created! Please check your email to verify.',
      subscription: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription', message: error.message });
  }
});

// Verify email
app.get('/api/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    const result = await pool.query(`
      UPDATE email_subscriptions
      SET verified_at = NOW()
      WHERE verification_token = $1 AND verified_at IS NULL
      RETURNING *
    `, [token]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('<h1>Invalid or expired verification link</h1>');
    }
    
    res.send(`
      <html>
        <head><title>Email Verified</title></head>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1 style="color: #16a34a;">✓ Email Verified!</h1>
          <p>You'll now receive notifications for bill updates.</p>
          <a href="${process.env.APP_URL}" style="color: #3b82f6;">Return to Dashboard</a>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).send('<h1>Error verifying email</h1>');
  }
});

// Unsubscribe
app.get('/api/unsubscribe', async (req, res) => {
  try {
    const { token } = req.query;
    
    const result = await pool.query(`
      UPDATE email_subscriptions
      SET is_active = FALSE
      WHERE verification_token = $1
      RETURNING *
    `, [token]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('<h1>Subscription not found</h1>');
    }
    
    res.send(`
      <html>
        <head><title>Unsubscribed</title></head>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>Unsubscribed</h1>
          <p>You've been unsubscribed from bill notifications.</p>
          <a href="${process.env.APP_URL}" style="color: #3b82f6;">Return to Dashboard</a>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).send('<h1>Error unsubscribing</h1>');
  }
});

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

// Export bills as CSV
app.get('/api/export/csv', async (req, res) => {
  try {
    const bills = await exportService.exportBills(req.query);
    const csv = exportService.billsToCSV(bills);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="oklahoma-bills-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV', message: error.message });
  }
});

// Export bills as Excel
app.get('/api/export/xlsx', async (req, res) => {
  try {
    const bills = await exportService.exportBillsWithActions();
    const workbook = await exportService.billsToExcel(bills);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="oklahoma-bills-${new Date().toISOString().split('T')[0]}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting Excel:', error);
    res.status(500).json({ error: 'Failed to export Excel', message: error.message });
  }
});

// Custom export
app.post('/api/export/custom', async (req, res) => {
  try {
    const bills = await exportService.customExport(req.body);
    
    if (req.body.format === 'xlsx') {
      const workbook = await exportService.billsToExcel(bills);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="custom-export-${new Date().toISOString().split('T')[0]}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
    } else {
      const csv = exportService.billsToCSV(bills);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="custom-export-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    }
  } catch (error) {
    console.error('Error in custom export:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// ============================================================================
// UTILITY ENDPOINTS
// ============================================================================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Oklahoma Bill Tracker - Full Featured Version              ║
║                                                               ║
║   Server: http://localhost:${PORT}                              ║
║                                                               ║
║   ✅ PostgreSQL Database Integration                          ║
║   ✅ Email Notifications & Alerts                             ║
║   ✅ Bill Detail Pages                                        ║
║   ✅ Advanced Search                                          ║
║   ✅ Export Features (CSV/Excel)                              ║
║   ✅ Favorites/Follow Bills                                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
