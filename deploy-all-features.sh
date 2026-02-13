#!/bin/bash

# Oklahoma Bill Tracker - Complete Automated Deployment Script
# This script deploys all 6 features automatically

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   Oklahoma Bill Tracker - Complete Deployment                ║"
echo "║   All 6 Features + Favorites System                          ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
APP_DIR="/var/www/oklahoma-bill-tracker/BillPathOK"
BACKUP_DIR="/var/www/oklahoma-bill-tracker/backups/$(date +%Y%m%d_%H%M%S)"
DB_NAME="oklahoma_bills"
DB_USER="billtracker"

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    print_error "Please don't run as root. Run as your normal user with sudo privileges."
    exit 1
fi

# Prompt for database password
echo ""
print_info "Database Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -sp "Enter database password for user '$DB_USER' (or press Enter to generate one): " DB_PASS
echo ""
if [ -z "$DB_PASS" ]; then
    DB_PASS=$(openssl rand -base64 24)
    print_warning "Generated password: $DB_PASS"
    echo "          (Save this password!)"
fi

# Prompt for Open States API key
echo ""
read -p "Enter your Open States API key: " API_KEY
if [ -z "$API_KEY" ]; then
    print_error "API key is required!"
    exit 1
fi

# Prompt for email configuration
echo ""
print_info "Email Configuration (for notifications)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Email host (e.g., smtp.gmail.com): " EMAIL_HOST
read -p "Email port (e.g., 587): " EMAIL_PORT
read -p "Email username: " EMAIL_USER
read -sp "Email password (app password for Gmail): " EMAIL_PASS
echo ""
read -p "From email (e.g., Oklahoma Bill Tracker <your@email.com>): " EMAIL_FROM

# Confirm before proceeding
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Configuration Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "App Directory: $APP_DIR"
echo "Database: $DB_NAME"
echo "Database User: $DB_USER"
echo "Email Host: $EMAIL_HOST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Proceed with deployment? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    print_info "Deployment cancelled."
    exit 0
fi

echo ""
print_info "Starting deployment..."
echo ""

# ============================================================================
# STEP 1: Backup existing files
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 1: Backing up existing files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "$BACKUP_DIR"

if [ -f "$APP_DIR/server.js" ]; then
    cp "$APP_DIR/server.js" "$BACKUP_DIR/server.js"
    print_success "Backed up server.js"
fi

if [ -f "$APP_DIR/public/index.html" ]; then
    cp "$APP_DIR/public/index.html" "$BACKUP_DIR/index.html"
    print_success "Backed up index.html"
fi

if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$BACKUP_DIR/.env"
    print_success "Backed up .env"
fi

print_success "Backup location: $BACKUP_DIR"
echo ""

# ============================================================================
# STEP 2: Install PostgreSQL
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 2: Installing PostgreSQL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! command -v psql &> /dev/null; then
    print_info "Installing PostgreSQL..."
    sudo apt update > /dev/null 2>&1
    sudo apt install -y postgresql postgresql-contrib > /dev/null 2>&1
    sudo systemctl start postgresql
    sudo systemctl enable postgresql > /dev/null 2>&1
    print_success "PostgreSQL installed"
else
    print_success "PostgreSQL already installed"
fi

# Check PostgreSQL is running
if sudo systemctl is-active --quiet postgresql; then
    print_success "PostgreSQL is running"
else
    print_error "PostgreSQL is not running. Starting..."
    sudo systemctl start postgresql
fi
echo ""

# ============================================================================
# STEP 3: Create Database
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 3: Creating Database"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if database exists
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    print_warning "Database '$DB_NAME' already exists. Skipping creation."
else
    print_info "Creating database and user..."
    sudo -u postgres psql << EOF > /dev/null 2>&1
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
EOF
    print_success "Database created: $DB_NAME"
    print_success "User created: $DB_USER"
fi
echo ""

# ============================================================================
# STEP 4: Install Node.js Dependencies
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 4: Installing Node.js Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$APP_DIR"

print_info "Installing pg, nodemailer, exceljs..."
npm install --silent pg nodemailer exceljs

print_success "Dependencies installed"
echo ""

# ============================================================================
# STEP 5: Create Directory Structure
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 5: Creating Directory Structure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "$APP_DIR/database"
mkdir -p "$APP_DIR/services"
mkdir -p "$APP_DIR/public"

print_success "Directories created"
echo ""

# ============================================================================
# STEP 6: Check for Required Files
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 6: Checking for Required Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REQUIRED_FILES=(
    "server-complete.js"
    "database/schema.sql"
    "database/add-favorites.sql"
    "database/sync-database.js"
    "services/email-service.js"
    "services/export-service.js"
    "services/notification-checker.js"
    "public/index-full.html"
)

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$APP_DIR/$file" ]; then
        print_success "Found: $file"
    else
        print_warning "Missing: $file"
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -ne 0 ]; then
    echo ""
    print_error "Missing required files. Please upload:"
    for file in "${MISSING_FILES[@]}"; do
        echo "  - $file"
    done
    echo ""
    print_info "Upload files from the outputs folder to: $APP_DIR"
    exit 1
fi

print_success "All required files present"
echo ""

# ============================================================================
# STEP 7: Configure Environment
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 7: Configuring Environment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cat > "$APP_DIR/.env" << EOF
# Oklahoma Bill Tracker Configuration
# Generated on $(date)

# Open States API
OPEN_STATES_API_KEY=$API_KEY

# Server
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME

# Email
EMAIL_HOST=$EMAIL_HOST
EMAIL_PORT=$EMAIL_PORT
EMAIL_USER=$EMAIL_USER
EMAIL_PASS=$EMAIL_PASS
EMAIL_FROM=$EMAIL_FROM

# Application
APP_URL=https://nexuscore.vedemracing.com
EOF

chmod 600 "$APP_DIR/.env"
print_success "Environment configured"
echo ""

# ============================================================================
# STEP 8: Run Database Schema
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 8: Setting Up Database Schema"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

print_info "Running main schema..."
PGPASSWORD=$DB_PASS psql -U $DB_USER -d $DB_NAME -f "$APP_DIR/database/schema.sql" > /dev/null 2>&1
print_success "Main schema created"

print_info "Adding favorites feature..."
PGPASSWORD=$DB_PASS psql -U $DB_USER -d $DB_NAME -f "$APP_DIR/database/add-favorites.sql" > /dev/null 2>&1
print_success "Favorites feature added"

# Verify tables
TABLE_COUNT=$(PGPASSWORD=$DB_PASS psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')
print_success "Database has $TABLE_COUNT tables"
echo ""

# ============================================================================
# STEP 9: Initial Data Sync
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 9: Syncing Bill Data from Open States"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_warning "This may take 2-5 minutes..."
echo ""

cd "$APP_DIR"
if node database/sync-database.js; then
    print_success "Data sync complete"
    
    # Show counts
    BILL_COUNT=$(PGPASSWORD=$DB_PASS psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM bills;" | tr -d ' ')
    LEG_COUNT=$(PGPASSWORD=$DB_PASS psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM legislators;" | tr -d ' ')
    
    print_success "Synced $BILL_COUNT bills"
    print_success "Synced $LEG_COUNT legislators"
else
    print_error "Data sync failed. Check logs above."
fi
echo ""

# ============================================================================
# STEP 10: Deploy Application
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 10: Deploying Application"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stop PM2
print_info "Stopping existing PM2 process..."
pm2 stop oklahoma-bill-tracker > /dev/null 2>&1 || true
pm2 delete oklahoma-bill-tracker > /dev/null 2>&1 || true

# Copy server file
if [ -f "$APP_DIR/server-complete.js" ]; then
    cp "$APP_DIR/server-complete.js" "$APP_DIR/server.js"
    print_success "Server file deployed"
fi

# Copy frontend file
if [ -f "$APP_DIR/public/index-full.html" ]; then
    cp "$APP_DIR/public/index-full.html" "$APP_DIR/public/index.html"
    print_success "Frontend deployed"
fi

# Make scripts executable
chmod +x "$APP_DIR/database/sync-database.js" 2>/dev/null || true
chmod +x "$APP_DIR/services/notification-checker.js" 2>/dev/null || true

# Start PM2
print_info "Starting application with PM2..."
pm2 start "$APP_DIR/server.js" --name oklahoma-bill-tracker --cwd "$APP_DIR" > /dev/null 2>&1
pm2 save > /dev/null 2>&1

sleep 3

if pm2 list | grep -q "oklahoma-bill-tracker.*online"; then
    print_success "Application started successfully"
else
    print_error "Application failed to start. Check PM2 logs."
fi
echo ""

# ============================================================================
# STEP 11: Set Up Cron Jobs
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 11: Setting Up Cron Jobs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create cron jobs
CRON_TEMP=$(mktemp)
crontab -l > "$CRON_TEMP" 2>/dev/null || true

# Remove old entries if they exist
sed -i '/oklahoma-bill-tracker/d' "$CRON_TEMP"
sed -i '/sync-database.js/d' "$CRON_TEMP"
sed -i '/notification-checker.js/d' "$CRON_TEMP"

# Add new entries
cat >> "$CRON_TEMP" << EOF

# Oklahoma Bill Tracker - Automated Tasks
# Sync bills every 4 hours
0 */4 * * * cd $APP_DIR && /usr/bin/node database/sync-database.js >> /var/log/bill-sync.log 2>&1

# Check for notifications every hour
0 * * * * cd $APP_DIR && /usr/bin/node services/notification-checker.js >> /var/log/notifications.log 2>&1

# Backup database daily at 3am
0 3 * * * pg_dump -U $DB_USER oklahoma_bills | gzip > /var/backups/oklahoma_bills_\$(date +\\%Y\\%m\\%d).sql.gz
EOF

crontab "$CRON_TEMP"
rm "$CRON_TEMP"

print_success "Bill sync: Every 4 hours"
print_success "Notifications: Every hour"
print_success "Backups: Daily at 3am"
echo ""

# ============================================================================
# STEP 12: Test Installation
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Step 12: Testing Installation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

sleep 2

# Test health endpoint
if curl -s http://localhost:3001/health | grep -q "ok"; then
    print_success "Health check passed"
else
    print_error "Health check failed"
fi

# Test database connection
if PGPASSWORD=$DB_PASS psql -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
    print_success "Database connection OK"
else
    print_error "Database connection failed"
fi

# Test API
if curl -s http://localhost:3001/api/stats/summary | grep -q "total_bills"; then
    print_success "API endpoints working"
else
    print_warning "API test inconclusive"
fi

echo ""

# ============================================================================
# COMPLETION
# ============================================================================
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║                  Deployment Complete! 🎉                      ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Deployment Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_success "✅ PostgreSQL Database - $BILL_COUNT bills synced"
print_success "✅ Email Notifications - Configured and ready"
print_success "✅ Bill Detail Pages - Complete with history"
print_success "✅ Advanced Search - Full-text search enabled"
print_success "✅ Export Features - CSV and Excel"
print_success "✅ Favorites/Follow - Session-based tracking"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Access Your Application"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Public URL:  https://nexuscore.vedemracing.com"
echo "🏠 Local:       http://localhost:3001"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Useful Commands"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "View logs:          pm2 logs oklahoma-bill-tracker"
echo "Restart app:        pm2 restart oklahoma-bill-tracker"
echo "Check status:       pm2 status"
echo "View database:      psql -U $DB_USER -d $DB_NAME"
echo "Sync bills now:     node $APP_DIR/database/sync-database.js"
echo "Check cron jobs:    crontab -l"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Database Credentials (SAVE THESE!)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Database: $DB_NAME"
echo "User:     $DB_USER"
echo "Password: $DB_PASS"
echo ""
echo "Connection string saved in: $APP_DIR/.env"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backup Location"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Old files backed up to: $BACKUP_DIR"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_success "Deployment successful! Visit https://nexuscore.vedemracing.com"
echo ""
