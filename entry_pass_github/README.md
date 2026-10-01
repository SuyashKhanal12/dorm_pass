# GatePass — IIT Delhi Abu Dhabi

Hostel exit / return for KCA1 · KCA2 · KCA3.

## Folder layout (required for Vercel)

```
package.json
next.config.ts
src/app/page.tsx
src/app/layout.tsx
src/app/api/...
src/lib/...
public/...
```

**Vercel Root Directory:** leave **empty** (repo root is the app).

## Env vars

| Variable | Role |
|----------|------|
| `GATEPASS_ADMIN_CODE` | Main admin |
| `GATEPASS_ADMIN_KCA1` | KCA1 staff |
| `GATEPASS_ADMIN_KCA2` | KCA2 staff |
| `GATEPASS_ADMIN_KCA3` | KCA3 staff |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Redis |

## Security

- httpOnly session cookies
- APIs require login
- Hostel-scoped staff access
