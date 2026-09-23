# AMPcoin Backend — Railway Deploy Guide

## Quick Setup

### 1. Create Railway Account
Go to [railway.app](https://railway.app) and sign up with GitHub.

### 2. Create PostgreSQL Database
- Click **New Project** → **Database** → **PostgreSQL**
- Once created, click the **Variables** tab
- Copy the `DATABASE_URL` value

### 3. Deploy Backend
- Click **New Project** → **GitHub Repo** → select `AMPcoin`
- Railway will auto-detect Node.js
- Go to **Variables** tab and add:

```
DATABASE_URL=        (paste from step 2)
PORT=5000
JWT_SECRET=SECRETKEY123
CLIENT_URL=https://ampcoin.co.uk
NODE_ENV=production
```

### 4. Migrate Data
Run this from your local machine to push existing data into PostgreSQL:

```bash
DATABASE_URL="postgres://postgres:password@host.railway.app:5432/railway" node backend/migrateToPostgres.js
```

### 5. Set Custom Domain
- Go to your backend service → **Settings** → **Networking**
- Click **Generate Domain** for a `.up.railway.app` URL
- Or add your custom domain

### 6. Update Frontend
Set `REACT_APP_API_URL` to your Railway backend URL (e.g., `https://ampcoin-backend.up.railway.app`)

## Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `DATABASE_URL` | `postgres://...` | PostgreSQL connection string (auto-set by Railway) |
| `PORT` | `5000` | Server port |
| `JWT_SECRET` | `SECRETKEY123` | JWT signing secret |
| `CLIENT_URL` | `https://ampcoin.co.uk` | Frontend URL for CORS |
| `NODE_ENV` | `production` | Enables production mode |

## Why Railway?

- **Free tier**: $5/month credit (enough for a small backend)
- **Persistent**: Data survives restarts, deploys, and sleep cycles
- **PostgreSQL included**: No separate database needed
- **Auto-deploys**: Push to GitHub → auto-deploys
- **No cold starts**: Stays running (unlike Back4App free tier)
- **Works as-is**: Your Express.js code runs without changes
"# gngo67gngo" 
