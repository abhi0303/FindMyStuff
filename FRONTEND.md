# FindMyStuff — Frontend Integration Guide

Everything you need to build the web and mobile clients against this API. You do not need
to read the backend source; this document plus the OpenAPI spec is the whole contract.

| | |
|---|---|
| Base URL (local) | `http://localhost:3000/api` |
| Interactive docs | `http://localhost:3000/api/docs` (Swagger UI, server must be running) |
| Machine-readable spec | [`openapi/openapi.json`](openapi/openapi.json) · [`openapi/openapi.yaml`](openapi/openapi.yaml) |
| Auth | `Authorization: Bearer <accessToken>` on every route except signup/login/refresh/logout/health |
| Content type | `application/json` everywhere (images go in as base64 strings, not multipart) |

Every JSON example below was captured from a real running server, not written by hand.

---

## 1. The mental model

Learn these three nouns and the rest of the API follows.

```
Place                     a home, office, bank locker, car — anything with stuff in it
  └── Storage             a tree: Bedroom → Almirah → Top shelf → Blue box
        └── Item          the actual thing: Passport, Type-C cable, Paracetamol
```

**Storage is a tree, not a flat list.** A storage has an optional `parentId`, so nesting is
unlimited — a pouch inside a box inside a suitcase inside a loft. Two consequences for you:

- The "which storage?" input is a **tree picker**, not a plain `<select>`. Use
  `GET /places/{placeId}/storages/tree` for that.
- Never build a location string yourself. Every relevant response already carries a
  `breadcrumb` like `"Bedroom › Almirah › Top shelf"`. Render it as-is.

**Access is per-place.** Being family in one house grants nothing in another. Your role is
returned per place as `myRole`.

---

## 2. Generate a typed client (recommended)

Do not hand-write request/response types. Generate them from the spec:

```bash
npx openapi-typescript ../FindMyStuff/openapi/openapi.json -o src/api/schema.d.ts
```

Then use `openapi-fetch` for a fully typed client:

```ts
import createClient from 'openapi-fetch';
import type { paths } from './api/schema';

export const api = createClient<paths>({ baseUrl: 'http://localhost:3000/api' });

// Fully typed — the compiler knows `q` is required and what comes back.
const { data } = await api.GET('/search', { params: { query: { q: 'charger' } } });
```

Regenerate whenever the backend bumps the spec. The backend regenerates it with
`npm run openapi`, so the file in git is always current.

---

## 3. Authentication

### The token pair

`signup`, `login` and `refresh` all return:

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "expiresIn": "15m"
}
```

- **accessToken** — short-lived (15 min). Send it on every request.
- **refreshToken** — long-lived (30 days). Store it securely and use it only to get a new pair.

Storage: `httpOnly` cookie or in-memory + secure storage on web; **Expo SecureStore /
Keychain on mobile**. Do not put the refresh token in `localStorage` on web if you can avoid it.

### Refresh tokens rotate — this will bite you if you skip it

Every call to `POST /auth/refresh` returns a **new** refresh token and permanently
invalidates the one you sent. Reusing a spent token is treated as theft and **revokes every
session for that user**, logging them out on all devices.

Two rules:

1. Overwrite your stored refresh token with the new one on every refresh, atomically.
2. **Serialise refreshes.** If five requests 401 at once and each fires its own refresh, four
   of them replay a spent token and log the user out. Queue them behind a single in-flight
   refresh promise:

```ts
let refreshing: Promise<string> | null = null;

async function getFreshAccessToken() {
  // Everyone waits on the same refresh; nobody replays a spent token.
  refreshing ??= doRefresh().finally(() => { refreshing = null; });
  return refreshing;
}
```

### Signup

```http
POST /api/auth/signup
{
  "email": "shristi@example.com",
  "name": "Shristi Gupta",
  "password": "Str0ngPass",
  "phone": "+919876543210",
  "acceptTerms": true
}
```

`acceptTerms` must be literally `true` or you get `400`. Password needs 8+ characters with an
uppercase, a lowercase and a digit. `phone` is optional and must be international format.

### Terms & conditions are versioned, not a checkbox

The server stores *which version* each user accepted. When the terms change, the backend bumps
`TERMS_VERSION` and **every existing user must re-accept** — no app release needed.

How it shows up: authenticated routes start returning `403` with a machine-readable code.

```json
{
  "message": "Updated terms and conditions must be accepted to continue.",
  "code": "TERMS_ACCEPTANCE_REQUIRED",
  "requiredTermsVersion": "2027-01-01"
}
```

Handle it globally in your HTTP layer:

```ts
if (res.status === 403 && body.code === 'TERMS_ACCEPTANCE_REQUIRED') {
  showTermsModal(body.requiredTermsVersion);   // then POST /auth/accept-terms { accept: true }
  return;
}
```

`GET /auth/me` and `POST /auth/accept-terms` keep working during this state, so you can still
load the user and show the dialog. `login` also returns `termsAcceptanceRequired: true` up
front, so you can route straight to the terms screen after sign-in.

### Auth endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/signup` | Public. Returns user + tokens |
| `POST` | `/auth/login` | Public. Adds `termsAcceptanceRequired` |
| `POST` | `/auth/refresh` | Public. Rotates the pair |
| `POST` | `/auth/logout` | Public. Body: `{ refreshToken }`. Revokes one device |
| `POST` | `/auth/logout-all` | Auth. Revokes every device |
| `GET` | `/auth/me` | Auth. Works even when terms are pending |
| `POST` | `/auth/accept-terms` | Auth. Body: `{ accept: true }` |
| `POST` | `/auth/change-password` | Auth. Logs out all sessions — send the user back to login |

Auth routes are rate limited to **10 requests per 5 minutes** per IP. Everything else is 120
per minute. Over the limit returns `429`.

---

## 4. Errors

Every error is JSON with a consistent shape.

Validation failure — note `message` is an **array** here:

```json
{
  "message": ["property nope should not exist"],
  "error": "Bad Request",
  "statusCode": 400
}
```

Everything else — `message` is a **string**:

```json
{ "message": "Invalid email or password", "error": "Unauthorized", "statusCode": 401 }
```

Normalise both in one place:

```ts
const toMessage = (body: any) =>
  Array.isArray(body?.message) ? body.message.join('\n') : body?.message ?? 'Something went wrong';
```

| Status | Means | What the UI should do |
|---|---|---|
| `400` | Validation failed, or a business rule (already lent out, invite expired) | Show the message inline |
| `401` | No/expired access token | Refresh once, then retry; on second failure log out |
| `403` | Role too low, or terms pending (check `code`) | Explain, or show the terms modal |
| `404` | Missing **or not yours** | Treat as "not found" — do not say "no permission" |
| `409` | Conflict (email taken, already friends) | Show the message inline |
| `429` | Rate limited | Back off, disable the submit button |

> **`404` vs `403`:** asking for a place you are not a member of returns `404`, deliberately.
> The API never confirms that someone else's data exists. Do not write UI copy that says
> "you don't have access to this place" for a 404 — you cannot tell the difference, by design.

### Unknown fields are rejected

The API runs with `forbidNonWhitelisted`, so sending a field that isn't in the DTO fails with
`400`, rather than being silently ignored:

```json
{ "message": ["property nope should not exist"], "error": "Bad Request", "statusCode": 400 }
```

This means **you cannot round-trip a GET response back into a PATCH.** Strip it down to the
fields the update DTO accepts. A GET returns `id`, `createdAt`, `breadcrumb` and similar; none
of those are accepted on write.

---

## 5. Places

```http
POST /api/places
{ "name": "Home — Sector 62", "type": "HOME", "city": "Noida", "latitude": 28.6139, "longitude": 77.209 }
```

`type` is one of `HOME`, `OFFICE`, `LOCKER`, `VEHICLE`, `STORAGE_UNIT`, `OTHER`. Everything
except `name` is optional — dimensions especially, since almost nobody measures their rooms.
Optional cover photo via `coverImageBase64`.

`GET /api/places` — the home screen. Real response:

```json
[
  {
    "id": "b4afb915-a861-4429-a26f-291d54ed268f",
    "name": "Home — Demo",
    "type": "HOME",
    "description": null,
    "ownerId": "9c39ba2c-...",
    "city": "Noida",
    "country": "India",
    "latitude": 28.6139,
    "longitude": 77.209,
    "coverMediaId": null,
    "createdAt": "2026-09-10T19:12:20.921Z",
    "myRole": "OWNER",
    "memberCount": 2,
    "members": [{ "id": "9c39...", "name": "Shristi", "avatarMediaId": null, "role": "OWNER" }],
    "storageCount": 5,
    "itemCount": 5
  }
]
```

`itemCount` respects privacy — it excludes other people's private items, so two members of the
same house can legitimately see different numbers. That is correct, not a bug.

Use `myRole` to hide controls the user cannot use (see the role table in §8).

---

## 6. Storages (the tree)

### Creating

```http
POST /api/places/{placeId}/storages
{ "name": "Almirah", "type": "ALMIRAH", "parentId": "<bedroom-id>" }
```

Omit `parentId` for a top-level storage (a room). `type` is one of `ROOM`, `ALMIRAH`,
`WARDROBE`, `CABINET`, `SHELF`, `DRAWER`, `BED`, `BOX`, `SUITCASE`, `BAG`, `FRIDGE`, `LOFT`,
`RACK`, `DESK`, `SAFE`, `OTHER` — use it to pick an icon. Max nesting depth is 10.

### Reading

`GET /places/{placeId}/storages/tree` returns a recursive structure — use it for the picker
and the browse screen:

```json
[
  {
    "id": "45850ba9-...",
    "name": "Bedroom",
    "type": "ROOM",
    "parentId": null,
    "path": "",
    "level": 0,
    "labelCode": "FMS-3TSCQ8",
    "itemCount": 0,
    "children": [
      {
        "id": "8f2a...",
        "name": "Almirah",
        "type": "ALMIRAH",
        "parentId": "45850ba9-...",
        "path": "45850ba9-...",
        "level": 1,
        "itemCount": 1,
        "children": [ { "name": "Top shelf", "level": 2, "children": [] } ]
      }
    ]
  }
]
```

`GET /places/{placeId}/storages` returns the same storages **flat**, each with a ready-made
`breadcrumb` and `itemCount`. Use this for a searchable dropdown. Filters: `?rootOnly=true`,
`?parentId=`, `?type=`, `?q=`.

- `path` — ancestor ids, root first, slash-separated. Empty string for a root. You rarely need it.
- `level` — depth, 0-based. Handy for indentation.
- `labelCode` — e.g. `FMS-3TSCQ8`. Render as a QR code for a printable sticker (see §10).

### Moving a storage

`PATCH` with `parentId` moves the storage **and everything inside it**. Pass `null` to move it
to the top level.

```http
PATCH /api/places/{placeId}/storages/{storageId}
{ "parentId": "<new-parent-id>" }     // or  { "parentId": null }
```

The backend rewrites every descendant path in one statement, so a room with 200 boxes moves
instantly. Moving a storage into its own descendant returns `400` — surface that message and
grey out invalid drop targets in your tree UI.

### Deleting

`DELETE` removes the storage **and its whole subtree**, but items inside are *not* deleted —
they become unassigned (`storageId: null`) with a movement logged. The response tells you
exactly what happened, so show it as a confirmation:

```json
{ "success": true, "message": "Deleted 3 storage(s). 7 item(s) are now unassigned.", "storages": 3, "items": 7 }
```

Warn before the call: fetch the subtree first so the dialog can say "this will unassign 7 things".

---

## 7. Items

### Creating

```http
POST /api/places/{placeId}/items
{
  "name": "Passport",
  "storageId": "<top-shelf-id>",
  "description": "Inside the brown document folder",
  "tags": ["documents", "important"],
  "aliases": ["passbook"],
  "category": "Documents",
  "quantity": 1,
  "visibility": "PRIVATE",
  "expiresAt": "2031-04-02T00:00:00.000Z",
  "imagesBase64": ["data:image/jpeg;base64,/9j/4AAQ..."]
}
```

`storageId` is optional — an item can exist as "not put away yet". All dates are ISO 8601.

**Push aliases in your UI.** This is the single biggest quality-of-life feature: nobody searches
for "Type-C cable", they search "charger". After the user types a name, prompt: *"What else
might you call this?"* `aliases` and `tags` are lowercased server-side.

### Reading

`GET /places/{placeId}/items` is paginated:

```json
{
  "data": [ { "id": "...", "name": "Type-C cable", "storage": { "breadcrumb": "Bedroom › Under the bed › Blue box" }, "mediaIds": [] } ],
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1, "hasNext": false }
}
```

Every paginated endpoint uses this exact `meta` shape — write one `usePaginated` hook and reuse it.

Filters: `q`, `storageId` (+ `includeNested`, default `true`), `status`, `visibility`, `tag`,
`category`, `expiringInDays`, `lowStock`, `sortBy`, `sortOrder`, `page`, `limit` (max 100).

> `?storageId=<bedroom>` returns things inside the almirah inside the bedroom too. Pass
> `includeNested=false` for direct contents only.

### Moving an item

```http
POST /api/places/{placeId}/items/{itemId}/move
{ "toStorageId": "<blue-box-id>", "note": "Shifted while cleaning" }
```

Make this a **one-tap action** on the item screen — it is the most common edit after creation.
`toStorageId: null` marks it as not put away.

### History — "it's not where I left it"

`GET /places/{placeId}/items/{itemId}/history` returns every move, newest first, with the
breadcrumb snapshotted at that time (so it stays readable even after a rename):

```json
[
  { "fromLabel": "Bedroom › Almirah › Top shelf", "toLabel": "Bedroom › Under the bed › Blue box",
    "note": "Shifted while cleaning", "movedBy": { "name": "Shristi" }, "createdAt": "2026-09-10T..." },
  { "fromLabel": null, "toLabel": "Bedroom › Almirah › Top shelf", "note": "Added", "movedBy": { "name": "Shristi" } }
]
```

Show this on the item screen as "Previously kept in…". When someone can't find a thing, the
previous location is the answer surprisingly often.

### Lending

`POST .../lend` with `{ "lentToName": "Rahul (neighbour)", "dueAt": "..." }` sets status to
`LENT_OUT`; `POST .../return` clears it. Status values: `AVAILABLE`, `LENT_OUT`, `CONSUMED`,
`LOST`, `DISCARDED`.

### Privacy — the feature that makes sharing acceptable

`visibility` is `SHARED` (default) or `PRIVATE`. A `PRIVATE` item is invisible to **every** other
member of the place, including its owner. It will not appear in their lists, counts or search.

Show this as a clear toggle when adding an item — *"Only visible to me"* — with a lock icon on
private items in lists. Only the item's owner can flip it.

---

## 8. Sharing: friends → family

The flow, deliberately in two steps:

```
  A sends friend request  ──▶  B accepts  ──▶  A (owner/admin) adds B to a place  ──▶  B is family for that place
```

```http
POST /api/friends/requests        { "email": "mum@example.com" }
POST /api/friends/requests/{id}/accept
POST /api/places/{placeId}/members  { "userId": "<B>", "role": "MEMBER" }
```

Adding someone who is not an accepted friend returns `403`. Nice touch: if B has already sent
*you* a request and you send one back, it is auto-accepted.

### Invite codes — for people not on the app yet

Requiring friendship first would block onboarding (your mother has no account yet). So:

```http
POST /api/places/{placeId}/invites   { "email": "mum@example.com", "role": "MEMBER", "expiresInDays": 7 }
→ { "code": "INV-ZJ5Y0YAP", "expiresAt": "..." }

POST /api/invites/accept             { "code": "INV-ZJ5Y0YAP" }
```

Codes are single-use and expire. If `email` was set, only that account can redeem it. Build a
deep link (`findmystuff://invite/INV-ZJ5Y0YAP`) plus a share sheet — and after signup, check for
a pending code and redeem it automatically.

### Roles

| Role | Read | Add/edit/move things | Manage storages, members, invites | Delete the place |
|---|:--:|:--:|:--:|:--:|
| `VIEWER` | ✅ | ❌ | ❌ | ❌ |
| `MEMBER` | ✅ | ✅ | ❌ | ❌ |
| `ADMIN` | ✅ | ✅ | ✅ | ❌ |
| `OWNER` | ✅ | ✅ | ✅ | ✅ |

Gate your UI on `myRole` from `GET /places`. The server enforces it regardless, but a button
that always fails is bad UX. `VIEWER` is genuinely useful — kids, guests, a cleaner.

Also: `POST /places/{placeId}/leave` for members, and `GET /places/{placeId}/activity` for a
"who did what" feed (paginated, `summary` is a ready-to-render sentence).

---

## 9. Search — the reason the app exists

```http
GET /api/search?q=charger
GET /api/search?q=charger&placeId=<id>&includeStorages=false&page=1&limit=20
```

Only `q` is required. Without `placeId` it searches **every place you can see**.

```json
{
  "query": "charger",
  "items": [
    {
      "id": "db8ce9d5-...",
      "name": "Type-C cable",
      "tags": ["electronics"],
      "aliases": ["charger", "cable", "charging wire"],
      "quantity": 3,
      "status": "AVAILABLE",
      "mediaId": null,
      "place": { "id": "b4afb915-...", "name": "Home — Demo" },
      "storage": {
        "id": "1ae3f61f-...",
        "name": "Blue box",
        "breadcrumb": "Home — Demo › Bedroom › Under the bed › Blue box"
      },
      "score": 2.43
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNext": false },
  "storages": []
}
```

The `storage.breadcrumb` **includes the place name** and is the entire answer to "where did I
keep it". Make it the biggest text in the result row, above the item name if you like.

What it handles for you — all verified:

| You type | You get | Why |
|---|---|---|
| `charger` | Type-C cable | alias match |
| `almira` | Almirah | trigram similarity (typo) |
| `medicin` | Paracetamol strip | prefix match on its tag |
| `pass` | Passport | prefix match |

So: **search as the user types** (debounce ~250 ms, 2-character minimum). Results come back
pre-sorted by `score`; do not re-sort. `storages` is capped at 10 and lets the user jump to
browsing a container. Scanning a QR code? Put the `labelCode` straight into `q`, or use the
dedicated endpoint in §10.

---

## 10. QR stickers

Every storage has a `labelCode` like `FMS-3TSCQ8`, from an alphabet with no `I`, `L`, `O` or `U`
so it can be read off a sticker without ambiguity.

```http
GET /api/storages/by-label/FMS-3TSCQ8
```

No `placeId` needed — it searches all your places and returns the storage with its children and
contents. Two features worth building:

1. **Print sheet** (web): render QR codes for every box in a place, on an A4 grid of labels.
2. **Scan** (mobile): camera → decode → hit this endpoint → show contents. For cartons,
   suitcases and loft boxes this is the killer feature.

`404` means the code is not yours or does not exist.

---

## 11. Images

Base64 in, URLs out.

**Uploading** — either inline when creating something:

```jsonc
// on an item
{ "name": "Passport", "imagesBase64": ["data:image/jpeg;base64,/9j/4AAQ..."] }   // max 6
// on a place or storage
{ "name": "Almirah", "coverImageBase64": "data:image/jpeg;base64,..." }
```

…or upload separately and reuse the id:

```http
POST /api/media    { "base64": "data:image/jpeg;base64,..." }
→ { "id": "cc7937a0-...", "mimeType": "image/png", "sizeBytes": 95, "width": 1, "height": 1 }
```

Data URI prefix is optional. Accepted: jpeg, png, webp, gif, heif, avif. **Max 8 MB decoded**
(request body cap is 25 MB). Base64 inflates by ~33%, so **resize on the client before
encoding** — 1600px on the long edge is plenty. On mobile, `expo-image-manipulator`; on web, a
`<canvas>` resize. Uploading a straight 12 MP camera photo will fail.

**Displaying** — you get ids, not URLs. Build them:

| Use | URL |
|---|---|
| Lists, thumbnails | `GET /api/media/{id}/thumbnail` — 320px WebP, tiny |
| Detail, full screen | `GET /api/media/{id}/raw` — original bytes |

Both need the `Authorization` header, so a bare `<img src>` will 401. Options: fetch as a blob
and use `URL.createObjectURL`, or on React Native pass headers to `<Image source={{ uri, headers }}>`.
Responses are `Cache-Control: private, max-age=86400`, so cache aggressively.

The same photo uploaded twice is deduplicated by checksum and returns the existing id.

**Where images live.** Image bytes are stored in S3-compatible object storage, not in the
database and not on the API server's disk. Nothing about this changes the contract: you still
upload base64, still get a media id, and still load it from `/media/{id}/raw` and
`/media/{id}/thumbnail` with the auth header. The bucket is private and never exposed to the
client, so the same membership and PRIVATE-item checks apply to every image.

**Handle a 404 on an image.** Images uploaded *before* the move to object storage were saved to
the old server's disk, which a deploy has since wiped. Their media ids still exist, but the
bytes are gone and `/raw` and `/thumbnail` return `404 Media file is unavailable`. Render a
placeholder instead of a broken image, and let the user re-attach a photo. Re-uploading the
same picture now creates a fresh, working copy.

---

## 12. Reminders dashboard

```http
GET /api/items/attention?withinDays=30
```

One call, across every place, for a "needs attention" screen and later for push notifications:

```json
{
  "expiring":  [ { "name": "Paracetamol strip", "expiresAt": "...", "storage": { "name": "Top shelf" }, "place": { "name": "Home — Demo" } } ],
  "warranty":  [],
  "overdue":   [ { "name": "Power drill", "lentToName": "Neighbour", "dueAt": "..." } ],
  "lowStock":  [ { "name": "Paracetamol strip", "quantity": 2, "lowStockAt": 2 } ]
}
```

An item can appear in more than one bucket. Show a badge count on the home screen — this is
what turns a "once every ten days" app into something people open weekly.

---

## 13. Suggested screens

| Screen | Calls |
|---|---|
| Splash | `GET /auth/me` → route to login / terms / home |
| Login, Signup | `POST /auth/login`, `POST /auth/signup` |
| Terms modal | `POST /auth/accept-terms` |
| Home | `GET /places`, `GET /items/attention` |
| **Search** (make it the primary tab) | `GET /search?q=` |
| Place detail | `GET /places/{id}`, `GET /places/{id}/storages/tree` |
| Storage browse | `GET /places/{id}/storages/{sid}` |
| Add / edit thing | `GET /places/{id}/storages` (picker), `POST\|PATCH .../items` |
| Item detail | `GET .../items/{id}`, `GET .../items/{id}/history` |
| Move sheet | `POST .../items/{id}/move` |
| Scan QR | `GET /storages/by-label/{code}` |
| Members | `GET\|POST /places/{id}/members`, `POST /places/{id}/invites` |
| Friends | `GET /friends`, `POST /friends/requests`, accept/reject |
| Activity | `GET /places/{id}/activity` |
| Profile | `PATCH /users/me`, `POST /auth/logout-all` |

Search deserves the most design attention. Everything else is data entry; search is the payoff.

---

## 14. Gotchas checklist

- [ ] Serialise token refresh — parallel refreshes log the user out of every device.
- [ ] Handle `403` + `code: "TERMS_ACCEPTANCE_REQUIRED"` globally, not per screen.
- [ ] Treat `404` as "not found", never "no permission" — you cannot tell them apart.
- [ ] `message` is an array on validation errors, a string otherwise.
- [ ] Never PATCH back a whole GET response — unknown fields are rejected with `400`.
- [ ] Resize images before base64 encoding; 8 MB decoded is the ceiling.
- [ ] Media URLs need the auth header; a plain `<img src>` will 401.
- [ ] Render `breadcrumb` as given; never join names yourself.
- [ ] Gate UI on `myRole`; the server enforces it anyway.
- [ ] `itemCount` differs per member because of private items — that is correct.
- [ ] Auth routes: 10 requests / 5 min. Disable the submit button while in flight.
- [ ] All timestamps are UTC ISO 8601 — convert for display.

---

## 15. Running the backend locally

```bash
nvm use && npm install
cp .env.example .env          # set the two JWT secrets
npm run db:up                 # Postgres in Docker
npm run prisma:migrate
npm run prisma:seed           # demo data — see below
npm run start:dev
```

Seeded accounts, password `Password123` for both:

| Email | Role in "Home — Demo" |
|---|---|
| `owner@findmystuff.test` | `OWNER` — owns a private Passport |
| `family@findmystuff.test` | `MEMBER` — cannot see that Passport |

Log in as both to see the privacy rule working. The seed is built so every screen has something
real to render:

- a 3-level storage tree (Bedroom → Almirah → Top shelf, Bedroom → Under the bed → Blue box)
- a `PRIVATE` Passport, to prove the privacy rule
- a "Type-C cable" with aliases `charger`, `cable`, `charging wire` — search `charger` to see it
- a Paracetamol strip that is both expiring and low on stock
- a Power drill lent out, overdue, and with its warranty running out
- movement history on every item, including one real move by the family member

So `GET /items/attention` returns all four buckets populated, and item history is never empty.

Run `npm run openapi` after any backend change to refresh `openapi/`.

---

## 16. Offline backup and sync

Three backend features exist specifically for an offline-capable client. All three are
**opt-in** — nothing changes for requests that don't use them.

| Need | Status |
|---|---|
| Back up everything | ✅ `GET /sync` with no `since` |
| Keep the backup current, including other members' changes | ✅ `GET /sync?since=…` returns only what changed |
| Create storages and things offline, including nested ones | ✅ Send your own `id` — no temporary-id swapping |
| Replay queued changes without duplicates | ✅ `Idempotency-Key` header |

### 16.1 Create with your own id

`POST /places`, `POST /places/{placeId}/storages` and `POST /places/{placeId}/items` all
accept an optional `id`. Generate a UUID v4 on the device (`crypto.randomUUID()`) at the
moment the user creates the thing, and use it everywhere locally from then on.

```jsonc
POST /api/places/{placeId}/storages
{ "id": "31a1754e-e37d-4272-9ad9-d667c19d68c9", "name": "Suitcase", "type": "SUITCASE" }

POST /api/places/{placeId}/items
{ "id": "8f0c…", "name": "Passport", "storageId": "31a1754e-e37d-4272-9ad9-d667c19d68c9" }
```

The second request references a storage that only existed on the device a moment ago.
Because the id was final from the start, **there is no swap-and-relink step** — replay the
queue in the order it was recorded and every reference is already correct.

- The id must be a valid UUID, or the request fails with `400 id must be a UUID`.
- Sending an id that already exists returns `409 A record with this id already exists.`
  For a create you are replaying, **treat that 409 as success** — it means an earlier
  attempt already landed. Fetch the record if you need the server's copy.
- Omit `id` entirely and the server assigns one, exactly as before.

### 16.2 The `Idempotency-Key` header

Send it on any `POST`, `PUT`, `PATCH` or `DELETE` you might retry. A repeat with the same key
and the same body **returns the original response without running again**.

```http
POST /api/places/{placeId}/items
Authorization: Bearer <accessToken>
Idempotency-Key: 5b1d0c7e-2f3a-4c8e-9a61-0d4f7e2b1a93
Content-Type: application/json

{ "id": "8f0c…", "name": "Passport" }
```

**Rules for the key**

- One key per queued operation. Generate it when the change is **queued**, store it with the
  operation, and send the **same** key on every retry of that operation.
- Never reuse a key for a different operation. Keys are private to each user.
- Any string up to 200 characters; a UUID is the simplest choice.

**What each response means**

| Response | Meaning | What to do |
|---|---|---|
| `2xx` | Done — on the first try, or replayed from a previous try | Mark the operation complete |
| Same `4xx` as before | The request itself is invalid; replaying returns the same error | Don't retry. Surface it or drop the operation |
| `409` "already being processed" | Another attempt with this key is still running | Wait a second or two, retry with the **same** key |
| `422` "already used for a different request" | Same key, different body — a bug in the queue | Fix the queue. Never send a new body under an old key |
| `5xx` or network error | Nothing was saved, and the key has been released | Retry with the **same** key |

A replay returns the same status code and body as the original. Verified: three identical
`POST`s with one key returned the same `id` and `201` each time, and created exactly one row.

**Keys last 24 hours.** After that, the same key runs the request again as if new. For
creates, send your own `id` too (16.1): a late replay then gets a harmless `409` instead of
a duplicate. For deletes, a late replay of something already gone gets `404` — also treat
that as success.

Signup, login and refresh ignore this header. Account creation is already protected by
the unique email.

### 16.3 `GET /api/sync`

```http
GET /api/sync                                  # first run: everything
GET /api/sync?since=2026-09-14T17:18:37.795Z   # later: only changes
GET /api/sync?since=…&placeId=<id>             # optional: one place only
```

```json
{
  "serverTime": "2026-09-14T17:18:37.795Z",
  "places":   [ { "id": "…", "name": "Home — Demo", "updatedAt": "…" } ],
  "storages": [ { "id": "…", "parentId": "…", "path": "…", "level": 1, "labelCode": "FMS-…" } ],
  "items":    [ { "id": "…", "storageId": "…", "visibility": "SHARED" } ],
  "deleted":  { "places": [], "storages": [], "items": ["bd574989-…"] },
  "truncated": false
}
```

`places`, `storages` and `items` hold **full rows** for everything created or changed — the
same fields as the list endpoints. `deleted` holds only ids. Nothing appears in both.

**The cursor rule — the one that matters most**

Store `serverTime` from each response and send it back as `since` on the next call.
**Never use the device clock.** Phones drift by seconds or minutes, and a clock that runs
ahead silently skips changes.

**When `truncated` is `true`**

Each list returns at most 1000 rows per call. When one is cut short, `truncated` is `true`
and `serverTime` is set to a cutoff up to which **every** list is complete — not the real
time. Call again straight away with that `serverTime`, and repeat until `truncated` is
`false`. Don't resend the `since` you just used: that returns the same page again.

The follow-up call may repeat a few rows you already have. Upsert by `id` and it's harmless.
Rows that share a timestamp — deleting a storage marks its whole subtree deleted in one
write — are never split across two pages, so none can be skipped.

**Applying a response**

```ts
async function applySync(res: SyncResponse) {
  await db.transaction(async (tx) => {
    // Upserts first: parents before children.
    await tx.places.bulkPut(res.places);
    await tx.storages.bulkPut(res.storages);
    await tx.items.bulkPut(res.items);
    // Then deletions: children before parents.
    await tx.items.bulkDelete(res.deleted.items);
    await tx.storages.bulkDelete(res.deleted.storages);
    await tx.places.bulkDelete(res.deleted.places);
    // Advance the cursor only after everything above has been written.
    await tx.meta.put({ key: 'syncCursor', value: res.serverTime });
  });
}

async function syncUntilDone() {
  let since = await db.meta.get('syncCursor');
  do {
    const res = await api.get('/sync', { params: since ? { since } : {} });
    await applySync(res);
    since = res.serverTime;
    if (!res.truncated) break;
  } while (true);
}
```

Write the cursor in the same transaction as the data. If the app dies half-way through, the
next sync redoes that page instead of skipping it.

**Deletion cascades you'll see**

- **Place deleted** — its storages and items are deleted at the same time, and all of their
  ids arrive in `deleted`.
- **Storage deleted** — its whole subtree is deleted. Items inside it are **not** deleted:
  they become unassigned (`storageId: null`). As a safety net, treat any local item whose
  `storageId` points to a storage you no longer have as unassigned.

### 16.4 Two gaps incremental sync can't see — schedule a full resync

Incremental sync reports what changed **inside the places you can currently see**. Two
events remove data from your view without any change inside that view, so they never
produce a deletion:

1. **You lose access to a place** — removed by an admin, or you left on another device. The
   place simply stops being synced; it is not listed in `deleted.places`.
2. **Someone else's item becomes `PRIVATE`.** From then on it's hidden from you, as it
   should be, but no deletion is sent, so your backup keeps the last copy you saw.

The second is a privacy issue, not just a stale record. The fix for both is the same:

> Periodically — say once a day, and whenever the app starts with a network connection —
> run a **full** sync (omit `since`) and **delete anything local that the response doesn't
> include**. Then store its `serverTime` as the cursor as usual.

Also drop the whole backup on logout, and on account switch.

The reverse cases need no special handling: a private item made shared, or a place you're
newly added to, arrives as a normal change on the next incremental sync.

### 16.5 Background worker and login tokens

Your plan is right, and it matches how the backend behaves: **the worker must never refresh
the token itself.**

Refresh tokens rotate. Every `POST /auth/refresh` returns a new refresh token and invalidates
the old one. If the worker and the main app refresh at the same time, one of them presents a
token that has already been used. The server treats that as token theft and **revokes every
session for the user on every device**.

- Only the main thread ever calls `/auth/refresh`, behind the single in-flight lock from §3.
- The worker holds only an access token. On `401`, it asks the main thread for a fresh one
  (for example with `postMessage`), waits, and retries the same request once.
- Queued replays keep their `Idempotency-Key` across that retry, so waiting for a token never
  causes a duplicate.

### 16.6 Limits that apply to sync

- `GET /sync` counts against the normal 300 requests/minute limit. Sync every few minutes
  or on reconnect; don't poll every second.
- It respects exactly the same visibility rules as every other endpoint. Tested with the
  seeded accounts: a private item appears in the owner's sync and never in the family
  member's — neither when created nor in `deleted` when removed.
