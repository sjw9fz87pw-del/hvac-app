# API

Base path `/api/v1`. Session cookie authentication. All responses JSON.

**Conventions**
- Mutating endpoints accept `Idempotency-Key`; a replay returns the original response.
- Out-of-scope resources return **404**, never 403 — a 403 would confirm another
  customer's record exists.
- `403` means "your role lacks this capability"; `404` means "not yours or not there".
- Customer-facing payloads never contain `technicianNotes`. Internal fields appear
  only for internal roles holding `equipment.readInternalNotes`.

---

## Auth

| Method | Path | Capability | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | — | `{email, password}`. Same response and timing for unknown emails and wrong passwords. |
| POST | `/auth/logout` | — | Revokes the session row, not just the cookie. |

## Equipment

| Method | Path | Capability | Notes |
| --- | --- | --- | --- |
| GET | `/equipment` | `equipment.read` | Filters: `organizationId`, `locationId`, `areaId`, `includeArchived`, `limit`. Filters narrow within your scope; an out-of-scope id is a 404. |
| POST | `/equipment` | `equipment.create` | Internal → `ACTIVE` with schedules. Customer → `PENDING_SETUP`, no schedule, notifies ops. Accepts `newAreaName` so Rapid Inventory creates an area and asset in one call. |
| GET | `/equipment/:id` | `equipment.read` | The Equipment Passport: asset, schedules, full history, issues, and (internal only) tag + tag history + internal notes. |
| POST | `/equipment/:id/verify` | `equipment.verify` | Turns a customer-added asset into a maintained one by setting its schedule. Customers cannot call this. |
| POST | `/equipment/:id/archive` | `equipment.archive` | Archives, never deletes. Pauses schedules, releases the tag, retains all history. |

## NFC

| Method | Path | Capability | Notes |
| --- | --- | --- | --- |
| POST | `/tags/mint` | `tag.mint` | Step 1. Returns `{tagId, payload, url}` — the URL is what gets written to the chip. |
| POST | `/tags/verify` | `tag.pair` | Step 2. Send the read-back payload, or `writeError` to record a failed write. |
| POST | `/tags/pair` | `tag.pair` | Step 3. **Refused unless `verified: true`.** |
| POST | `/tags/replace` | `tag.replace` | Revokes old + pairs new in one transaction. History retained. |
| POST | `/tags/unpair` | `tag.unpair` / `tag.revoke` | `revoke: true` requires the stronger capability. |
| POST | `/tags/reassign` | `tag.reassign` | Moves a live tag to different equipment. |
| POST | `/tags/resolve` | authenticated | The tap endpoint. NFC and QR both post the same payload. One generic message for every denial. |
| POST | `/tags/test` | `tag.viewHistory` | Internal diagnostic — unlike `/resolve`, it reports the specific failure reason. |
| GET | `/tags` | `tag.viewHistory` | `filter=recent\|unassigned\|revoked\|active`. |
| GET | `/tags/:id/history` | `tag.viewHistory` | Every event and every pairing, including closed ones. |

## Service

| Method | Path | Capability | Notes |
| --- | --- | --- | --- |
| POST | `/services` | `service.complete` | Writes an immutable record, advances the schedule, closes the visit task, creates flagged issues. **422 with `detail.missing[]` when required proof is absent** — the task is never quietly closed. |

## Issues

| Method | Path | Capability | Notes |
| --- | --- | --- | --- |
| GET | `/issues` | `issue.read` | Filters: `organizationId`, `locationId`, `status`, `open=true`. |
| POST | `/issues` | `issue.create` | Started from the asset, so the restaurant, area, model, serial and history are already attached. |
| PATCH | `/issues/:id` | `issue.triage` / `issue.assign` / `issue.resolve` | Capability required depends on the fields sent. `vendorId` routes to an outside trade. |

## Visits

| Method | Path | Capability | Notes |
| --- | --- | --- | --- |
| GET | `/visits` | `visit.read` | Filters: `mine=true`, `from`, `to`, `status`. |
| POST | `/visits` | `visit.manage` | **Generates** a visit from what is due within `horizonDays`, grouped by area. 422 when nothing is due. |
| GET | `/visits/:id` | `visit.read` | Tasks with checklists and per-service-type proof requirements. `accessNotes` is internal-only. |

## Photos, sync, search, dashboards

| Method | Path | Capability | Notes |
| --- | --- | --- | --- |
| POST | `/photos` | authenticated | `multipart/form-data`. Server validates type and size and generates the key; a client-supplied key is never trusted as a path. |
| GET | `/photos/:key` | authenticated | Served through the app, never as a public object-store URL. |
| POST | `/sync` | per-event | Offline replay, ≤100 events. Returns `{applied, duplicates, failed, results[]}`. Already-applied events come back as `duplicate`. |
| GET | `/search?q=` | `search.global` | Restaurant, customer, equipment name, model, serial, asset id, tag. Internal only. |
| GET | `/dashboard` | authenticated | Customer dashboard by default; `?view=command-center` for internal staff. |

---

## Example: completing a service

```http
POST /api/v1/services
Idempotency-Key: 0f8c...   ← replaying this returns the original record, not a second one

{
  "visitTaskId": "…", "equipmentId": "…", "serviceTypeId": "…",
  "performedAt": "2026-09-12T14:00:00.000Z",
  "verificationMethod": "NFC",
  "technicianNotes": "internal only",
  "customerVisibleNotes": "Condenser cleaned, airflow verified.",
  "checklist": [{ "label": "Clean condenser", "completed": true }],
  "photos": [
    { "kind": "BEFORE", "blobKey": "service/…", "capturedAt": "…" },
    { "kind": "AFTER",  "blobKey": "service/…", "capturedAt": "…" }
  ],
  "issues": [{ "category": "MAKING_NOISE", "title": "Compressor noise", "severity": "MEDIUM" }]
}
```

Missing proof:

```json
HTTP 422
{ "error": "Service proof is incomplete",
  "detail": { "missing": ["tag verification", "after photo", "checklist: Clean condenser"] } }
```
