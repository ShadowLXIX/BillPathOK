-- Oklahoma Bill Tracker - Database Schema
-- PostgreSQL Database Setup

-- Drop existing tables if they exist (for clean install)
DROP TABLE IF EXISTS legislator_votes CASCADE;
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS sponsorships CASCADE;
DROP TABLE IF EXISTS bill_actions CASCADE;
DROP TABLE IF EXISTS bill_history CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS legislators CASCADE;
DROP TABLE IF EXISTS email_subscriptions CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS sync_metadata CASCADE;

-- Legislators table
CREATE TABLE legislators (
  id SERIAL PRIMARY KEY,
  openstates_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  party VARCHAR(50),
  chamber VARCHAR(20),
  district VARCHAR(50),
  image_url TEXT,
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bills table
CREATE TABLE bills (
  id SERIAL PRIMARY KEY,
  openstates_id VARCHAR(255) UNIQUE NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  identifier VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  classification VARCHAR(50),
  subject JSONB,
  current_status VARCHAR(100),
  current_chamber VARCHAR(20),
  stage VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  first_action_date DATE,
  latest_action_date DATE,
  latest_action_description TEXT,
  full_text_url TEXT,
  openstates_url TEXT
);

-- Bill actions (status changes)
CREATE TABLE bill_actions (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  classification VARCHAR(100),
  chamber VARCHAR(20),
  order_index INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bill history (tracks changes over time)
CREATE TABLE bill_history (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  stage VARCHAR(50) NOT NULL,
  status VARCHAR(100),
  changed_at TIMESTAMP DEFAULT NOW(),
  previous_stage VARCHAR(50),
  notes TEXT
);

-- Bill sponsorships
CREATE TABLE sponsorships (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  legislator_id INTEGER REFERENCES legislators(id),
  name VARCHAR(255) NOT NULL,
  classification VARCHAR(50),
  entity_type VARCHAR(50),
  primary_sponsor BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Votes
CREATE TABLE votes (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  openstates_id VARCHAR(255) UNIQUE,
  date DATE,
  motion_text TEXT,
  motion_classification VARCHAR(100),
  result VARCHAR(50),
  chamber VARCHAR(20),
  yes_count INTEGER,
  no_count INTEGER,
  other_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Individual legislator votes
CREATE TABLE legislator_votes (
  id SERIAL PRIMARY KEY,
  vote_id INTEGER REFERENCES votes(id) ON DELETE CASCADE,
  legislator_id INTEGER REFERENCES legislators(id),
  option VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Email subscriptions
CREATE TABLE email_subscriptions (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'status_change', 'all_updates', 'daily_digest'
  is_active BOOLEAN DEFAULT TRUE,
  verification_token VARCHAR(255),
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_notification_at TIMESTAMP,
  UNIQUE(email, bill_id, notification_type)
);

-- User preferences (for future user accounts)
CREATE TABLE user_preferences (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  notification_frequency VARCHAR(50) DEFAULT 'immediate', -- 'immediate', 'daily', 'weekly'
  filter_chamber VARCHAR(20), -- 'upper', 'lower', null for both
  filter_subjects JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sync metadata (track last sync times)
CREATE TABLE sync_metadata (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) UNIQUE NOT NULL,
  last_sync_at TIMESTAMP,
  last_success_at TIMESTAMP,
  status VARCHAR(50),
  records_synced INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_bills_identifier ON bills(identifier);
CREATE INDEX idx_bills_session ON bills(session_id);
CREATE INDEX idx_bills_status ON bills(current_status);
CREATE INDEX idx_bills_stage ON bills(stage);
CREATE INDEX idx_bills_latest_action ON bills(latest_action_date DESC);
CREATE INDEX idx_bill_actions_bill_date ON bill_actions(bill_id, date);
CREATE INDEX idx_bill_history_bill ON bill_history(bill_id, changed_at DESC);
CREATE INDEX idx_sponsorships_bill ON sponsorships(bill_id);
CREATE INDEX idx_sponsorships_legislator ON sponsorships(legislator_id);
CREATE INDEX idx_votes_bill ON votes(bill_id);
CREATE INDEX idx_email_subs_active ON email_subscriptions(email, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_email_subs_bill ON email_subscriptions(bill_id) WHERE is_active = TRUE;

-- Full text search indexes
CREATE INDEX idx_bills_title_search ON bills USING gin(to_tsvector('english', title));
CREATE INDEX idx_bills_description_search ON bills USING gin(to_tsvector('english', description));

-- Insert initial sync metadata
INSERT INTO sync_metadata (sync_type, status) VALUES
  ('bills', 'pending'),
  ('legislators', 'pending'),
  ('actions', 'pending'),
  ('votes', 'pending');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON bills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_legislators_updated_at BEFORE UPDATE ON legislators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for bill summary with counts
CREATE VIEW bill_summary AS
SELECT 
  b.id,
  b.identifier,
  b.title,
  b.stage,
  b.current_status,
  b.latest_action_date,
  b.latest_action_description,
  COUNT(DISTINCT ba.id) as action_count,
  COUNT(DISTINCT s.id) as sponsor_count,
  COUNT(DISTINCT v.id) as vote_count,
  STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name) as sponsors
FROM bills b
LEFT JOIN bill_actions ba ON b.id = ba.bill_id
LEFT JOIN sponsorships s ON b.id = s.bill_id AND s.primary_sponsor = TRUE
LEFT JOIN votes v ON b.id = v.bill_id
GROUP BY b.id;

-- Grant permissions (adjust as needed for your user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO billtracker;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO billtracker;

COMMENT ON TABLE bills IS 'Main table storing Oklahoma legislative bills';
COMMENT ON TABLE bill_history IS 'Tracks historical changes to bill status and stage';
COMMENT ON TABLE email_subscriptions IS 'User email subscriptions for bill notifications';
COMMENT ON TABLE sync_metadata IS 'Tracks data synchronization from Open States API';
