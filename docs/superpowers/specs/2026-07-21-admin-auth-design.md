# Admin Authentication & Access Control — Design Spec

**Date:** 2026-07-21
**Status:** Approved (design), in implementation
**Scope:** Subsystem A of a 3-part effort. A = this doc. B = MongoDB hardening (auth + TLS). C = Domain + deployment for https://speccify.info. B and C are separate specs.

---

## 1. Goal

Replace the current admin login (username + bcrypt password → HS256 JWT in an httpOnly cookie, single hard-coded admin) with:

- **Passwordless email-OTP login** — code emailed from `AI@Automatorr.com`, 10-minute validity, resend supported.
- **RS256 JWT sessions** — 15-minute access token, silent rotation, 8-hour absolute session cap.
- **Role-based access control** — `superadmin` vs `admin`.
- **Two super-admin-only management pages** — Allowed Domains and Users.
- **Audit logging** of all access-control actions.

This affects the **admin area only**. The public Speccify site is untouched. Also renames the database `automatorr` → `speccify` (data migrated, tests verified).

## 2. What is removed

- `POST /api/admin/login` (password login) and `AdminLogin`'s password form.
- Config: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and the `hash-password` script.
- HS256 signing (`JWT_SECRET` for admin auth) — replaced by an RS256 keypair. (`JWT_SECRET` is not used elsewhere, so it is retired.)

## 3. Access model (confirmed)

Eligibility to sign in = **(email domain ∈ Allowed Domains) OR (email ∈ Users list)**.

- **Admin** — anyone eligible. Can use the dashboard (analytics, affiliate settings). Cannot manage domains or users.
- **Super-admin** — **exactly** `daniel.hardman@automatorr.com` and `abishai.bajaj@automatorr.com`. Seeded, protected from deletion/disable/downgrade. **Super-admin cannot be granted to anyone else** — the create/update user endpoints reject any attempt to set `role=superadmin`. Only super-admins may CRUD Allowed Domains and Users.
- On each successful login, upsert an `adminusers` record (`source: seed | invited | domain`, `lastLoginAt`) so the Users tab shows everyone with access, not only invited users.

## 4. Login flow

1. `/admin/*` is guarded; unauthenticated users are sent to `/admin/login`.
2. **Email step** — `POST /api/admin/auth/request-otp { email }`. Server normalizes (trim + lowercase), computes eligibility. **Always returns generic `200`** ("if eligible, a code was sent") to prevent enumeration; sends a code only when eligible.
3. Generate a 6-digit numeric code, store it **hashed** (sha256 + per-code salt) in `adminotps` with `expiresAt = now + 10 min`, `attempts = 0`. Send via the mailer (dev provider logs to server console).
4. **Code step** — `POST /api/admin/auth/verify-otp { email, code }`. Look up the latest live code for the email; compare hash; increment attempts; invalidate after 5 failed attempts. On success mark consumed, resolve role, open a session, set cookies, return `{ user: { email, role } }`.
5. **Resend** — re-call `request-otp`; the client re-enables the button after a 30s countdown; per-email and per-IP rate limits apply to both auth endpoints.

## 5. Session & token mechanics

- **Access token** — RS256 JWT, 15-min TTL, payload `{ sub: userId, email, role, sid: sessionId }`. In an httpOnly + Secure + SameSite=strict cookie (`sp_at`). Verified with the public key; algorithm pinned to `['RS256']`.
- **Refresh token** — opaque random (32 bytes, base64url), httpOnly + Secure + SameSite=strict cookie (`sp_rt`). Stored **hashed** (sha256) in `adminsessions` as a rotating *family*.
- **Silent rotation** — a client timer calls `POST /api/admin/auth/refresh` ~60s before the access token expires, and a fetch wrapper retries once on any `401` via the same endpoint. Refresh issues a new access token **and** a new refresh token in the same family; the previous refresh token is marked rotated.
- **Reuse detection** — presenting an already-rotated refresh token revokes the entire family (theft response) and forces re-login; the event is audited.
- **8-hour absolute cap** — each family carries `absoluteExpiresAt = login + 8h`. Refresh is refused past it (and past the per-token `expiresAt`) → client redirects to login for a fresh OTP.
- **Logout** — `POST /api/admin/auth/logout` revokes the family and clears cookies.

## 6. Data model — new collections

| Collection | Purpose | Key fields |
|---|---|---|
| `adminusers` | Admin identities + roles | `email` (unique, lc), `role` (`superadmin`\|`admin`), `status` (`active`\|`disabled`), `source` (`seed`\|`invited`\|`domain`), `displayName?`, `createdBy`, `lastLoginAt`, timestamps |
| `alloweddomains` | Email-domain allowlist | `domain` (unique, lc, e.g. `automatorr.com`), `note?`, `createdBy`, timestamps |
| `adminotps` | One-time login codes | `email` (lc), `codeHash`, `salt`, `expiresAt` (**TTL index**), `attempts`, `maxAttempts`, `consumedAt?`, `requestIp?` |
| `adminsessions` | Refresh-token families | `userId`, `familyId`, `tokenHash` (unique), `issuedAt`, `expiresAt`, `absoluteExpiresAt` (**TTL index**), `rotatedFromId?`, `revokedAt?`, `revokedReason?`, `userAgent?`, `ip?` |
| `adminauditlogs` | Access-control audit trail | `actorEmail?`, `actorUserId?`, `action` (enum), `targetType?`, `targetId?`, `metadata?`, `ip?`, `userAgent?`, `createdAt` (indexed) |

Audit `action` enum: `auth.otp_requested`, `auth.otp_failed`, `auth.login`, `auth.logout`, `auth.refresh_reuse`, `domain.create`, `domain.update`, `domain.delete`, `user.create`, `user.update`, `user.disable`, `user.delete`.

## 7. API surface (all under `/api/admin`)

**Auth (cookie-based, public):**
- `POST /auth/request-otp` `{ email }` → generic `200`
- `POST /auth/verify-otp` `{ email, code }` → sets cookies, `{ user }`
- `POST /auth/refresh` → rotates cookies, `{ user }`
- `POST /auth/logout` → revokes family, clears cookies
- `GET /auth/me` → `{ authenticated, user? }` (replaces `GET /admin/me`)

**Allowed Domains (super-admin):** `GET /allowed-domains`, `POST /allowed-domains`, `PATCH /allowed-domains/:id`, `DELETE /allowed-domains/:id`

**Users (super-admin):** `GET /users`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id`

**Existing (now behind `requireAuth`, unchanged behavior):** `GET /analytics`, `GET /analytics/builder`, `GET /affiliates`, `PUT /affiliates/:store`.

Guards: `requireAuth` (valid access token → `req.admin`), `requireSuperadmin` (role check). Mutations require a custom header (`X-CSRF: 1`) in addition to SameSite=strict as CSRF defense.

## 8. Frontend

- `/admin/login` — two-step email → OTP form; resend countdown; explicit error and rate-limit states.
- **AuthGate** wrapping `/admin/*` — calls `/auth/me` on mount; unauthenticated → redirect to login (no dashboard flash).
- **Auth context/hook** — holds `{ user }`, runs the silent-refresh timer, and provides the 401-retry fetch wrapper.
- Dashboard gains a nav: existing analytics view + **Allowed Domains** and **Users** tabs that render only for super-admins (enforced server-side too).
- **Allowed Domains** page — table + add / edit / remove.
- **Users** page — table (email, role, status, source, last login) + invite (role forced to `admin`) / disable / remove, with founder protection and last-super-admin guard (guard is moot since super-admin is locked, but enforced defensively).

## 9. Config / secrets (new env)

- `ADMIN_JWT_PRIVATE_KEY`, `ADMIN_JWT_PUBLIC_KEY` — RS256 PEM (value or path). A `generate-keys` script produces them.
- `MAILER_PROVIDER` = `console` | `smtp` (dev default `console`); `SMTP_HOST/PORT/USER/PASS/SECURE`; `OTP_FROM` (default `AI@Automatorr.com`).
- `SUPERADMIN_EMAILS` — comma-separated; seeds and protects the two founders (default set to the two known emails).
- Tunables (defaults per spec): `OTP_TTL_MIN=10`, `ACCESS_TTL_MIN=15`, `SESSION_MAX_HOURS=8`, `OTP_MAX_ATTEMPTS=5`, `OTP_RESEND_INTERVAL_SEC=30`.
- `MONGODB_URI` default → `mongodb://127.0.0.1:27017/speccify`.

## 10. Database rename (`automatorr` → `speccify`)

- A one-time migration script copies every collection from `automatorr` into `speccify` (preserving `_id`s); indexes are re-ensured by the models at boot. The old `automatorr` DB is left intact as a backup (not dropped) until confirmed.
- Update all references: `.env`, `server/.env`, `.env.example`, `config.ts` default, `README`, dev/demo server, and any test/seed references.
- Verify: full server test suite passes; app boots and serves data from `speccify`.

## 11. Security summary

Anti-enumeration on `request-otp` · OTP hashed at rest, 10-min TTL, ≤5 attempts, rate-limited + 30s resend throttle · refresh rotation with family-wide reuse detection · httpOnly + Secure + SameSite=strict cookies · CSRF defense (SameSite + required custom header on mutations) · RS256 with pinned algorithm · rate limits on auth endpoints · founder super-admins immutable · full audit trail. Rotating the pre-existing committed dev secrets is handled in Subsystem C before go-live; the RSA keypair is generated during this work.

## 12. Testing (vitest + supertest, matching the repo)

- **Unit:** OTP lifecycle (generate/verify/expiry/attempts), RS256 issue/verify + alg-pinning, refresh rotation + reuse detection, access-decision matrix (domain-only / user-only / neither / disabled), role guards, super-admin lock enforcement.
- **Integration:** full login → refresh → 8h-cap → logout; domain CRUD; user CRUD with super-admin guard + founder protection + `role=superadmin` rejection.
- **Regression:** existing server tests still pass after the DB rename and route/guard changes.

## 13. Out of scope (this spec)

MongoDB auth/TLS (Subsystem B). DNS, HTTPS/TLS certs, reverse proxy, production env, secret rotation, deploy runbook for https://speccify.info (Subsystem C).
