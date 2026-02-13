import ExcelJS from 'exceljs';
import pg from 'pg';

const { Pool } = pg;

// Helper to format stage names
function formatStage(stage) {
  const stageNames = {
    'introduced': 'Introduced',
    'committee': 'In Committee',
    'committee_approved': 'Committee Approved',
    'floor_calendar': 'Floor Calendar',
    'passed_chamber': 'Passed Chamber',
    'enrolled': 'Enrolled',
    'signed': 'Signed',
    'became_law': 'Became Law',
    'vetoed': 'Vetoed',
    'dead': 'Dead'
  };
  return stageNames[stage] || stage;
}

// Generate CSV from bills data
export function generateCSV(bills) {
  const headers = [
    'Bill Number',
    'Title',
    'Current Stage',
    'Chamber',
    'Latest Action',
    'Latest Action Date',
    'Primary Sponsor',
    'URL'
  ];
  
  let csv = headers.join(',') + '\n';
  
  bills.forEach(bill => {
    const row = [
      `"${bill.identifier}"`,
      `"${(bill.title || '').replace(/"/g, '""')}"`,
      `"${formatStage(bill.stage)}"`,
      `"${bill.identifier?.startsWith('HB') ? 'House' : 'Senate'}"`,
      `"${(bill.latest_action_description || '').replace(/"/g, '""')}"`,
      `"${bill.latest_action_date || ''}"`,
      `"${bill.primary_sponsor || ''}"`,
      `"${bill.openstates_url || ''}"`
    ];
    csv += row.join(',') + '\n';
  });
  
  return csv;
}

// Generate Excel from bills data
export async function generateExcel(bills, includeActions = false) {
  const workbook = new ExcelJS.Workbook();
  
  // Bills sheet
  const billsSheet = workbook.addWorksheet('Bills');
  
  billsSheet.columns = [
    { header: 'Bill Number', key: 'identifier', width: 15 },
    { header: 'Title', key: 'title', width: 50 },
    { header: 'Current Stage', key: 'stage', width: 20 },
    { header: 'Chamber', key: 'chamber', width: 12 },
    { header: 'Latest Action', key: 'latest_action', width: 40 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Primary Sponsor', key: 'sponsor', width: 25 },
    { header: 'URL', key: 'url', width: 50 }
  ];
  
  // Style header row
  billsSheet.getRow(1).font = { bold: true };
  billsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3B82F6' }
  };
  billsSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
  
  // Add data
  bills.forEach(bill => {
    billsSheet.addRow({
      identifier: bill.identifier,
      title: bill.title,
      stage: formatStage(bill.stage),
      chamber: bill.identifier?.startsWith('HB') ? 'House' : 'Senate',
      latest_action: bill.latest_action_description,
      date: bill.latest_action_date,
      sponsor: bill.primary_sponsor || '',
      url: bill.openstates_url || ''
    });
  });
  
  // Auto-filter
  billsSheet.autoFilter = {
    from: 'A1',
    to: 'H1'
  };
  
  // Add summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  
  summarySheet.addRow(['Oklahoma Bill Tracker - Summary']);
  summarySheet.addRow([]);
  summarySheet.addRow(['Generated:', new Date().toLocaleString()]);
  summarySheet.addRow(['Total Bills:', bills.length]);
  summarySheet.addRow([]);
  
  // Count by stage
  const stageCounts = {};
  bills.forEach(bill => {
    const stage = formatStage(bill.stage);
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });
  
  summarySheet.addRow(['Bills by Stage:']);
  Object.entries(stageCounts).forEach(([stage, count]) => {
    summarySheet.addRow([stage, count]);
  });
  
  // Count by chamber
  const houseBills = bills.filter(b => b.identifier?.startsWith('HB')).length;
  const senateBills = bills.filter(b => b.identifier?.startsWith('SB')).length;
  
  summarySheet.addRow([]);
  summarySheet.addRow(['Bills by Chamber:']);
  summarySheet.addRow(['House Bills', houseBills]);
  summarySheet.addRow(['Senate Bills', senateBills]);
  
  // Style summary sheet
  summarySheet.getCell('A1').font = { size: 16, bold: true };
  summarySheet.getColumn(1).width = 25;
  summarySheet.getColumn(2).width = 15;
  
  return workbook;
}

// Generate Excel with actions (detailed export)
export async function generateDetailedExcel(bills, pool) {
  const workbook = new ExcelJS.Workbook();
  
  // Bills sheet
  const billsSheet = workbook.addWorksheet('Bills');
  billsSheet.columns = [
    { header: 'Bill Number', key: 'identifier', width: 15 },
    { header: 'Title', key: 'title', width: 50 },
    { header: 'Current Stage', key: 'stage', width: 20 },
    { header: 'Chamber', key: 'chamber', width: 12 },
    { header: 'Latest Action', key: 'latest_action', width: 40 },
    { header: 'Date', key: 'date', width: 15 }
  ];
  
  billsSheet.getRow(1).font = { bold: true };
  billsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3B82F6' }
  };
  billsSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
  
  bills.forEach(bill => {
    billsSheet.addRow({
      identifier: bill.identifier,
      title: bill.title,
      stage: formatStage(bill.stage),
      chamber: bill.identifier?.startsWith('HB') ? 'House' : 'Senate',
      latest_action: bill.latest_action_description,
      date: bill.latest_action_date
    });
  });
  
  // Actions sheet
  const actionsSheet = workbook.addWorksheet('All Actions');
  actionsSheet.columns = [
    { header: 'Bill Number', key: 'bill', width: 15 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Action', key: 'action', width: 60 },
    { header: 'Chamber', key: 'chamber', width: 12 }
  ];
  
  actionsSheet.getRow(1).font = { bold: true };
  actionsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF10B981' }
  };
  actionsSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
  
  // Get all actions for these bills
  const billIds = bills.map(b => b.id);
  if (billIds.length > 0) {
    const actionsResult = await pool.query(`
      SELECT 
        b.identifier,
        ba.date,
        ba.description,
        ba.chamber
      FROM bill_actions ba
      JOIN bills b ON ba.bill_id = b.id
      WHERE ba.bill_id = ANY($1)
      ORDER BY b.identifier, ba.date DESC
    `, [billIds]);
    
    actionsResult.rows.forEach(action => {
      actionsSheet.addRow({
        bill: action.identifier,
        date: action.date,
        action: action.description,
        chamber: action.chamber || ''
      });
    });
  }
  
  // Sponsors sheet
  const sponsorsSheet = workbook.addWorksheet('Sponsors');
  sponsorsSheet.columns = [
    { header: 'Bill Number', key: 'bill', width: 15 },
    { header: 'Sponsor Name', key: 'name', width: 30 },
    { header: 'Type', key: 'type', width: 15 }
  ];
  
  sponsorsSheet.getRow(1).font = { bold: true };
  sponsorsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF59E0B' }
  };
  sponsorsSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
  
  if (billIds.length > 0) {
    const sponsorsResult = await pool.query(`
      SELECT 
        b.identifier,
        s.name,
        CASE WHEN s.primary_sponsor THEN 'Primary' ELSE 'Co-sponsor' END as type
      FROM sponsorships s
      JOIN bills b ON s.bill_id = b.id
      WHERE s.bill_id = ANY($1)
      ORDER BY b.identifier, s.primary_sponsor DESC, s.name
    `, [billIds]);
    
    sponsorsResult.rows.forEach(sponsor => {
      sponsorsSheet.addRow({
        bill: sponsor.identifier,
        name: sponsor.name,
        type: sponsor.type
      });
    });
  }
  
  return workbook;
}

export default {
  generateCSV,
  generateExcel,
  generateDetailedExcel
};
