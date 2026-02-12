#!/bin/bash

# Oklahoma Bill Tracker - Automated Deployment Script
# This script will backup existing files and deploy the enhanced version

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   Oklahoma Bill Tracker - Enhanced Version Deployment        ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
APP_DIR="/var/www/oklahoma-bill-tracker/BillPathOK"
BACKUP_DIR="/var/www/oklahoma-bill-tracker/backups/$(date +%Y%m%d_%H%M%S)"

# Check if running as correct user
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  Please don't run as root. Run as your normal user."
    exit 1
fi

# Navigate to app directory
cd "$APP_DIR" || {
    echo "❌ Error: Could not find directory $APP_DIR"
    exit 1
}

echo "📂 Working directory: $APP_DIR"
echo ""

# Create backup directory
echo "📦 Creating backup..."
mkdir -p "$BACKUP_DIR"

# Backup existing files
if [ -f "server.js" ]; then
    cp server.js "$BACKUP_DIR/server.js"
    echo "  ✅ Backed up server.js"
fi

if [ -f "public/index.html" ]; then
    cp public/index.html "$BACKUP_DIR/index.html"
    echo "  ✅ Backed up public/index.html"
fi

echo "  💾 Backup location: $BACKUP_DIR"
echo ""

# Stop PM2
echo "⏸️  Stopping PM2 process..."
pm2 stop oklahoma-bill-tracker 2>/dev/null || echo "  ⚠️  Process not running"
echo ""

# Deploy new server.js
echo "📝 Deploying new server.js..."
if [ -f "server-enhanced.js" ]; then
    cp server-enhanced.js server.js
    echo "  ✅ server.js updated"
else
    echo "  ⚠️  server-enhanced.js not found, skipping"
fi

# Deploy new index.html
echo "📝 Deploying new index.html..."
if [ -f "index-enhanced.html" ]; then
    cp index-enhanced.html public/index.html
    echo "  ✅ public/index.html updated"
else
    echo "  ⚠️  index-enhanced.html not found, skipping"
fi
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install --silent
echo "  ✅ Dependencies installed"
echo ""

# Start PM2
echo "▶️  Starting PM2 process..."
pm2 delete oklahoma-bill-tracker 2>/dev/null || true
pm2 start server.js --name oklahoma-bill-tracker --cwd "$APP_DIR"
pm2 save
echo "  ✅ Application started"
echo ""

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Test the application
echo "🧪 Testing application..."

# Test health endpoint
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "  ✅ Health check passed"
else
    echo "  ❌ Health check failed"
    echo "  📋 Check logs: pm2 logs oklahoma-bill-tracker"
fi

# Test stats endpoint
if curl -s http://localhost:3001/api/stats/summary | grep -q "total_bills"; then
    echo "  ✅ Stats API working"
else
    echo "  ⚠️  Stats API returned unexpected response"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║                   Deployment Complete! 🎉                     ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Your application is now running at:"
echo "   Local:  http://localhost:3001"
echo "   Public: https://nexuscore.vedemracing.com"
echo ""
echo "📊 Useful commands:"
echo "   pm2 status                          - Check app status"
echo "   pm2 logs oklahoma-bill-tracker      - View logs"
echo "   pm2 restart oklahoma-bill-tracker   - Restart app"
echo "   pm2 monit                           - Monitor resources"
echo ""
echo "💾 Backup location: $BACKUP_DIR"
echo ""
echo "🔧 To rollback to previous version:"
echo "   pm2 stop oklahoma-bill-tracker"
echo "   cp $BACKUP_DIR/server.js ./server.js"
echo "   cp $BACKUP_DIR/index.html ./public/index.html"
echo "   pm2 restart oklahoma-bill-tracker"
echo ""

# Check if files were actually deployed
DEPLOYED_FILES=0
if grep -q "fetchAllBills" server.js 2>/dev/null; then
    echo "✅ server.js successfully updated with enhanced version"
    DEPLOYED_FILES=$((DEPLOYED_FILES + 1))
fi

if [ $DEPLOYED_FILES -eq 0 ]; then
    echo ""
    echo "⚠️  WARNING: Enhanced files may not have been deployed."
    echo "   Make sure server-enhanced.js and index-enhanced.html are in:"
    echo "   $APP_DIR"
    echo ""
fi
