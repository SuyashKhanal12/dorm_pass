# GatePass

Hostel exit and return passes for **IIT Delhi Abu Dhabi**. Students request to leave from inside their hostel, with their location verified by GPS. Staff at KCA1, KCA2 and KCA3 approve requests in real time, and everyone sees updates within seconds.

## Features

**Students**
- Request to leave with a destination, room and bed. The hostel is detected from GPS.
- Check back in at any of the three hostels. Staff there approve the return.
- See the current trip with a live approval countdown, plus full history.
- Report cleanliness or maintenance issues, up to 3 per day.
- Sign in with a one-time code sent to their institutional email.

**Hostel staff (KCA1, KCA2, KCA3)**
- See and act only on their own hostel's requests.
- Approve or reject exit and check-in requests, including returns from another hostel.
- Mark a student as returned manually. Students outside for more than 8 hours are flagged as late.
- Search, sort and filter the logs, and export them as CSV.
- Move reports through `open`, `in progress` and `resolved`.

**Main admin**
- Everything above across all three hostels.
- Clear all logs.

## Design

The interface follows an Apple-inspired visual language.

| Element | Choice |
|---|---|
| Canvas | `#F5F5F7`, with white cards at a 20px radius |
| Glass | Used only on layers that float above content: the header, mobile tab bar, location card, toasts and dialogs |
| Type | SF Pro on Apple devices, Inter everywhere else; sentence case throughout |
| Accent | IIT Delhi deep red `#8B0000` |
| Controls | 52px buttons and inputs, 14px radius, soft gray fills with minimal borders |
| Icons | [Lucide](https://lucide.dev/) |
| Status | Small tinted pills that carry a text label, never color alone |
| Motion | 150 to 250 ms, disabled under `prefers-reduced-motion` |

All tokens live at the top of `src/app/globals.css`.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) and TypeScript |
| UI | React 19, hand-written CSS, [lucide-react](https://lucide.dev/) |
| Data | [Upstash Redis](https://upstash.com/), one key per request so approvals are atomic |
| Sessions | Random session ID in an `httpOnly` cookie, payload stored in Redis for 7 days |
| One-time codes | [otp-service-beta.vercel.app](https://otp-service-beta.vercel.app/), an external service |
| Location | Browser Geolocation API |
| Hosting | [Vercel](https://vercel.com/) |

## Project structure

```
src/
├── app/
│   ├── layout.tsx            Metadata, viewport, fonts
│   ├── page.tsx              Session, polling and routing between views
│   ├── globals.css           Design tokens and every style
│   └── api/
│       ├── auth/             login (send and verify code), logout, me
│       ├── requests/         GET, POST, DELETE; [id] handles PATCH actions
│       └── reports/          GET, POST (file a report, update status)
├── components/
│   ├── LoginScreen.tsx       Roll number, first name, six-cell code entry
│   ├── AppHeader.tsx         Header, desktop tabs, mobile tab bar
│   ├── StudentView.tsx       Location, current trip, exit form, history
│   ├── StaffViews.tsx        Leave requests, currently outside, logs
│   ├── ReportsView.tsx       Cleanliness and maintenance reports
│   └── ui.tsx                Pill, fields, toast, dialog, countdown
└── lib/
    ├── admin.ts              Staff access-code check (server only)
    ├── scope.ts              Hostel scoping rules (safe for the browser)
    ├── rules.ts              Timeouts, late threshold, exit curfew
    ├── roll.ts               Roll number rule
    ├── redis.ts              Redis client and operations
    ├── session.ts            Cookie session helpers
    ├── geo.ts                Hostel geofences
    ├── useHostelLocation.ts  Geolocation hook
    ├── format.ts, csv.ts     Display formatting and CSV export
    ├── email.ts              Institutional email address
    └── types.ts              Shared types
```

## Getting started

Requires Node.js 18.18 or later and an Upstash Redis database.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Location access needs HTTPS or `localhost`.

### Environment variables

| Variable | Purpose |
|---|---|
| `GATEPASS_ADMIN_CODE` | Main admin access code, sees all hostels |
| `GATEPASS_ADMIN_KCA1` | KCA1 staff access code |
| `GATEPASS_ADMIN_KCA2` | KCA2 staff access code |
| `GATEPASS_ADMIN_KCA3` | KCA3 staff access code |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis REST credentials |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Alternative names for the same credentials |
| `OTP_SERVICE_URL` | Optional. Overrides the default one-time-code service |

Staff codes accept a comma-separated list, for example `CODE1,CODE2`.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |

## Deploying to Vercel

1. Push to GitHub and import the repository in Vercel. Leave the root directory empty.
2. Add the environment variables above under **Settings, Environment Variables**.
3. Deploy. Vercel provides the HTTPS that the Geolocation API requires.

## How sign-in works

**Students**
1. Enter a roll number and first name. A roll number is 4 to 32 characters: letters only (`ABCD`), or letters mixed with numbers (`2023CSB1092`). It must contain at least one letter.
2. A 6-digit code is sent to `rollnumber@iitdabudhabi.ac.ae`.
3. Enter the code to sign in. The first successful sign-in links the first name to the roll number, and later sign-ins must match it.

**Staff** enter their access code in the roll number field, plus their name. No email code is needed.

## Rules

| Rule | Value |
|---|---|
| Approval window | Unapproved exit and check-in requests expire after 3 minutes |
| Hostel geofence | Requests require the device to be within 150 m of a hostel |
| Exit curfew | Exit requests are closed from 12:00 AM to 5:00 AM, Abu Dhabi time |
| Late flag | Outside for more than 8 hours |
| Log retention | Returned trips are removed 7 days after check-in |
| Rate limits | 5 code requests per roll number per 15 minutes; 3 reports per student per day |

## Security

- The session cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production.
- Every API route requires a valid session and returns 401 otherwise.
- Hostel staff can only read and change their own hostel's data. The server enforces this independently of the UI.
- Staff codes are compared in constant time.
- Spreadsheet formula characters are neutralised in CSV exports.
- A strict Content Security Policy and standard security headers are set in `next.config.ts`. The policy relaxes in development so hot reload works.

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Send a code, or verify it and start a session |
| `POST` | `/api/auth/logout` | End the session |
| `GET` | `/api/auth/me` | Current session user |
| `GET` | `/api/requests` | List requests, scoped to the signed-in role |
| `POST` | `/api/requests` | Create an exit request (students) |
| `PATCH` | `/api/requests/:id` | Approve, reject, request entry, or mark returned |
| `DELETE` | `/api/requests?confirm=yes` | Clear all logs (main admin) |
| `GET` | `/api/reports` | List reports, scoped to the signed-in role |
| `POST` | `/api/reports` | File a report, or update a report's status (staff) |

## License

MIT
