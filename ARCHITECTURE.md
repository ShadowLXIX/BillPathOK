# Oklahoma Bill Tracker - Technical Architecture

## System Overview

A full-stack web application that tracks Oklahoma state legislature bills in real-time, providing visual dashboards showing bill progress through the legislative process.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   React UI   │  │  Dashboard   │  │  Bill Detail Page  │    │
│  │  Components  │  │   Visualize  │  │                    │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
│         │                  │                     │               │
│         └──────────────────┴─────────────────────┘               │
│                            │                                     │
│                    ┌───────▼────────┐                           │
│                    │  State Manager │                           │
│                    │  (React Query) │                           │
│                    └───────┬────────┘                           │
└────────────────────────────┼──────────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │   API Gateway    │
                    │   (REST/JSON)    │
                    └────────┬─────────┘
                             │
┌────────────────────────────┼──────────────────────────────────┐
│                    Backend Layer                                │
│                    ┌────────▼─────────┐                         │
│                    │   Express API    │                         │
│                    │    Server        │                         │
│                    └────────┬─────────┘                         │
│                             │                                   │
│         ┌───────────────────┼───────────────────┐              │
│         │                   │                   │              │
│  ┌──────▼──────┐  ┌─────────▼────────┐  ┌──────▼────────┐    │
│  │  Data Sync  │  │  Bill Processing │  │  Cache Layer  │    │
│  │   Service   │  │     Service      │  │    (Redis)    │    │
│  └──────┬──────┘  └─────────┬────────┘  └───────────────┘    │
│         │                   │                                  │
└─────────┼───────────────────┼──────────────────────────────────┘
          │                   │
          │         ┌─────────▼──────────┐
          │         │   PostgreSQL DB    │
          │         │                    │
          │         │  - Bills           │
          │         │  - Actions         │
          │         │  - Legislators     │
          │         │  - Votes           │
          │         └────────────────────┘
          │
┌─────────▼──────────────────────────────────────────────────────┐
│                    External Data Sources                        │
│                                                                 │
│              ┌──────────────────────────┐                      │
│              │   Open States API v3     │                      │
│              │  (v3.openstates.org)     │                      │
│              └──────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: React Router v6
- **UI Components**: 
  - Tailwind CSS for styling
  - Shadcn/ui for component library
  - Recharts for data visualization
  - D3.js for custom pipeline visualization
- **Data Fetching**: Axios with React Query

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **API Client**: Axios for Open States API calls
- **Validation**: Zod for request/response validation
- **Caching**: Redis for API response caching
- **Job Queue**: Bull for scheduled data sync jobs

### Database
- **Primary DB**: PostgreSQL 15+
- **ORM**: Prisma
- **Migrations**: Prisma Migrate
- **Connection Pooling**: PgBouncer

### Infrastructure
- **Hosting**: 
  - Frontend: Vercel or Netlify
  - Backend: Railway, Render, or AWS
  - Database: Supabase, Railway, or managed PostgreSQL
- **CI/CD**: GitHub Actions
- **Monitoring**: Sentry for error tracking
- **Analytics**: Plausible or Simple Analytics

## Database Schema

```sql
-- Bills table
CREATE TABLE bills (
  id SERIAL PRIMARY KEY,
  openstates_id VARCHAR(255) UNIQUE NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  identifier VARCHAR(50) NOT NULL, -- e.g., "HB 1234"
  title TEXT NOT NULL,
  description TEXT,
  classification VARCHAR(50), -- bill, resolution, etc.
  subject JSONB, -- array of subjects
  current_status VARCHAR(100),
  current_chamber VARCHAR(20), -- upper, lower, executive
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  first_action_date DATE,
  latest_action_date DATE,
  INDEX idx_identifier (identifier),
  INDEX idx_session (session_id),
  INDEX idx_status (current_status)
);

-- Bill Actions (status changes)
CREATE TABLE bill_actions (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  classification VARCHAR(100), -- introduction, committee-passage, passage, etc.
  chamber VARCHAR(20),
  order_index INTEGER, -- order within the bill's timeline
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_bill_date (bill_id, date)
);

-- Legislators
CREATE TABLE legislators (
  id SERIAL PRIMARY KEY,
  openstates_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  party VARCHAR(50),
  chamber VARCHAR(20),
  district VARCHAR(50),
  image_url TEXT,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bill Sponsorships
CREATE TABLE sponsorships (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  legislator_id INTEGER REFERENCES legislators(id),
  name VARCHAR(255), -- fallback if legislator not in DB
  classification VARCHAR(50), -- primary, cosponsor
  entity_type VARCHAR(50), -- person, organization
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_bill (bill_id)
);

-- Votes
CREATE TABLE votes (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  openstates_id VARCHAR(255) UNIQUE,
  date DATE,
  motion_text TEXT,
  motion_classification VARCHAR(100),
  result VARCHAR(50), -- passed, failed
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
  option VARCHAR(20), -- yes, no, abstain, absent
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sync metadata (track last sync times)
CREATE TABLE sync_metadata (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) UNIQUE, -- 'bills', 'legislators', etc.
  last_sync_at TIMESTAMP,
  last_success_at TIMESTAMP,
  status VARCHAR(50), -- success, error, in_progress
  error_message TEXT
);
```

## API Endpoints

### Public API (Frontend-facing)

```
GET  /api/bills                     - List bills with filters
GET  /api/bills/:identifier         - Get single bill details
GET  /api/bills/:identifier/actions - Get bill action history
GET  /api/bills/:identifier/votes   - Get bill votes
GET  /api/legislators               - List legislators
GET  /api/legislators/:id           - Get legislator details
GET  /api/stats                     - Dashboard statistics
GET  /api/stats/pipeline            - Bill counts by status
GET  /api/search                    - Search bills
```

### Query Parameters for /api/bills
```
?session=2024          - Filter by session
?status=committee      - Filter by current status
?chamber=upper         - Filter by chamber (upper/lower)
?subject=education     - Filter by subject
?sponsor=Smith         - Filter by sponsor name
?page=1                - Pagination
?limit=20              - Results per page
?sort=latest_action    - Sort by field
```

### Internal API (Admin/Sync)

```
POST /api/sync/bills           - Trigger bill sync
POST /api/sync/legislators     - Trigger legislator sync
GET  /api/sync/status          - Get sync status
```

## Data Sync Strategy

### Initial Data Load
1. Fetch all bills for current Oklahoma session
2. Fetch all legislators
3. For each bill, fetch detailed actions and votes
4. Store in PostgreSQL with timestamps

### Incremental Updates
1. **Scheduled sync** (via cron job):
   - Run every 4 hours during session
   - Run daily during off-session
2. **Process**:
   - Query Open States for bills updated since last sync
   - Update existing records or insert new ones
   - Cache results in Redis (15-minute TTL)
3. **Optimization**:
   - Use bill `updated_at` field from Open States
   - Only fetch full bill details if updated
   - Batch database operations

## Open States API Integration

### Authentication
```typescript
const config = {
  baseURL: 'https://v3.openstates.org',
  headers: {
    'X-API-KEY': process.env.OPEN_STATES_API_KEY
  }
};
```

### Key Endpoints Used

```
GET /jurisdictions                    - Get Oklahoma jurisdiction info
GET /bills?jurisdiction=ok&session=X  - List bills
GET /bills/{bill_id}                  - Get bill details
GET /bills/{bill_id}?include=votes    - Bill with votes included
GET /bills/{bill_id}?include=sponsorships - Bill with sponsors
GET /people?jurisdiction=ok           - List legislators
```

## Bill Status Pipeline Stages

Based on Oklahoma legislative process:

1. **Pre-filed** - Bill drafted, not yet introduced
2. **Introduced** - Filed with chamber
3. **Committee** - Assigned to committee
4. **Committee Approved** - Passed committee vote
5. **Floor Calendar** - Scheduled for floor vote
6. **Passed Chamber** - Passed first chamber (House or Senate)
7. **Second Chamber** - Sent to other chamber
8. **Conference** - Conference committee (if needed)
9. **Enrolled** - Passed both chambers
10. **Governor** - Sent to governor
11. **Signed** - Governor signed
12. **Became Law** - Effective date reached
13. **Vetoed** - Governor vetoed
14. **Dead** - Failed or killed

## Visual Dashboard Features

### Main Dashboard
1. **Pipeline Visualization**:
   - Horizontal flow chart showing all stages
   - Bill counts in each stage
   - Color-coded by status
   - Click to filter bills in that stage

2. **Summary Cards**:
   - Total bills this session
   - Active bills
   - Bills passed
   - Bills vetoed

3. **Recent Activity Feed**:
   - Latest bill actions
   - Real-time updates
   - Sortable and filterable

4. **Filters Panel**:
   - By chamber (House/Senate)
   - By subject/topic
   - By sponsor
   - By date range

### Bill Detail Page
1. **Bill Header**:
   - Bill number and title
   - Current status badge
   - Sponsors
   - Last action date

2. **Timeline View**:
   - Vertical timeline of all actions
   - Date stamps
   - Action descriptions
   - Chamber indicators

3. **Vote History**:
   - Vote results
   - Individual legislator votes
   - Vote breakdowns

4. **Full Text**:
   - Link to bill text
   - Version history

## Caching Strategy

### Redis Cache Layers

1. **API Response Cache** (15 min TTL):
   - Key: `bills:list:{query_hash}`
   - Key: `bill:{identifier}`
   
2. **Computed Statistics** (1 hour TTL):
   - Key: `stats:pipeline`
   - Key: `stats:summary`

3. **Search Results** (30 min TTL):
   - Key: `search:{query_hash}`

## Performance Optimizations

1. **Database**:
   - Proper indexing on frequently queried fields
   - Materialized views for complex statistics
   - Connection pooling

2. **API**:
   - Response compression (gzip)
   - Pagination for all list endpoints
   - ETag headers for conditional requests

3. **Frontend**:
   - Code splitting by route
   - Lazy loading of bill details
   - Virtual scrolling for long lists
   - Image optimization

## Security Considerations

1. **API Key Management**:
   - Store Open States API key in environment variables
   - Never expose in frontend code
   - Rotate periodically

2. **Rate Limiting**:
   - Implement rate limiting on public API
   - Respect Open States API rate limits
   - Use exponential backoff on retries

3. **Data Validation**:
   - Validate all inputs with Zod
   - Sanitize user inputs
   - SQL injection prevention via ORM

## Monitoring & Logging

1. **Application Metrics**:
   - API response times
   - Database query performance
   - Cache hit rates
   - Sync job success/failure

2. **Error Tracking**:
   - Sentry for backend errors
   - Frontend error boundaries
   - Structured logging

3. **Alerts**:
   - Sync failures
   - API downtime
   - High error rates

## Development Workflow

1. **Local Development**:
   ```
   # Backend
   cd backend
   npm install
   npm run dev
   
   # Frontend
   cd frontend
   npm install
   npm run dev
   ```

2. **Environment Variables**:
   ```
   OPEN_STATES_API_KEY=your_key_here
   DATABASE_URL=postgresql://...
   REDIS_URL=redis://...
   ```

3. **Testing**:
   - Unit tests with Jest
   - Integration tests for API endpoints
   - E2E tests with Playwright

## Deployment Strategy

1. **CI/CD Pipeline**:
   - Run tests on every PR
   - Automatic deployment on merge to main
   - Database migrations run automatically

2. **Environments**:
   - Development (local)
   - Staging (preview deployments)
   - Production

## Future Enhancements

1. **Email Alerts**: Subscribe to bill updates
2. **Bill Comparison**: Compare bill versions
3. **Advanced Search**: Full-text search across bill text
4. **Mobile App**: React Native app
5. **Public API**: Expose our own API for others
6. **AI Summaries**: Summarize bill text with AI
7. **Impact Analysis**: Show related bills and legislation
