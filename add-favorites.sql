-- Add Favorites/Follow Feature
-- Migration to add user favorites table

-- User favorites table (allows anonymous favorites with browser storage)
CREATE TABLE IF NOT EXISTS bill_favorites (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255), -- Browser session ID for anonymous users
  email VARCHAR(255), -- For logged-in users (future)
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  notes TEXT, -- User's personal notes about the bill
  notification_enabled BOOLEAN DEFAULT TRUE,
  UNIQUE(session_id, bill_id),
  UNIQUE(email, bill_id)
);

-- Index for quick lookups
CREATE INDEX idx_favorites_session ON bill_favorites(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_favorites_email ON bill_favorites(email) WHERE email IS NOT NULL;
CREATE INDEX idx_favorites_bill ON bill_favorites(bill_id);

-- View for favorite bills with details
CREATE OR REPLACE VIEW favorite_bills_view AS
SELECT 
  bf.id as favorite_id,
  bf.session_id,
  bf.email,
  bf.notes,
  bf.notification_enabled,
  bf.created_at as favorited_at,
  b.id as bill_id,
  b.identifier,
  b.title,
  b.stage,
  b.current_status,
  b.latest_action_date,
  b.latest_action_description,
  (SELECT COUNT(*) FROM bill_history WHERE bill_id = b.id) as status_changes,
  (SELECT name FROM sponsorships WHERE bill_id = b.id AND primary_sponsor = TRUE LIMIT 1) as primary_sponsor
FROM bill_favorites bf
JOIN bills b ON bf.bill_id = b.id
ORDER BY bf.created_at DESC;

-- Function to get user's favorite count
CREATE OR REPLACE FUNCTION get_favorite_count(p_session_id VARCHAR, p_email VARCHAR DEFAULT NULL)
RETURNS INTEGER AS $$
BEGIN
  IF p_email IS NOT NULL THEN
    RETURN (SELECT COUNT(*) FROM bill_favorites WHERE email = p_email);
  ELSE
    RETURN (SELECT COUNT(*) FROM bill_favorites WHERE session_id = p_session_id);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check if bill is favorited
CREATE OR REPLACE FUNCTION is_bill_favorited(p_bill_id INTEGER, p_session_id VARCHAR, p_email VARCHAR DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_email IS NOT NULL THEN
    RETURN EXISTS(SELECT 1 FROM bill_favorites WHERE bill_id = p_bill_id AND email = p_email);
  ELSE
    RETURN EXISTS(SELECT 1 FROM bill_favorites WHERE bill_id = p_bill_id AND session_id = p_session_id);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add notification columns to email_subscriptions if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='email_subscriptions' 
                 AND column_name='from_favorite') THEN
    ALTER TABLE email_subscriptions ADD COLUMN from_favorite BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

COMMENT ON TABLE bill_favorites IS 'Stores user favorite/followed bills with optional email notifications';
COMMENT ON COLUMN bill_favorites.session_id IS 'Browser session ID for anonymous users';
COMMENT ON COLUMN bill_favorites.email IS 'Email for registered users (future feature)';
COMMENT ON COLUMN bill_favorites.notes IS 'User personal notes about why they are following this bill';
COMMENT ON COLUMN bill_favorites.notification_enabled IS 'Whether to send email notifications for this favorite';
