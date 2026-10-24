# EventPilot — Deployment Guide (Render + Vercel)

This guide walks through deploying **EventPilot** to production using **Render** for the Fastify backend API and **Vercel** for the Vite React frontend, connected to your cloud **Neon PostgreSQL** database and **Google Gemini** LLM chain.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │          Vercel Edge CDN             │
                      │       (Vite React Frontend)          │
                      │   https://eventpilot.vercel.app      │
                      └──────────────────┬───────────────────┘
                                         │ HTTP REST & SSE
                                         ▼
                      ┌──────────────────────────────────────┐
                      │         Render Web Service           │
                      │        (Fastify Backend API)         │
                      │  https://eventpilot-api.onrender.com │
                      └──────────┬────────────────┬──────────┘
                                 │                │
                                 ▼                ▼
                      ┌────────────────────┐   ┌────────────────────┐
                      │  Neon PostgreSQL   │   │ Google Gemini API  │
                      │  (Cloud Database)  │   │  (3-Tier Fallback) │
                      └────────────────────┘   └────────────────────┘
```

---

## Part 1: Deploy Backend API to Render

### Option A: Using the Render Blueprint (Recommended)

1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **"New +"** in the top navigation and select **"Blueprint"**.
3. Connect your GitHub repository: [`https://github.com/bhavanshu-1112/EventPilot`](https://github.com/bhavanshu-1112/EventPilot).
4. Render will automatically detect [`render.yaml`](../render.yaml) at the root of the repository.
5. In the configuration screen, provide the secret environment variables:
   - **`DATABASE_URL`**: _(Your Neon connection string from `.env`)_
   - **`GEMINI_API_KEY`**: _(Your Gemini API key from `.env`)_
6. Click **"Apply"** to deploy. Render will build the monorepo and start the service.
7. Once deployed, copy your Render service URL (e.g., `https://eventpilot-api.onrender.com`).

### Option B: Manual Web Service Setup

If setting up as a standalone Web Service:

- **Environment**: Node
- **Build Command**: `pnpm install --no-frozen-lockfile && pnpm --filter @eventpilot/api build`
- **Start Command**: `pnpm --filter @eventpilot/api start`
- **Health Check Path**: `/healthz`
- **Environment Variables**:
  | Variable                  | Value                               |
  | :------------------------ | :---------------------------------- |
  | `NODE_ENV`                | `production`                        |
  | `HOST`                    | `0.0.0.0`                           |
  | `PORT`                    | `10000`                             |
  | `DATABASE_URL`            | _(Your Neon connection string)_     |
  | `LLM_PROVIDER`            | `gemini`                            |
  | `GEMINI_API_KEY`          | _(Your Gemini API key)_             |
  | `GEMINI_MODEL`            | `gemini-3.8-flash`                  |
  | `GEMINI_FALLBACK_MODEL`   | `gemini-2.5-flash`                  |
  | `GEMINI_FALLBACK_MODEL_2` | `gemini-2.5-flash-lite`             |
  | `LLM_MODE`                | `live`                              |
  | `CORS_ORIGIN`             | `*` _(or your Vercel frontend URL)_ |
  | `NOTIFY_MODE`             | `dry-run`                           |

---

## Part 2: Deploy Frontend Web App to Vercel

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **"Add New..."** -> **"Project"**.
3. Import the [`bhavanshu-1112/EventPilot`](https://github.com/bhavanshu-1112/EventPilot) repository.
4. In the **Project Settings**:
   - **Framework Preset**: Vite
   - **Root Directory**: `apps/web` (click Edit, select `apps/web`)
   - **Build Command**: `pnpm --filter @eventpilot/web build`
   - **Output Directory**: `dist`
5. Under **Environment Variables**, add:
   - **`VITE_API_URL`**: Your Render backend URL (e.g., `https://eventpilot-api.onrender.com`)
6. Click **"Deploy"**.

---

## Part 3: Verify the Live Deployment

1. **Verify Backend Health**:
   Visit `https://<your-render-url>.onrender.com/healthz` in your browser.  
   Expected response:

   ```json
   { "status": "ok", "timestamp": "2026-10-24T..." }
   ```

2. **Verify Frontend**:
   Open your Vercel URL (e.g., `https://eventpilot.vercel.app`).
   - Confirm that the pre-seeded events load from the Neon database.
   - Test **Stage 1 (Plan)**: Click "Generate Ideas" to verify live Gemini idea synthesis.
   - Test **Stage 2 (Source)**: Open a quote negotiation drawer.
   - Test **Stage 3 (Execute)**: Run a schedule disruption simulation.
