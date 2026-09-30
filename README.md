# ReachInbox Full-stack Email Job Scheduler

A production-grade email scheduler service and dashboard built as a hiring assignment for ReachInbox.ai. This system allows users to schedule bulk emails with specific delays, hourly rate limits, and persists jobs across server restarts without duplicating emails.

## 🚀 Features Implemented

### Backend
- **Scheduler**: Utilizes **BullMQ** (backed by Redis) to schedule and process delayed email jobs instead of using Node.js/OS cron jobs.
- **Persistence**: Employs a robust Database-first design (PostgreSQL via Prisma). Jobs are tracked in the database and synched to BullMQ. If the server restarts, BullMQ picks up delayed jobs seamlessly.
- **Rate Limiting**: Implements Redis-based counters (tracking hour_window + sender). When the global/sender hourly limit is hit, jobs are dynamically rescheduled into the next hour without dropping them.
- **Concurrency**: The BullMQ worker is configured with a concurrency limit (`WORKER_CONCURRENCY=5`). Multiple workers can run in parallel safely.
- **Slack Notifications**: Notifies users via a connected Slack webhook when a rate limit is hit.
- **Elasticsearch**: Emails are indexed into Elasticsearch allowing ultra-fast search functionality across subjects, bodies, and recipients.
- **Bull Board**: Exposes a real-time queue visibility dashboard at `/admin/queues`.

### Frontend
- **Login**: Implements a real Google OAuth login flow (no mock data). 
- **Dashboard Layout**: Includes a sidebar with the user's avatar, navigation, and a quick-connect Slack button.
- **Compose**: Allows users to set recipients, subject, body, and granular limits like `Delay between 2 emails` and `Hourly Limit`.
- **CSV Upload**: Users can upload `.csv` or `.txt` files directly into the compose "To" field; the frontend parses and extracts valid email addresses automatically.
- **Send Later**: A custom popover allows users to easily schedule emails using presets (e.g. "Tomorrow, 10:00 AM") or a custom date picker.
- **Tables**: Displays "Scheduled" and "Sent" emails with paginated data fetched directly from the backend (including Elasticsearch powered search).

---

## 🏗️ Architecture Overview

### How Scheduling Works
1. When the `/api/emails/schedule` API is hit, the backend calculates the exact timestamp for each email by staggering them using the provided `delaySeconds`.
2. The records are first saved to the **PostgreSQL Database** to act as the source of truth.
3. The records are then pushed to a **BullMQ** delayed queue. 
4. BullMQ handles sleeping and waking up the job at the precise `scheduledAt` timestamp without utilizing `setInterval` or `cron`.

### How Persistence on Restart is Handled
- BullMQ stores the state of the queue and all delayed jobs persistently in **Redis**.
- If the Node.js process crashes or restarts, it reconnects to Redis. Redis holds the state of the queue. Any jobs whose delay expired while the server was offline are immediately processed, and future jobs remain safely delayed. 
- Because jobs are stored in Redis (and mirrored in Postgres), no scheduled tasks are ever lost or restarted from scratch.

### How Rate Limiting & Concurrency are Implemented
- **Concurrency**: The worker is explicitly defined with `new Worker('emailQueue', processor, { concurrency: 5 })`. This ensures exactly 5 jobs are processed in parallel, preventing CPU/Network starvation under heavy load.
- **Delay**: Configured delays are respected by staggering the absolute `delay` milliseconds parameter pushed to BullMQ.
- **Hourly Limit**: Inside the worker, before an email is sent, we check a Redis key representing the current hour for that specific sender. If incrementing the key exceeds the `hourlyLimit`, the worker explicitly re-adds the job to the queue delayed by the remaining milliseconds until the next hour starts. It then triggers the Slack webhook to notify the user.

---

## 🛠️ Setup Instructions

### Prerequisites
- Node.js (v18+)
- Docker (for Postgres, Redis, and Elasticsearch)
- [Ethereal Email](https://ethereal.email/) (for SMTP credentials)

### 1. Database & Infra Setup
Spin up the required infrastructure using the provided Docker Compose file:
```bash
docker-compose up -d
```
*(This starts Postgres on `5432`, Redis on `6379`, and Elasticsearch on `9200`)*

### 2. Backend Setup
Open a terminal and navigate to the backend directory:
```bash
cd backend
npm install
```

**Environment Variables (`backend/.env`)**
Create a `.env` file and configure it:
```env
PORT=4000
DATABASE_URL=postgresql://reach:reach@localhost:5432/reachinbox
REDIS_URL=redis://localhost:6379
ELASTIC_URL=http://localhost:9200
JWT_SECRET=your_super_secret_key
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000

# Ethereal SMTP (Create account at ethereal.email)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your_ethereal_user
SMTP_PASS=your_ethereal_pass

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret

# Slack App Credentials
SLACK_CLIENT_ID=your_slack_id
SLACK_CLIENT_SECRET=your_slack_secret

WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
DEFAULT_MAX_EMAILS_PER_HOUR=200
SENDERS_PER_USER=3
```

**Run Migrations & Start Server**
```bash
# Apply database schema
npx prisma migrate dev

# Start the API server
npm run dev

# (In a separate terminal) Start the Queue Worker
npm run worker
```
*You can view the live queue dashboard at `http://localhost:4000/admin/queues`*

### 3. Frontend Setup
Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
npm install
npm run dev
```
The frontend will be available at `http://localhost:5173`. 
*(Note: Ensure the backend is running so the Google OAuth flow works successfully).*
