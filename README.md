# Oklahoma Bill Tracker - Proof of Concept

A real-time dashboard for tracking Oklahoma State Legislature bills through the legislative process, built with Express.js and the Open States API.

![Dashboard Preview](https://via.placeholder.com/800x400?text=Oklahoma+Bill+Tracker+Dashboard)

## Features

✅ **Real-time Bill Tracking** - Fetch live data from Oklahoma Legislature via Open States API  
✅ **Visual Pipeline** - Interactive visualization showing bills at each legislative stage  
✅ **Summary Statistics** - Quick overview of total, active, passed, and vetoed bills  
✅ **Filtering & Search** - Filter by chamber, status, and search by keywords  
✅ **Responsive Design** - Works on desktop, tablet, and mobile devices  
✅ **Auto-refresh** - Dashboard updates every 5 minutes automatically  

## Technology Stack

- **Backend**: Node.js + Express.js
- **API**: Open States API v3
- **Frontend**: Vanilla JavaScript + Tailwind CSS
- **Charts**: Chart.js
- **No Database Required** - Direct API integration (can be added later)

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Free Open States API key (get one at https://openstates.org/api/register/)

### Installation

1. **Clone or download this project**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API Key**
   
   Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Open States API key:
   ```
   OPEN_STATES_API_KEY=your_actual_api_key_here
   PORT=3001
   ```

4. **Start the server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to: http://localhost:3001

## Getting Your API Key

1. Go to https://openstates.org/api/register/
2. Create a free account
3. Request an API key from your profile
4. Copy the key to your `.env` file

**Note**: The free tier includes generous limits suitable for most projects.

## Project Structure

```
oklahoma-bill-tracker-poc/
├── server.js              # Express API server
├── package.json           # Dependencies
├── .env                   # Configuration (create from .env.example)
├── .env.example          # Environment template
├── ARCHITECTURE.md        # Technical architecture documentation
├── README.md             # This file
└── public/
    └── index.html        # Dashboard frontend
```

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard UI |
| `/api/bills` | GET | List bills with filters |
| `/api/bills/:id` | GET | Get single bill details |
| `/api/stats/pipeline` | GET | Pipeline stage statistics |
| `/api/stats/summary` | GET | Summary statistics |
| `/api/legislators` | GET | List Oklahoma legislators |
| `/api/search` | GET | Search bills by keyword |
| `/health` | GET | Health check |

### Query Parameters for `/api/bills`

- `session` - Filter by legislative session
- `chamber` - Filter by chamber (`upper` or `lower`)
- `status` - Filter by bill status
- `page` - Page number (default: 1)
- `per_page` - Results per page (default: 20)

### Example API Calls

```bash
# Get all bills
curl http://localhost:3001/api/bills

# Get bills in committee
curl http://localhost:3001/api/bills?status=committee

# Get Senate bills
curl http://localhost:3001/api/bills?chamber=upper

# Search bills
curl http://localhost:3001/api/search?q=education

# Get pipeline statistics
curl http://localhost:3001/api/stats/pipeline
```

## Bill Status Pipeline

The dashboard tracks bills through these stages:

1. **Introduced** - Bill filed with chamber
2. **Committee** - Assigned to committee
3. **Committee Approved** - Passed committee vote
4. **Floor Calendar** - Scheduled for floor vote
5. **Passed Chamber** - Passed first chamber
6. **Enrolled** - Passed both chambers
7. **Signed** - Governor signed
8. **Vetoed** - Governor vetoed

## Dashboard Features

### Summary Cards
- Total bills in current session
- Active bills (in progress)
- Passed bills (signed into law)
- Vetoed bills

### Pipeline Visualization
- Visual representation of bill flow
- Click any stage to filter bills
- Real-time counts for each stage
- Color-coded for easy scanning

### Bill List
- Paginated list of bills
- Shows bill number, title, status
- Latest action and date
- Sponsor information
- Click for more details (coming soon)

### Filters
- Filter by chamber (House/Senate)
- Filter by status
- Search by keywords
- Chamber breakdown statistics

## Customization

### Change Default Port

Edit `.env`:
```
PORT=8080
```

### Adjust Auto-refresh Interval

In `public/index.html`, find this line (near the bottom):
```javascript
setInterval(refreshData, 5 * 60 * 1000); // 5 minutes
```

Change `5` to your desired minutes.

### Modify Bills Per Page

In `server.js`, change the default `per_page` value:
```javascript
const { page = 1, per_page = 20 } = req.query; // Change 20 to desired amount
```

## Adding Database Support

This proof-of-concept connects directly to the Open States API. For a production application, you should:

1. Add PostgreSQL database
2. Implement data caching
3. Schedule periodic syncs
4. Store historical data

See `ARCHITECTURE.md` for the complete database schema and implementation details.

## Development Roadmap

### Phase 1: Core Features (Current POC)
- ✅ Basic bill listing
- ✅ Pipeline visualization
- ✅ Filtering and search
- ✅ Summary statistics

### Phase 2: Enhanced Features
- ⬜ Bill detail pages
- ⬜ Vote records display
- ⬜ Legislator profiles
- ⬜ Email alerts for bill updates
- ⬜ Bill text comparison

### Phase 3: Database Integration
- ⬜ PostgreSQL setup
- ⬜ Data caching layer
- ⬜ Scheduled sync jobs
- ⬜ Historical data tracking

### Phase 4: Advanced Features
- ⬜ User accounts
- ⬜ Saved bill lists
- ⬜ Custom alerts
- ⬜ API for third parties
- ⬜ Mobile app

## Troubleshooting

### "Failed to fetch bills" Error

**Cause**: Invalid or missing API key

**Solution**: 
1. Check your `.env` file has `OPEN_STATES_API_KEY` set
2. Verify the key is valid at https://openstates.org
3. Restart the server after updating `.env`

### No Bills Showing

**Cause**: API rate limiting or no bills in current session

**Solution**:
1. Check browser console for errors
2. Verify API is working: `curl http://localhost:3001/api/bills`
3. Try different filters

### Server Won't Start

**Cause**: Port already in use

**Solution**:
```bash
# Find process using port 3001
lsof -i :3001

# Kill the process or change PORT in .env
```

## Contributing

This is a proof-of-concept project. For production use, consider:

- Adding comprehensive error handling
- Implementing rate limiting
- Adding automated tests
- Setting up CI/CD pipeline
- Implementing proper logging
- Adding security headers

## License

MIT License - feel free to use this code for your own projects!

## Resources

- [Open States API Documentation](https://docs.openstates.org/api-v3/)
- [Oklahoma Legislature Website](https://www.oklegislature.gov/)
- [Express.js Documentation](https://expressjs.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the `ARCHITECTURE.md` file for technical details
- Consult the Open States API documentation

## Acknowledgments

- **Open States / Plural Policy** for providing free legislative data API
- **Oklahoma State Legislature** for maintaining public legislative records
- Built as a civic tech demonstration project

---

**Note**: This is a proof-of-concept. For production deployment, implement proper database caching, error handling, security measures, and monitoring as outlined in `ARCHITECTURE.md`.
