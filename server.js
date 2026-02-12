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
app.use(express.static('public'));

// Open States API client
const openStatesAPI = axios.create({
  baseURL: 'https://v3.openstates.org',
  headers: {
    'X-API-KEY': OPEN_STATES_API_KEY
  }
});

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
    const { session, page = 1, per_page = 20, chamber, subject } = req.query;
    
    // Build query parameters
    const params = {
      jurisdiction: 'ok',
      page: parseInt(page),
      per_page: parseInt(per_page)
    };
    
    if (session) params.session = session;
    if (chamber) params.chamber = chamber;
    if (subject) params.subject = subject;
    
    const response = await openStatesAPI.get('/bills', { params });
    
    // Enhance bills with stage information
    const enhancedResults = response.data.results.map(bill => ({
      ...bill,
      stage: determineBillStage(bill),
      latest_action_date: bill.latest_action_date || bill.first_action_date,
      chamber: bill.from_organization?.classification || 'unknown'
    }));
    
    res.json({
      ...response.data,
      results: enhancedResults
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
    const { session } = req.query;
    
    // Fetch bills (we'll get multiple pages to get better stats)
    const params = {
      jurisdiction: 'ok',
      per_page: 100
    };
    
    if (session) params.session = session;
    
    const response = await openStatesAPI.get('/bills', { params });
    const bills = response.data.results;
    
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
    
    bills.forEach(bill => {
      const stage = determineBillStage(bill);
      if (stageCounts.hasOwnProperty(stage)) {
        stageCounts[stage]++;
      }
    });
    
    res.json({
      total_bills: response.data.pagination?.total_items || bills.length,
      by_stage: stageCounts,
      last_updated: new Date().toISOString()
    });
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
    const { session } = req.query;
    
    const params = {
      jurisdiction: 'ok',
      per_page: 100
    };
    
    if (session) params.session = session;
    
    const response = await openStatesAPI.get('/bills', { params });
    const bills = response.data.results;
    
    const stats = {
      total_bills: response.data.pagination?.total_items || bills.length,
      active_bills: bills.filter(b => {
        const stage = determineBillStage(b);
        return !['signed', 'became_law', 'vetoed', 'dead'].includes(stage);
      }).length,
      passed_bills: bills.filter(b => {
        const stage = determineBillStage(b);
        return ['signed', 'became_law'].includes(stage);
      }).length,
      vetoed_bills: bills.filter(b => determineBillStage(b) === 'vetoed').length,
      house_bills: bills.filter(b => b.identifier?.startsWith('HB')).length,
      senate_bills: bills.filter(b => b.identifier?.startsWith('SB')).length
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching summary stats:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch summary statistics',
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
        per_page: 150
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
        per_page: parseInt(per_page)
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the frontend
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Oklahoma Bill Tracker - Proof of Concept                   ║
║                                                               ║
║   Server running on: http://localhost:${PORT}                    ║
║                                                               ║
║   API Endpoints:                                              ║
║   - GET  /api/bills           List bills                      ║
║   - GET  /api/bills/:id       Bill details                    ║
║   - GET  /api/stats/pipeline  Pipeline statistics             ║
║   - GET  /api/stats/summary   Summary statistics              ║
║   - GET  /api/legislators     List legislators                ║
║   - GET  /api/search?q=       Search bills                    ║
║                                                               ║
║   Dashboard:                                                  ║
║   - http://localhost:${PORT}                                     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  if (OPEN_STATES_API_KEY === 'DEMO_KEY') {
    console.warn('\n⚠️  WARNING: Using DEMO_KEY for Open States API');
    console.warn('   Get your free API key at: https://openstates.org/api/register/');
    console.warn('   Then set it in .env file: OPEN_STATES_API_KEY=your_key_here\n');
  }
});
