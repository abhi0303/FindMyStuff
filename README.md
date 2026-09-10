# FindMyStuff — API

> You kept it somewhere. FindMyStuff remembers where.

Log what you own and where you keep it, then find it months later by name — and share
a house with family without sharing everything in it.

```
Place (home / office / locker)
  └── Storage tree (Bedroom → Almirah → Top shelf → Blue box)
        └── Items (Passport, Type-C cable, Paracetamol …)
```

NestJS 11 · PostgreSQL 16 · Prisma 6 · JWT auth. This repo is the backend only; the
React web app and the React Native app live in their own repos and talk to this API.

---

## Quick start

```bash
nvm use                 # Node 22 (see .nvmrc) — Nest 11 needs Node >= 20
npm install
cp .env.example .env    # then set JWT secrets: openssl rand -base64 48
npm run db:up           # Postgres 16 in Docker on port 5433
npm run prisma:migrate  # create the schema
npm run prisma:seed     # optional demo data
npm run start:dev
```

- API: <http://localhost:3000/api>
- Interactive docs (Swagger): <http://localhost:3000/api/docs>
- Health: <http://localhost:3000/api/health>

**Building the client?** Read [FRONTEND.md](FRONTEND.md) — the full integration guide, with real
request/response examples. The machine-readable contract lives in
[`openapi/openapi.json`](openapi/openapi.json), committed and regenerated with `npm run openapi`.

Seeded logins — `owner@findmystuff.test` and `family@findmystuff.test`, password
`Password123`.

---

## What it does

**Find things.** `GET /api/search?q=charger` searches every place you can see and
answers with the full trail: `Home › Bedroom › Under the bed › Blue box`. It is
typo-tolerant (`almira` → Almirah), prefix-matching (`medicin` → medicine), and
alias-aware — you save a "Type-C cable" and later search "charger", and still find it.

**Nest storage as deep as real life goes.** A storage can live inside another storage,
so a pouch inside a box inside a suitcase inside a loft is one `parentId` away. Moving a
room moves everything under it in a single statement, and every breadcrumb updates.

**Keep private things private.** Inside a shared house, an item marked `PRIVATE` is
invisible to every other member — including the owner of the house. Jewellery, documents
and gifts stay yours.

**Remember who moved what.** Every move is recorded with a snapshot of the breadcrumb,
so history stays readable after a rename, and "it's not where I left it" has an answer.

**Scan a box.** Every storage gets a short code (`FMS-7K3QX2`) for a printed QR sticker.
`GET /api/storages/by-label/FMS-7K3QX2` returns everything inside it.

**Get told before it matters.** `GET /api/items/attention` returns what is expiring,
what is out of warranty, what you lent out and never got back, and what is running low.

---

## Sharing model

Three separate ideas, deliberately not collapsed into one:

| Concept | Table | Meaning |
|---|---|---|
| Friendship | `friendships` | A social connection: request → accept. Symmetric. |
| Membership | `place_members` | Access to **one** place, with a role. Not transitive. |
| Invite | `place_invites` | A code for someone who is not on the app yet. |

The flow you asked for: **send a friend request → they accept → the owner adds them to a
house → they are family for that house.** Being family in one house grants nothing in
another. Adding someone directly requires an accepted friendship; for people not on the
app yet, issue an invite code instead.

Roles, least to most powerful:

| Role | Can do |
|---|---|
| `VIEWER` | Search and read. Nothing else. Good for kids and guests. |
| `MEMBER` | Add, edit and move things. |
| `ADMIN` | Manage storages, add and remove members, issue invites. |
| `OWNER` | Everything, plus deleting the place. One per place, set at creation. |

---

## API surface

| Area | Routes |
|---|---|
| Auth | `POST /auth/signup` `POST /auth/login` `POST /auth/refresh` `POST /auth/logout` `POST /auth/logout-all` `GET /auth/me` `POST /auth/accept-terms` `POST /auth/change-password` |
| Users | `PATCH /users/me` `GET /users/lookup?email=` `DELETE /users/me` |
| Friends | `GET /friends` `POST /friends/requests` `GET /friends/requests/incoming\|outgoing` `POST /friends/requests/:id/accept\|reject` `DELETE /friends/:userId` `POST /friends/:userId/block` |
| Places | `POST /places` `GET /places` `GET /places/:placeId` `PATCH /places/:placeId` `DELETE /places/:placeId` `GET /places/:placeId/activity` |
| Members | `GET\|POST /places/:placeId/members` `PATCH\|DELETE /places/:placeId/members/:memberId` `POST /places/:placeId/leave` `GET\|POST /places/:placeId/invites` `DELETE /places/:placeId/invites/:inviteId` `POST /invites/accept` |
| Storages | `POST\|GET /places/:placeId/storages` `GET /places/:placeId/storages/tree` `GET\|PATCH\|DELETE /places/:placeId/storages/:storageId` `GET /storages/by-label/:labelCode` |
| Items | `POST\|GET /places/:placeId/items` `GET\|PATCH\|DELETE /places/:placeId/items/:itemId` `POST .../move` `POST .../lend` `POST .../return` `GET .../history` `GET /items/attention` |
| Search | `GET /search?q=&placeId=` |
| Media | `POST /media` `GET /media/:id` `GET /media/:id/raw` `GET /media/:id/thumbnail` `DELETE /media/:id` |

Everything except signup, login, refresh, logout and health needs
`Authorization: Bearer <accessToken>`.

---

## Notes for whoever builds the client

**Images.** Post base64 (a `data:` URI is fine) to `POST /media`, or inline it as
`imagesBase64` / `coverImageBase64` when creating an item, storage or place. The server
decodes it, strips EXIF orientation, writes a WebP thumbnail, and returns a media id.
Base64 is never stored in a row — render lists from `/media/:id/thumbnail` and detail
views from `/media/:id/raw`. Default cap is 8 MB per image.

**Terms & conditions are versioned, not a boolean.** Bump `TERMS_VERSION` in the
environment and every user is re-prompted on their next request: authenticated routes
return `403` with `code: "TERMS_ACCEPTANCE_REQUIRED"`, while `/auth/me` and
`/auth/accept-terms` keep working so the app can show the dialog.

**Tokens rotate.** Every `/auth/refresh` returns a new refresh token and invalidates the
old one. Presenting an already-used token is treated as theft and revokes every session
for that user, so store exactly one refresh token per device and replace it on each call.

**404, not 403, for other people's data.** Asking for a place you are not a member of
returns `404` — the API never confirms that someone else's data exists.

**Offline sync is possible later without a migration.** Every table uses UUID primary
keys, `updatedAt`, and soft deletes, so a client can generate ids offline and reconcile.

---

## Scripts

| Command | Does |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` / `npm run start:prod` | Compile / run compiled |
| `npm test` / `npm run test:cov` | Unit tests / coverage |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run db:up` / `npm run db:down` | Postgres container up / down |
| `npm run prisma:migrate` | Create and apply a migration |
| `npm run prisma:studio` | Browse the database |
| `npm run prisma:seed` | Load demo data |
| `npm run openapi` | Regenerate `openapi/openapi.{json,yaml}` (no database needed) |

## Environment

See `.env.example`. `DATABASE_URL`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are
required — the app refuses to boot on a secret shorter than 32 characters rather than
run insecurely.

## Deploying to Render

A [`render.yaml`](render.yaml) blueprint creates the API and its Postgres database together.
In the Render dashboard: **New → Blueprint → pick this repo**. Set `CORS_ORIGINS` when prompted
(the frontend URL); everything else is wired automatically.

Three things about the free plan that will surprise you:

1. **The filesystem is ephemeral.** Uploaded photos are written to disk by the `local` media
   driver and are **wiped on every deploy and restart**. Fine for a demo, not for real use —
   move to object storage (or a paid persistent disk) before anyone relies on it.
2. **Free Postgres is deleted after 30 days.** Back up or upgrade before then.
3. **Free services sleep after 15 minutes idle**, so the next request takes ~50s. Mobile clients
   need a generous timeout on the first call.

The blueprint deploys the `main` branch — change `branch:` in `render.yaml` to deploy another.

## Not built yet

Push notifications for reminders, S3 media driver, ownership transfer, item-level
comments, and a `/sync` endpoint for offline clients.
