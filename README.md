# CloudMeet

A simple, self-hosted meeting scheduler built on Cloudflare. Open-source Calendly alternative with Google Calendar integration.

![CloudMeet Booking Page](static/screenshot.png)

**[Live Demo](https://meet.klappe.dev/cloudmeet)**

## Features

- Google Calendar integration with automatic event creation
- Customizable availability and working hours
- Multiple event types (30 min, 1 hour, etc.)
- Configurable email notifications (confirmation, cancellation, reminders)
- Email settings dashboard to enable/disable and customize emails
- One-click deploy and update via GitHub Actions
- Runs entirely on Cloudflare's free tier

## Quick Start

### 1. Create Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Select **Edit Cloudflare Workers** template
4. Under **Account Resources**, select your account
5. Click **+ Add more** and add: **Account → D1 → Edit**
6. Click **Continue to summary** → **Create Token**
7. Copy the token for step 4

### 2. Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Go to **APIs & Services** > **Library** > Enable **Google Calendar API**
4. Go to **APIs & Services** > **Credentials**
5. Click **Create Credentials** > **OAuth 2.0 Client ID**
6. Application type: **Web application**
7. Add authorized redirect URI: `https://YOUR-PROJECT.pages.dev/auth/callback`
   - Replace `YOUR-PROJECT` with your Cloudflare Pages project name (you'll get this URL after first deploy, or use your custom domain if you already have one)
   - You can add multiple redirect URIs, so add both the default and custom domain if needed
8. Save your **Client ID** and **Client Secret** for step 4

### 3. Create your repository

Click **Use this template** > **Create a new repository**.

### 4. Add Repository Secrets

Go to your new repo's **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.

Add these secrets (click "New repository secret" for each one):

| Secret | Required | Description |
|--------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Your Cloudflare API token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your [Cloudflare Account ID](https://dash.cloudflare.com) (right sidebar) |
| `ADMIN_EMAIL` | Yes | Your Google email (only this account can login) |
| `JWT_SECRET` | Yes | Random string ([generate one](https://generate-secret.vercel.app/32)) |
| `APP_URL` | Yes | Your app URL (e.g., `https://YOUR-PROJECT.pages.dev` or your custom domain) |
| `GOOGLE_CLIENT_ID` | Yes | From step 2 (ends with `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Yes | From step 2 |
| `EMAILIT_API_KEY` | No | [Emailit](https://emailit.com) API key for booking emails |
| `EMAIL_FROM` | No | From address (e.g., `noreply@yourdomain.com`) |
| `CRON_SECRET` | No | Secret for securing reminder cron endpoint |

### 5. Deploy

Go to **Actions** > **Deploy to Cloudflare Pages** > **Run workflow** > **Run workflow**.

Your app will be live at `https://YOUR-PROJECT.pages.dev`.

### Custom Domain (Optional)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) > **Pages** > **cloudmeet** > **Custom domains**
2. Add your domain
3. Update `APP_URL` secret to your new domain
4. Update redirect URI in [Google Cloud Console](https://console.cloud.google.com/) to `https://yourdomain.com/auth/callback`
5. Re-run the deploy workflow

## Updating

To get the latest updates from the template and deploy:

1. Go to **Actions** > **Sync and Deploy** > **Run workflow** > **Run workflow**

This will sync with the upstream CloudMeet template and automatically deploy to Cloudflare.

Alternatively, you can run **Upstream Sync** and **Deploy to Cloudflare Pages** separately.

If sync fails with a permissions error, [create a personal access token](https://github.com/settings/tokens/new) with `Contents` and `Workflows` permissions, and paste it in the token field when running the workflow.

## Email Reminders

Email reminders are automatically enabled when you deploy. A Cloudflare Worker runs every 5 minutes to check for and send scheduled reminders (24h, 1h, 30min before meetings).

To enable reminders:
1. Add a `CRON_SECRET` to your GitHub secrets (any random string)
2. Re-deploy via **Actions** > **Deploy to Cloudflare Pages**

The cron worker is deployed automatically alongside the main app.

## Local Development

```bash
cp .env.example .dev.vars  # Add your credentials
npm install
npm run db:init
npm run dev
```

## License

MIT
