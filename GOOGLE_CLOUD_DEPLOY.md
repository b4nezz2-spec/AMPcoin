# Google Cloud Run Deploy Guide

## One-Time Setup

### 1. Create Free Supabase Database
1. Go to [supabase.com](https://supabase.com) → Sign up with GitHub
2. Click **New Project** → name it `ampcoin` → set a database password
3. Go to **Settings** → **Database** → copy the **Connection string** (URI format)
4. It looks like: `postgresql://postgres.xxxx:password@aws-0-region.pooler.supabase.com:6543/postgres`

### 2. Install Google Cloud CLI
```bash
# Windows (PowerShell)
(Invoke-WebRequest -Uri https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-windows-x86_64.zip -OutFile gcloud.zip); Expand-Archive gcloud.zip -DestinationPath $env:USERPROFILE; $env:PATH += ";$env:USERPROFILE\google-cloud-sdk\bin"
gcloud init
```
Or download from: https://cloud.google.com/sdk/docs/install

### 3. Create Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project → name it `ampcoin`
3. Enable these APIs:
   - Cloud Run API
   - Container Registry API
   - Cloud Build API

### 4. Migrate Data to Supabase
```bash
DATABASE_URL="postgresql://postgres.xxxx:password@aws-0-region.pooler.supabase.com:6543/postgres" node backend/migrateToPostgres.js
```

## Deploy

### Option A: Deploy from source (easiest)
```bash
gcloud run deploy ampcoin-backend \
  --source . \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=YOUR_SUPABASE_URL,JWT_SECRET=SECRETKEY123,CLIENT_URL=https://ampcoin.co.uk,NODE_ENV=production" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=2
```

### Option B: Build Docker image → deploy
```bash
# Build
docker build -t gcr.io/YOUR_PROJECT/ampcoin-backend .

# Push
docker push gcr.io/YOUR_PROJECT/ampcoin-backend

# Deploy
gcloud run deploy ampcoin-backend \
  --image gcr.io/YOUR_PROJECT/ampcoin-backend \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=YOUR_SUPABASE_URL,JWT_SECRET=SECRETKEY123,CLIENT_URL=https://ampcoin.co.uk,NODE_ENV=production"
```

### After deploy, you get a URL like:
`https://ampcoin-backend-xxxxxx-ew.a.run.app`

Set this as `REACT_APP_API_URL` on Cloudflare Pages.

## Free Tier Limits
- **Cloud Run**: 24,000 vCPU-seconds/month (~6.6 hours of 1 CPU)
- **Supabase**: 500MB database, 50,000 rows (free forever)
- **No credit card needed** for either

## Update Frontend
Set `REACT_APP_API_URL` on Cloudflare Pages to your Cloud Run URL.
