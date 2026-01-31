# Analytics map interaction

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/hakimovh755-gmailcoms-projects/v0-analytics-map-interaction)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/Lhr9GmEW8De)

## Overview

This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

## Deployment

Your project is live at:

**[https://vercel.com/hakimovh755-gmailcoms-projects/v0-analytics-map-interaction](https://vercel.com/hakimovh755-gmailcoms-projects/v0-analytics-map-interaction)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/Lhr9GmEW8De](https://v0.app/chat/Lhr9GmEW8De)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Local development: KPI cards (Dashboard)

The KPI cards (Portfolio Value at Risk, Yield Anomaly, Basis Risk) load data from a separate Python backend. To see real data locally:

1. From the project root, run the dashboard API (port 8000):
   ```bash
   cd backend/services/dashboard
   pip install -r requirements.txt
   uvicorn app:app --reload --port 8000
   ```
2. Keep the Next.js app running (`pnpm dev`). It will request `http://localhost:8000/dashboard/metrics` by default. Override with `NEXT_PUBLIC_DASHBOARD_API_URL` in `.env.local` if needed.
