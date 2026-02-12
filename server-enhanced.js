import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Note: For this demo, we'll use a placeholder key
// In production, get your free key from: https://openstates.org/api/register/
const OPEN_STATES_API_KEY = process.env.OPEN_STATES_API_KEY || 'DEMO_KEY';

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Open States API client
const openStatesAPI = axios.create({
  baseURL: 'https://v3.openstates.org',
  headers: {
    'X-API-KEY': OPEN_STATES_API_KEY
  },
  timeout: 30000 // 30 second timeout
});

// Simple in-memory cache
let statsCache = {
  summary: null,
  pipeline: null,
  allBills: null,
  lastUpdate: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to fetch multiple pages of bills
async function fetchAllBills(maxPages = 10) {
  // Check cache first
  if (statsCache.allBills && statsCache.lastUpdate && 
      (Date.now() - statsCache.lastUpdate < CACHE_DURATION)) {
    return statsCache.allBills;
  }

  let allBills = [];
  let page = 1;
  
  while (page <= maxPages) {
    try {
      const params = {
        jurisdiction: 'ok',
        page: page,
        per_page: 20 // Max allowed by Open States
      };
      
      const response = await openStatesAPI.get('/bills', { params });
      const bills = response.data.results;
      
      if (bills.length === 0) break;
      
      allBills = allBills.concat(bills);
      
      console.log(`Fetched page ${page}, total bills so far: ${allBills.length}`);
      
      // Check if there are more pages
      if (!response.data.pagination || page >= response.data.pagination.total_pages) {
        break;
      }
      
      page++;
      
      // Rate limiting - be nice to the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }
  
  // Cache the results
  statsCache.allBills = allBills;
  statsCache.lastUpdate = Date.now();
  
  console.log(`Total bills fetched: ${allBills.length}`);
  return allBills;
}

// Helper function to determine bill stage from actions
function determineBillStage(bill) {
  if (!bill.actions || bill.actions.length === 0) {
    return 'introduced';
  }

  const actionTypes = bill.actions.map(a => a.classification?.[0]).filter(Boolean);
  const lastAction = bill.actions[bill.actions.length - 1];
  
  // Check for final outcomes
  if (actionTypes.includes('executive-signature')) return 'signed';
  if (actionTypes.includes('executive-veto')) return 'vetoed';
  if (actionTypes.includes('became-law')) return 'became_law';
  if (actionTypes.includes('passage')) {
    // Check if passed both chambers
    const passageActions = bill.actions.filter(a => a.classification?.includes('passage'));
    if (passageActions.length >= 2) return 'enrolled';
    return 'passed_chamber';
  }
  
  // Committee stages
  if (actionTypes.includes('committee-passage')) return 'committee_approved';
  if (actionTypes.includes('referral-committee') || actionTypes.includes('committee-referral')) return 'committee';
  if (actionTypes.includes('reading-3')) return 'floor_calendar';
  if (actionTypes.includes('introduction') || actionTypes.includes('filing')) return 'introduced';
  
  // Default based on latest status
  if (bill.latest_action_description) {
    const desc = bill.latest_action_description.toLowerCase();
    if (desc.includes('signed')) return 'signed';
    if (desc.includes('veto')) return 'vetoed';
    if (desc.includes('enrolled')) return 'enrolled';
    if (desc.includes('passed')) return 'passed_chamber';
    if (desc.includes('committee')) return 'committee';
  }
  
  return 'introduced';
}

// API Routes

// Get Oklahoma bills
app.get('/api/bills', async (req, res) => {
  try {
    const { session, page = 1, per_page = 10, chamber, subject, status } = req.query;
    
    // Fetch all bills (cached)
    const allBills = await fetchAllBills(15); // Fetch up to 15 pages (300 bills)
    
    // Filter bills based on query parameters
    let filteredBills = allBills;
    
    if (chamber) {
      const chamberMap = {
        'upper': 'SB',
        'lower': 'HB'
      };
      const prefix = chamberMap[chamber];
      if (prefix) {
        filteredBills = filteredBills.filter(b => b.identifier?.startsWith(prefix));
      }
    }
    
    if (status) {
      filteredBills = filteredBills.filter(b => determineBillStage(b) === status);
    }
    
    if (subject) {
      filteredBills = filteredBills.filter(b => 
        b.subject?.some(s => s.toLowerCase().includes(subject.toLowerCase()))
      );
    }
    
    // Enhance bills with stage information
    const enhancedBills = filteredBills.map(bill => ({
      ...bill,
      stage: determineBillStage(bill),
      latest_action_date: bill.latest_action_date || bill.first_action_date,
      chamber: bill.from_organization?.classification || 'unknown'
    }));
    
    // Paginate results
    const pageNum = parseInt(page);
    const perPage = Math.min(parseInt(per_page), 20);
    const startIndex = (pageNum - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedBills = enhancedBills.slice(startIndex, endIndex);
    
    res.json({
      results: paginatedBills,
      pagination: {
        page: pageNum,
        per_page: perPage,
        total_items: enhancedBills.length,
        total_pages: Math.ceil(enhancedBills.length / perPage)
      }
    });
  } catch (error) {
    console.error('Error fetching bills:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch bills',
      message: error.message,
      details: error.response?.data 
    });
  }
});

// Get single bill by ID
app.get('/api/bills/:billId', async (req, res) => {
  try {
    const { billId } = req.params;
    
    const response = await openStatesAPI.get(`/bills/${billId}`, {
      params: {
        include: 'sponsorships,actions,votes,versions'
      }
    });
    
    const bill = response.data;
    const stage = determineBillStage(bill);
    
    res.json({
      ...bill,
      stage
    });
  } catch (error) {
    console.error('Error fetching bill:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch bill details',
      message: error.message 
    });
  }
});

// Get pipeline statistics
app.get('/api/stats/pipeline', async (req, res) => {
  try {
    // Check cache first
    if (statsCache.pipeline && statsCache.lastUpdate && 
        (Date.now() - statsCache.lastUpdate < CACHE_DURATION)) {
      return res.json(statsCache.pipeline);
    }
    
    // Fetch all bills
    const allBills = await fetchAllBills(15);
    
    // Count bills by stage
    const stageCounts = {
      introduced: 0,
      committee: 0,
      committee_approved: 0,
      floor_calendar: 0,
      passed_chamber: 0,
      enrolled: 0,
      signed: 0,
      became_law: 0,
      vetoed: 0,
      dead: 0
    };
    
    allBills.forEach(bill => {
      const stage = determineBillStage(bill);
      if (stageCounts.hasOwnProperty(stage)) {
        stageCounts[stage]++;
      }
    });
    
    const result = {
      total_bills: allBills.length,
      by_stage: stageCounts,
      last_updated: new Date().toISOString()
    };
    
    // Cache the results
    statsCache.pipeline = result;
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching pipeline stats:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch statistics',
      message: error.message 
    });
  }
});

// Get summary statistics
app.get('/api/stats/summary', async (req, res) => {
  try {
    // Check cache first
    if (statsCache.summary && statsCache.lastUpdate && 
        (Date.now() - statsCache.lastUpdate < CACHE_DURATION)) {
      return res.json(statsCache.summary);
    }
    
    // Fetch all bills
    const allBills = await fetchAllBills(15);
    
    const stats = {
      total_bills: allBills.length,
      active_bills: allBills.filter(b => {
        const stage = determineBillStage(b);
        return !['signed', 'became_law', 'vetoed', 'dead'].includes(stage);
      }).length,
      passed_bills: allBills.filter(b => {
        const stage = determineBillStage(b);
        return ['signed', 'became_law'].includes(stage);
      }).length,
      vetoed_bills: allBills.filter(b => determineBillStage(b) === 'vetoed').length,
      house_bills: allBills.filter(b => b.identifier?.startsWith('HB')).length,
      senate_bills: allBills.filter(b => b.identifier?.startsWith('SB')).length
    };
    
    // Cache the results
    statsCache.summary = stats;
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching summary stats:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch summary statistics',
      message: error.message 
    });
  }
});

// Get detailed bills for visualization
app.get('/api/bills/by-stage', async (req, res) => {
  try {
    // Fetch all bills
    const allBills = await fetchAllBills(15);
    
    // Group bills by stage with full details
    const billsByStage = {
      introduced: [],
      committee: [],
      committee_approved: [],
      floor_calendar: [],
      passed_chamber: [],
      enrolled: [],
      signed: [],
      became_law: [],
      vetoed: [],
      dead: []
    };
    
    allBills.forEach(bill => {
      const stage = determineBillStage(bill);
      if (billsByStage.hasOwnProperty(stage)) {
        billsByStage[stage].push({
          id: bill.id,
          identifier: bill.identifier,
          title: bill.title,
          chamber: bill.identifier?.startsWith('HB') ? 'House' : 'Senate',
          latest_action_date: bill.latest_action_date,
          latest_action_description: bill.latest_action_description,
          sponsors: bill.sponsorships?.map(s => s.name) || []
        });
      }
    });
    
    res.json({
      by_stage: billsByStage,
      total_bills: allBills.length,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching bills by stage:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch bills by stage',
      message: error.message 
    });
  }
});

// Get Oklahoma legislators
app.get('/api/legislators', async (req, res) => {
  try {
    const response = await openStatesAPI.get('/people', {
      params: {
        jurisdiction: 'ok',
        per_page: 20
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching legislators:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch legislators',
      message: error.message 
    });
  }
});

// Search bills
app.get('/api/search', async (req, res) => {
  try {
    const { q, page = 1, per_page = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const response = await openStatesAPI.get('/bills', {
      params: {
        jurisdiction: 'ok',
        q,
        page: parseInt(page),
        per_page: Math.min(parseInt(per_page), 20)
      }
    });
    
    const enhancedResults = response.data.results.map(bill => ({
      ...bill,
      stage: determineBillStage(bill)
    }));
    
    res.json({
      ...response.data,
      results: enhancedResults
    });
  } catch (error) {
    console.error('Error searching bills:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to search bills',
      message: error.message 
    });
  }
});

// Clear cache endpoint (for admin/debugging)
app.post('/api/cache/clear', (req, res) => {
  statsCache = {
    summary: null,
    pipeline: null,
    allBills: null,
    lastUpdate: null
  };
  res.json({ message: 'Cache cleared successfully' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cache_age: statsCache.lastUpdate ? Math.floor((Date.now() - statsCache.lastUpdate) / 1000) : null
  });
});

// Serve the frontend
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Oklahoma Bill Tracker - Enhanced Version                   ║
║                                                               ║
║   Server running on: http://localhost:${PORT}                    ║
║                                                               ║
║   Features:                                                   ║
║   - Multi-page API fetching (300+ bills)                     ║
║   - 5-minute caching for performance                          ║
║   - Enhanced statistics and visualizations                    ║
║                                                               ║
║   API Endpoints:                                              ║
║   - GET  /api/bills              List bills with filters     ║
║   - GET  /api/bills/:id          Bill details                ║
║   - GET  /api/bills/by-stage     Bills grouped by stage      ║
║   - GET  /api/stats/pipeline     Pipeline statistics         ║
║   - GET  /api/stats/summary      Summary statistics          ║
║   - GET  /api/legislators        List legislators            ║
║   - GET  /api/search?q=          Search bills                ║
║   - POST /api/cache/clear        Clear cache                 ║
║                                                               ║
║   Dashboard: http://localhost:${PORT}                            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  if (OPEN_STATES_API_KEY === 'DEMO_KEY') {
    console.warn('\n⚠️  WARNING: Using DEMO_KEY for Open States API');
    console.warn('   Get your free API key at: https://openstates.org/api/register/');
    console.warn('   Then set it in .env file: OPEN_STATES_API_KEY=your_key_here\n');
  }
  
  // Warm up the cache on startup
  console.log('Warming up cache...');
  fetchAllBills(15).then(() => {
    console.log('✅ Cache warmed up successfully');
  }).catch(err => {
    console.error('❌ Error warming up cache:', err.message);
  });
});
