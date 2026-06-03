# Deployment Guide — Vercel + GoDaddy Domain

## Prerequisites
- GitHub account with this repo pushed
- GoDaddy domain registered
- PostgreSQL database (Neon, Supabase, or Railway)

## Step 1: Database Setup

### Option A: Neon (Free, Recommended)
1. Go to https://neon.tech
2. Create a new project
3. Copy the connection string (looks like `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/db`)
4. Run Prisma migrations:
   ```bash
   cd frontend
   npx prisma migrate deploy
   npx prisma db seed
   ```

### Option B: Supabase (Free)
1. Go to https://supabase.com
2. Create a new project
3. Go to Project Settings → Database → Connection string
4. Use the "Direct connection" string
5. Enable pgvector: Go to SQL Editor → run `CREATE EXTENSION IF NOT EXISTS vector;`
6. Run Prisma migrations as above

## Step 2: Vercel Setup

1. Go to https://vercel.com and sign in with GitHub
2. Click "Add New Project"
3. Import your GitHub repository
4. Set these environment variables (Settings → Environment Variables):

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Your Neon/Supabase connection string |
   | `NEXTAUTH_URL` | `https://yourdomain.com` |
   | `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` locally |
   | `AZURE_AD_CLIENT_ID` | Your Azure app ID |
   | `AZURE_AD_CLIENT_SECRET` | Your Azure secret |
   | `AZURE_AD_TENANT_ID` | Your tenant ID |
   | `GOOGLE_CLIENT_ID` | Your Google OAuth client ID |
   | `GOOGLE_CLIENT_SECRET` | Your Google OAuth secret |
   | `SUPER_ADMIN_EMAIL` | Admin email |
   | `MASTER_ADMIN_EMAIL` | Teacher email |
   | `OPENAI_API_KEY` | Your OpenAI key |
   | `GEMINI_API_KEY` | Your Gemini key |
   | `MATHPIX_APP_ID` | Your Mathpix app ID |
   | `MATHPIX_APP_KEY` | Your Mathpix app key |

   Set all as "Production", "Preview", and "Development".

5. Click "Deploy"

## Step 3: GoDaddy DNS Configuration

1. Log in to GoDaddy → DNS Management for your domain
2. Delete any existing A records or CNAME for `@` and `www`
3. Add these records:

   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | CNAME | `@` | `cname.vercel-dns.com` | 1 hour |
   | CNAME | `www` | `cname.vercel-dns.com` | 1 hour |

4. Wait 15-60 minutes for DNS propagation

## Step 4: Connect Domain in Vercel

1. In Vercel → Your Project → Settings → Domains
2. Add your domain (e.g., `yourdomain.com`)
3. Add `www.yourdomain.com` as well
4. Vercel will automatically provision SSL (HTTPS)

## Step 5: Update Azure AD Redirect URIs

If using Azure AD SSO:
1. Go to Azure Portal → App Registrations → Your app
2. Under "Redirect URIs", add:
   - `https://yourdomain.com/api/auth/callback/azure-ad`
   - `http://localhost:3000/api/auth/callback/azure-ad` (for local dev)

## Step 6: Update Google OAuth Redirect URIs

If using Google OAuth:
1. Go to Google Cloud Console → Credentials → OAuth 2.0 Client ID
2. Under "Authorized redirect URIs", add:
   - `https://yourdomain.com/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (for local dev)

## Step 7: Verify Deployment

1. Visit `https://yourdomain.com`
2. Check HTTPS is working (padlock icon)
3. Test login flows
4. Check security headers using https://securityheaders.com

## Troubleshooting

### DNS not propagating
- Use `nslookup yourdomain.com` to check
- Can take up to 48 hours (usually 15-60 min)

### Build fails on Vercel
- Check Vercel Deployments → View Build Logs
- Ensure all env vars are set correctly
- DATABASE_URL must be a valid PostgreSQL URL

### API routes returning 500
- Check Vercel Function Logs
- Verify database connectivity (connection string, IP allowlist)
- Ensure Prisma migrations are applied

### Azure AD SSO fails
- Verify redirect URIs in Azure match your domain
- Check tenant ID is correct
- Ensure app has required API permissions
