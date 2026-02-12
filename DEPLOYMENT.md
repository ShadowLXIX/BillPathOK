# Deployment Guide

This guide covers deploying the Oklahoma Bill Tracker to various hosting platforms.

## Table of Contents

1. [Vercel (Recommended)](#vercel-deployment)
2. [Railway](#railway-deployment)
3. [Render](#render-deployment)
4. [Heroku](#heroku-deployment)
5. [AWS (Advanced)](#aws-deployment)
6. [Environment Variables](#environment-variables)
7. [Custom Domain Setup](#custom-domain-setup)

---

## Vercel Deployment

**Best for**: Serverless deployment, automatic scaling, free tier available

### Prerequisites
- GitHub account
- Vercel account (free at vercel.com)

### Steps

1. **Push code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/oklahoma-bill-tracker.git
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to https://vercel.com
   - Click "New Project"
   - Import your GitHub repository
   - Configure build settings:
     - Build Command: (leave empty)
     - Output Directory: `public`
     - Install Command: `npm install`

3. **Add Environment Variables**
   - In Vercel dashboard, go to Settings → Environment Variables
   - Add: `OPEN_STATES_API_KEY` with your API key

4. **Deploy**
   - Click "Deploy"
   - Your site will be live at `https://your-project.vercel.app`

### Vercel Configuration

Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server.js"
    },
    {
      "src": "/(.*)",
      "dest": "public/$1"
    }
  ]
}
```

---

## Railway Deployment

**Best for**: Full Node.js apps, includes database options, simple deployment

### Steps

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize Project**
   ```bash
   railway init
   ```

4. **Add Environment Variables**
   ```bash
   railway variables set OPEN_STATES_API_KEY=your_key_here
   ```

5. **Deploy**
   ```bash
   railway up
   ```

6. **Generate Domain**
   ```bash
   railway domain
   ```

### Railway Configuration

Create `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Render Deployment

**Best for**: Free tier, automatic deploys from Git, simple setup

### Steps

1. **Push to GitHub** (if not already done)

2. **Create New Web Service**
   - Go to https://render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

3. **Configure Service**
   - Name: `oklahoma-bill-tracker`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: `Free`

4. **Add Environment Variables**
   - Click "Environment"
   - Add `OPEN_STATES_API_KEY`

5. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete

### Render Configuration

Create `render.yaml`:
```yaml
services:
  - type: web
    name: oklahoma-bill-tracker
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: OPEN_STATES_API_KEY
        sync: false
```

---

## Heroku Deployment

**Best for**: Traditional PaaS, well-documented, many addons

### Prerequisites
- Heroku CLI installed
- Heroku account

### Steps

1. **Login to Heroku**
   ```bash
   heroku login
   ```

2. **Create Heroku App**
   ```bash
   heroku create oklahoma-bill-tracker
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set OPEN_STATES_API_KEY=your_key_here
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

5. **Open App**
   ```bash
   heroku open
   ```

### Heroku Configuration

Create `Procfile`:
```
web: node server.js
```

---

## AWS Deployment

**Best for**: Enterprise deployments, full control, scalability

### Using AWS Elastic Beanstalk

1. **Install EB CLI**
   ```bash
   pip install awsebcli
   ```

2. **Initialize EB**
   ```bash
   eb init -p node.js oklahoma-bill-tracker
   ```

3. **Create Environment**
   ```bash
   eb create oklahoma-bill-tracker-env
   ```

4. **Set Environment Variables**
   ```bash
   eb setenv OPEN_STATES_API_KEY=your_key_here
   ```

5. **Deploy**
   ```bash
   eb deploy
   ```

### Using AWS Lambda + API Gateway

For serverless deployment, you'll need to adapt the Express app:

1. Install serverless framework:
   ```bash
   npm install -g serverless
   ```

2. Create `serverless.yml`:
   ```yaml
   service: oklahoma-bill-tracker
   
   provider:
     name: aws
     runtime: nodejs18.x
     environment:
       OPEN_STATES_API_KEY: ${env:OPEN_STATES_API_KEY}
   
   functions:
     api:
       handler: lambda.handler
       events:
         - http: ANY /
         - http: ANY /{proxy+}
   ```

3. Create `lambda.js`:
   ```javascript
   const serverless = require('serverless-http');
   const app = require('./server');
   
   module.exports.handler = serverless(app);
   ```

4. Deploy:
   ```bash
   serverless deploy
   ```

---

## Environment Variables

All deployments require these environment variables:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `OPEN_STATES_API_KEY` | Yes | Your Open States API key | `abc123...` |
| `PORT` | No | Server port (auto-set on most platforms) | `3001` |
| `NODE_ENV` | No | Environment (auto-set on most platforms) | `production` |

### Security Best Practices

1. **Never commit `.env` file to git**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use platform-specific secret management**
   - Vercel: Environment Variables in dashboard
   - Railway: `railway variables`
   - Render: Environment tab
   - Heroku: Config Vars
   - AWS: Parameter Store or Secrets Manager

3. **Rotate API keys regularly**

---

## Custom Domain Setup

### Vercel

1. Go to Project Settings → Domains
2. Add your domain
3. Update DNS records as instructed
4. SSL certificate automatically provisioned

### Railway

1. Go to project → Settings → Domains
2. Click "Add Custom Domain"
3. Add CNAME record to your DNS:
   ```
   CNAME: your-domain.com → your-project.up.railway.app
   ```

### Render

1. Go to service → Settings → Custom Domain
2. Add your domain
3. Update DNS with provided records
4. SSL automatically enabled

---

## Monitoring & Analytics

### Add Error Tracking (Sentry)

1. Install Sentry SDK:
   ```bash
   npm install @sentry/node
   ```

2. Initialize in `server.js`:
   ```javascript
   import * as Sentry from '@sentry/node';
   
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV
   });
   ```

### Add Analytics (Plausible)

Add to `public/index.html`:
```html
<script defer data-domain="yourdomain.com" src="https://plausible.io/js/script.js"></script>
```

---

## Performance Optimization

### Enable Caching

Add caching headers in `server.js`:
```javascript
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    res.set('Cache-Control', 'public, max-age=900'); // 15 minutes
  }
  next();
});
```

### Compress Responses

```bash
npm install compression
```

```javascript
import compression from 'compression';
app.use(compression());
```

### Rate Limiting

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

---

## Database Migration (Future Enhancement)

When adding PostgreSQL:

### Railway
```bash
railway add postgresql
railway variables
# Note the DATABASE_URL
```

### Render
1. Create new PostgreSQL instance
2. Copy connection string
3. Add to environment variables

### Heroku
```bash
heroku addons:create heroku-postgresql:hobby-dev
```

---

## Troubleshooting Deployments

### Build Fails

1. Check Node.js version compatibility
2. Verify all dependencies in `package.json`
3. Check build logs for specific errors

### App Crashes on Start

1. Check environment variables are set
2. Verify PORT is not hardcoded
3. Check logs: `heroku logs --tail` or platform equivalent

### API Key Not Working

1. Verify environment variable name is correct
2. Check the key is valid on Open States
3. Restart the application after setting variables

---

## Scaling Considerations

### Horizontal Scaling
- Use load balancer (ALB on AWS, automatic on Vercel)
- Multiple instances for high traffic

### Database Connection Pooling
- Use PgBouncer for PostgreSQL
- Connection pool size: `min: 2, max: 10`

### Caching Strategy
- Add Redis for API response caching
- Cache pipeline stats for 15 minutes
- Cache bill lists for 5 minutes

### CDN
- Use Cloudflare for static assets
- Enable on Vercel automatically

---

## Cost Estimates

### Free Tier Options
- **Vercel**: Free for hobby projects
- **Render**: Free tier available (services sleep after inactivity)
- **Railway**: $5 credit/month on free plan

### Paid Tier Estimates (Monthly)
- **Vercel Pro**: $20/month
- **Railway**: ~$5-20 depending on usage
- **Render**: $7/month for always-on
- **Heroku**: $7/month for hobby dyno
- **AWS**: ~$10-30 for t3.micro EC2 + RDS

### Cost Optimization
1. Use serverless for low traffic
2. Implement caching to reduce API calls
3. Use CDN for static assets
4. Schedule scaling down during off-hours

---

## Support & Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Render Documentation](https://render.com/docs)
- [Heroku Dev Center](https://devcenter.heroku.com)
- [AWS Documentation](https://docs.aws.amazon.com)
