# 🚀 Quick Start Guide

Get the Oklahoma Bill Tracker running in under 5 minutes!

## Prerequisites

- ✅ Node.js 18 or higher installed
- ✅ Free Open States API key (get one at https://openstates.org/api/register/)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

This will install:
- express (web server)
- axios (HTTP client for API calls)
- cors (enable cross-origin requests)
- dotenv (environment variable management)

### 2. Get Your API Key

1. Visit https://openstates.org/api/register/
2. Create a free account
3. Click "Continue" after logging in
4. Request an API key from your profile page
5. Copy the API key

### 3. Configure Environment

Create a `.env` file in the project root:

```bash
# Option A: Copy from template
cp .env.example .env

# Option B: Create manually
echo "OPEN_STATES_API_KEY=your_key_here" > .env
```

Then edit `.env` and paste your actual API key:
```
OPEN_STATES_API_KEY=abc123your_actual_key_here
PORT=3001
```

### 4. Start the Server

```bash
npm start
```

You should see:
```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Oklahoma Bill Tracker - Proof of Concept                   ║
║                                                               ║
║   Server running on: http://localhost:3001                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### 5. Open Your Browser

Navigate to: **http://localhost:3001**

You should see the Oklahoma Bill Tracker dashboard!

## What You'll See

### Dashboard Overview

1. **Summary Cards** - Total bills, active bills, passed bills, vetoed bills
2. **Pipeline Visualization** - Bills at each stage of the legislative process
3. **Bill List** - Searchable, filterable list of all bills
4. **Filters** - Filter by chamber (House/Senate), status, or search keywords

### Try These Actions

- ✅ Click on any pipeline stage to filter bills in that stage
- ✅ Use the chamber dropdown to see only House or Senate bills
- ✅ Search for bills by keyword (e.g., "education", "health", "tax")
- ✅ Click the refresh button to get the latest data

## Troubleshooting

### "Failed to fetch bills" Error

**Problem**: Invalid or missing API key

**Solution**:
```bash
# Check your .env file exists
ls -la .env

# Verify it contains your key
cat .env

# Make sure you restart the server after updating .env
# Press Ctrl+C to stop, then:
npm start
```

### Port Already in Use

**Problem**: Port 3001 is already being used

**Solution**:
```bash
# Option 1: Change the port in .env
echo "PORT=8080" >> .env

# Option 2: Find and kill the process
lsof -ti:3001 | xargs kill -9
```

### API Rate Limiting

**Problem**: Too many requests to Open States API

**Solution**:
- Free tier allows 30,000 requests/month
- Dashboard caches data automatically
- Reduce refresh frequency if needed
- Consider adding Redis cache (see ARCHITECTURE.md)

## Next Steps

### Customize Your Dashboard

1. **Change Bills Per Page**
   - Edit `server.js`, line 34: change `per_page: 20` to your preference

2. **Adjust Auto-Refresh**
   - Edit `public/index.html`, search for `setInterval`
   - Change `5 * 60 * 1000` (5 minutes) to your preference

3. **Add More Filters**
   - Edit `public/index.html` to add subject filters, date ranges, etc.

### Deploy to Production

See `DEPLOYMENT.md` for instructions on deploying to:
- Vercel (easiest, free)
- Railway (includes database)
- Render (free tier available)
- Heroku
- AWS

### Add Database (Optional)

For production use, add PostgreSQL:
1. See `ARCHITECTURE.md` for complete database schema
2. Install Prisma: `npm install prisma @prisma/client`
3. Set up PostgreSQL and configure connection
4. Run migrations
5. Update server.js to use database instead of direct API calls

## Common Commands

```bash
# Start server
npm start

# Stop server
Press Ctrl+C

# Check if server is running
curl http://localhost:3001/health

# View real-time logs
npm start | tee logs.txt

# Test API endpoints
curl http://localhost:3001/api/bills
curl http://localhost:3001/api/stats/summary
curl http://localhost:3001/api/legislators
```

## Project Structure

```
oklahoma-bill-tracker/
├── server.js              # Backend API server
├── package.json           # Dependencies
├── .env                   # Your configuration (don't commit!)
├── .env.example          # Template for .env
├── .gitignore            # Git ignore rules
├── README.md             # Full documentation
├── ARCHITECTURE.md        # Technical architecture
├── DEPLOYMENT.md         # Deployment guide
├── QUICK_START.md        # This file
├── SYSTEM_DIAGRAM.html   # Visual architecture
└── public/
    └── index.html        # Frontend dashboard
```

## Getting Help

1. **Check the README.md** for full documentation
2. **Review ARCHITECTURE.md** for technical details
3. **Read DEPLOYMENT.md** for hosting options
4. **Open SYSTEM_DIAGRAM.html** in browser for visual architecture
5. **Visit https://docs.openstates.org** for API documentation

## Development Tips

### Enable Debug Logging

Add to server.js:
```javascript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

### View API Responses

Use browser DevTools:
1. Open browser (http://localhost:3001)
2. Press F12 to open DevTools
3. Go to Network tab
4. Click "Refresh" in dashboard
5. Click on API requests to see responses

### Test API Endpoints Directly

```bash
# Get bills
curl http://localhost:3001/api/bills | jq

# Get pipeline stats
curl http://localhost:3001/api/stats/pipeline | jq

# Search bills
curl "http://localhost:3001/api/search?q=education" | jq
```

## Feature Roadmap

Implemented ✅:
- Real-time bill tracking
- Pipeline visualization
- Summary statistics
- Filtering by chamber and status
- Search functionality
- Responsive design

Coming Soon 🚧:
- Bill detail pages
- Vote record display
- Legislator profiles
- Email notifications
- Historical data tracking
- Advanced analytics

## Support

If you run into issues:
1. Check troubleshooting section above
2. Verify your API key is valid
3. Make sure Node.js version is 18+
4. Ensure port 3001 is available
5. Review server logs for errors

## Success!

If you can see the dashboard at http://localhost:3001, you're all set! 🎉

The dashboard will automatically:
- Fetch Oklahoma bills from Open States API
- Display them in an interactive pipeline
- Update statistics in real-time
- Refresh data every 5 minutes

Enjoy tracking Oklahoma legislation! 🏛️
