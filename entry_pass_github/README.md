# GatePass — IIT Delhi Abu Dhabi

A real-time hostel exit & return management system for **KCA1**, **KCA2**, and **KCA3** hostels at IIT Delhi Abu Dhabi. Students submit leave requests from within their hostel (geolocation-verified), security staff approve/reject them, and everything updates live for all parties.

---

## Features

### For Students
- Submit a leave request (destination, room, bed, hostel) — geolocation confirms you are on campus
- Request entry when returning — staff at the entry hostel approves
- Track your active request and history in real time
- File cleanliness or maintenance reports (up to 3 per day)
- OTP-based login via institutional email (`@iitdabudhabi.ac.ae`)

### For Security Staff
- **Hostel-scoped access** — KCA1/KCA2/KCA3 staff only see their own hostel's requests
- Approve or reject exit requests
- Approve or reject entry requests (including cross-hostel returns)
- Mark a student as returned manually
- View live "Currently outside" board and full logs
- Export logs as CSV
- Update maintenance report status (`open` → `in_progress` → `resolved`)

### For Main Admin
- Full view across all three hostels
- Clear all gate-pass logs
- View and manage all maintenance reports

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router, TypeScript) |
| UI | React 19, custom CSS (no component library) |
| Database | [Upstash Redis](https://upstash.com/) — per-request atomic keys |
| Auth | `httpOnly` session cookie (iron-session style) |
| OTP Email | [otp-service-beta.vercel.app](https://otp-service-beta.vercel.app/) (free external API) |
| Geolocation | Browser `navigator.geolocation` API |
| Deployment | [Vercel](https://vercel.com/) |

---

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── page.tsx              # Entire client-side UI (single page app)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/        # OTP send & verify, session creation
│   │       │   ├── logout/       # Session destroy
│   │       │   └── me/           # Current session info
│   │       ├── requests/
│   │       │   ├── route.ts      # GET all, POST new, DELETE all (admin)
│   │       │   └── [id]/route.ts # PATCH: approve/reject exit & entry
│   │       └── reports/
│   │           └── route.ts      # GET & POST maintenance reports
│   └── lib/
│       ├── admin.ts              # Staff code resolution & scope logic
│       ├── email.ts              # Institutional email helper
│       ├── redis.ts              # All Redis operations (atomic per-key)
│       ├── session.ts            # Cookie session helpers
│       └── types.ts              # Shared TypeScript types
├── public/
│   └── iitd-seal.svg
├── next.config.ts                # Security headers & CSP
├── package.json
└── .env                          # Local environment variables (do not commit)
```

---

## Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- An [Upstash Redis](https://upstash.com/) database (free tier is enough)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/entry_pass_github.git
cd entry_pass_github
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env` and fill in your values:

```env
# Admin staff login codes (comma-separated for multiple)
GATEPASS_ADMIN_CODE=your_main_admin_code
GATEPASS_ADMIN_KCA1=kca1_staff_code
GATEPASS_ADMIN_KCA2=kca2_staff_code
GATEPASS_ADMIN_KCA3=kca3_staff_code

# Upstash Redis — use either pair
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...

# OR
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

NODE_ENV=development
```

> **Note:** OTP emails are sent via a free external API. No email configuration is required.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

1. Push to GitHub.
2. Import the repo in [Vercel](https://vercel.com/).
3. **Root Directory:** leave empty (project root is the app).
4. Add all environment variables in **Vercel → Settings → Environment Variables**:

| Variable | Description |
|---|---|
| `GATEPASS_ADMIN_CODE` | Main admin login code (sees all hostels) |
| `GATEPASS_ADMIN_KCA1` | KCA1 security staff code |
| `GATEPASS_ADMIN_KCA2` | KCA2 security staff code |
| `GATEPASS_ADMIN_KCA3` | KCA3 security staff code |
| `KV_REST_API_URL` | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Upstash Redis REST token |

> Staff codes can be comma-separated to allow multiple codes per hostel, e.g. `CODE1,CODE2`.

5. Deploy — Vercel auto-provisions HTTPS, which is required for the geolocation API.

---

## How Login Works

1. Student enters their **roll number** (e.g. `2023CSB1092`) and **first name**.
2. The app derives their institutional email (`rollnumber@iitdabudhabi.ac.ae`) and calls the [otp-service](https://otp-service-beta.vercel.app/) to send a 6-digit OTP.
3. Student enters the OTP → verified by the same external service → `httpOnly` session cookie is issued.
4. Staff log in using a secret **staff code** configured in environment variables — no OTP needed.

---

## Security

| Measure | Detail |
|---|---|
| Session cookie | `httpOnly`, `Secure`, `SameSite=Strict` — not accessible to JavaScript |
| All API routes | Require a valid session — 401 if unauthenticated |
| Staff scoping | Hostel staff can only read/write their own hostel's data |
| Admin code comparison | Constant-time `timingSafeEqual` to prevent timing attacks |
| Geolocation | Exit/entry requests require the user to be within 150 m of a hostel |
| Rate limiting | OTP requests: 5 per 15 min · Reports: 3 per day per student |
| Content Security Policy | Strict CSP in production; relaxed in dev to allow HMR |
| Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` |
| Exit curfew | Requests blocked between 12:00 AM – 5:00 AM (Abu Dhabi time) |
| Redis | Per-request atomic keys — no race conditions from concurrent approvals |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Send OTP or verify OTP & create session |
| `POST` | `/api/auth/logout` | Destroy session |
| `GET` | `/api/auth/me` | Get current session user |
| `GET` | `/api/requests` | List requests (scoped to role) |
| `POST` | `/api/requests` | Submit a new leave request (students) |
| `PATCH` | `/api/requests/:id` | Approve/reject exit or entry |
| `DELETE` | `/api/requests?confirm=yes` | Clear all logs (main admin only) |
| `GET` | `/api/reports` | List maintenance reports (scoped) |
| `POST` | `/api/reports` | File a report or update status |

---

## License

MIT

