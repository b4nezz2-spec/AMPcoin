# Koyeb Deploy Guide

## Setup (2 minutes, no credit card)

### 1. Create Account
Go to **[koyeb.com](https://koyeb.com)** → Sign up with GitHub

### 2. Create App
1. Click **Create App**
2. Select **Docker** deployment
3. Connect your GitHub repo: `b4nezz2-spec/AMPcoin`
4. Fill in:

| Field | Value |
|-------|-------|
| **Name** | `ampcoin-backend` |
| **Dockerfile** | `./Dockerfile` |
| **Port** | `8080` |

5. Add **Environment Variables**:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | your Postgres connection string (from Supabase/Neon dashboard — never commit the real one) |
| `JWT_SECRET` | `SECRETKEY123` |
| `CLIENT_URL` | `https://ampcoin.co.uk` |
| `NODE_ENV` | `production` |

6. Click **Deploy**
7. Wait ~2 minutes for build
8. You get a URL like `https://ampcoin-backend-xxx.koyeb.app`

### 3. Update Frontend
Set `REACT_APP_API_URL` on Cloudflare Pages to your Koyeb URL.

## Free Tier Limits
- 1 always-on nano service (512MB RAM, 1 vCPU)
- No credit card needed
- No sleep/cold starts
- WebSocket support included
