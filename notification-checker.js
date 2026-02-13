#!/usr/bin/env node

// Notification Checker - Runs hourly to check for bill changes and send emails
// Add to crontab: 0 * * * * /usr/bin/node /path/to/notification-checker.js

import pg from 'pg';
import dotenv from 'dotenv';
import { sendBillStatusChangeEmail } from './email-service.js';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkNotifications() {
  console.log(`\n[${new Date().toISOString()}] 🔔 Checking for bill changes...`);
  
  try {
    // Get all active, verified subscriptions
    const subscriptionsResult = await pool.query(`
      SELECT 
        es.id as subscription_id,
        es.email,
        es.notification_type,
        es.last_notification_at,
        es.verification_token,
        b.id as bill_id,
        b.identifier,
        b.title,
        b.stage,
        b.latest_action_date,
        b.latest_action_description
      FROM email_subscriptions es
      JOIN bills b ON es.bill_id = b.id
      WHERE es.is_active = TRUE 
        AND es.verified_at IS NOT NULL
        AND es.notification_type IN ('status_change', 'all_updates')
    `);
    
    const subscriptions = subscriptionsResult.rows;
    console.log(`  Found ${subscriptions.length} active subscriptions`);
    
    if (subscriptions.length === 0) {
      console.log('  No subscriptions to process');
      await pool.end();
      return;
    }
    
    let notificationsSent = 0;
    
    for (const subscription of subscriptions) {
      try {
        // Get bill history changes since last notification
        const lastCheck = subscription.last_notification_at || subscription.created_at;
        
        const historyResult = await pool.query(`
          SELECT * FROM bill_history 
          WHERE bill_id = $1 
            AND changed_at > $2
          ORDER BY changed_at DESC
          LIMIT 1
        `, [subscription.bill_id, lastCheck]);
        
        if (historyResult.rows.length === 0) {
          // No changes since last notification
          continue;
        }
        
        const change = historyResult.rows[0];
        
        // Prepare bill data for email
        const bill = {
          identifier: subscription.identifier,
          title: subscription.title,
          stage: change.stage,
          latest_action_date: subscription.latest_action_date,
          latest_action_description: subscription.latest_action_description
        };
        
        // Send notification
        console.log(`  Sending notification for ${bill.identifier} to ${subscription.email}`);
        
        const result = await sendBillStatusChangeEmail(
          bill,
          change.previous_stage,
          change.stage,
          {
            id: subscription.subscription_id,
            email: subscription.email,
            verification_token: subscription.verification_token
          }
        );
        
        if (result.success) {
          // Update last notification time
          await pool.query(`
            UPDATE email_subscriptions 
            SET last_notification_at = NOW() 
            WHERE id = $1
          `, [subscription.subscription_id]);
          
          notificationsSent++;
          console.log(`  ✅ Sent notification to ${subscription.email}`);
        } else {
          console.error(`  ❌ Failed to send to ${subscription.email}:`, result.error);
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing subscription ${subscription.subscription_id}:`, error.message);
      }
    }
    
    console.log(`\n✅ Notification check complete. Sent ${notificationsSent} notifications.`);
    
  } catch (error) {
    console.error('❌ Error in notification checker:', error);
  } finally {
    await pool.end();
  }
}

// Run the checker
checkNotifications();
