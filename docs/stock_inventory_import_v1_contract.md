# Stock Inventory Import V1 Contract

**Sprint:** P8.15.1
**Document type:** Canonical product and engineering contract
**Status:** Authoritative for Import V1 design and later schema/RPC/UI work
**Audience:** Engineering and product implementing spreadsheet onboarding into Stock V1

This document defines contracts only. It does not create tables, RPCs, parsers, or UI.

---

## 1. Scope and architecture

### 1.1 In scope

Spreadsheet onboarding of restaurant inventory into the workspace-scoped Stock V1 catalog (`stock_items`).

### 1.2 Canonical flow (locked)

```
Spreadsheet (.csv | .xlsx)
  → Constrained client-side parse
  → Persistent import session + staged rows
  → Server-side validation / conflict confirmation where DB evidence is required
  → Operator Preview
  → Server-authoritative Apply RPC
  → stock_items
```

### 1.3 Explicit separation from Inventory Migration

| Path | Source | Staging | Destination |
|------|--------|---------|-------------|
| **Import V1** (this contract) | Spreadsheet | `inventory_import_sessions` / `inventory_import_rows` (conceptual) | `stock_items` |
| **Inventory Migration** (legacy) | `inventory_items` | `inventory_stock_item_map` | `stock_items` via Phase 1 / Phase 2 |

Rules:

- Spreadsheet import **must not** persist into `inventory_items`.
- Spreadsheet import **must not** use `inventory_stock_item_map` as its staging store.
- Migration remains the legacy conversion engine only.
- Import and Migration may both write `stock_items`, but they are separate product pipelines.

### 1.4 Naming conventions reused from the repository

| Concern | Convention | Source pattern |
|---------|------------|----------------|
| IDs | `uuid` | sessions, `stock_items.id`, workspaces |
| Workspace | `workspace_id` (snake in DB; camel in JS services) | Inventory Count, Stock, Migration |
| Operator | `auth.users` uuid (`started_by` / `created_by` style) | `inventory_count_sessions.started_by` |
| Timestamps | `timestamptz`, `created_at` / `updated_at` | Stock and Count schemas |
| Status enums | lowercase `snake_case` text + CHECK | Count, Migration map |
| JSON evidence | `jsonb` payloads + hash/fingerprint strings | Migration `source_snapshot` / `source_hash` |
| Stock field camelCase in app | `currentQuantity`, `storageLocation`, `costPrice`, `itemType` | `stockItemService.serializeStockItem` |
| Stock field snake_case in DB | `current_quantity`, `storage_location`, `cost_price`, `item_type` | `stock_items` |
| Catalogs | `STOCK_CATEGORIES`, `STOCK_LOCATIONS`, unit presets | `src/lib/stockCatalog.js` |

---

## 2. Locked product decisions

### 2.1 Destination and authority

- Final destination: **`stock_items`**
- Persistent staging required before apply
- Browser is **not** the authoritative execution engine
- Apply must occur through a permission-checked **server RPC**
- Permission gate: same capability as Stock writes (`can_manage_workspace_stock` / owner–GM–manager)

### 2.2 File support

| Format | V1 |
|--------|----|
| `.csv` | Supported |
| `.xlsx` | Supported |
| `.xls` | **Not supported** |

Implementation may ship CSV before XLSX, but both share the same normalized row semantics. Parser choice must not change the normalized contract.

### 2.3 Safety limits (hard)

| Limit | Value |
|-------|-------|
| Maximum file size | **5 MB** |
| Maximum data rows (excluding header) | **5,000** |
| Maximum source columns | **100** |
| Active apply operations per session | **One** |
| Limit exceeded | **ERROR** — no silent truncation |

### 2.4 Existing-item conflicts

- Never silently update an existing stock item
- Never silently overwrite `current_quantity`
- Safe exact matches may be proposed as **LINK**
- **UPDATE** requires explicit operator selection
- Ambiguous matches → **MANUAL REVIEW**
- Unresolved **ERROR** or **MANUAL REVIEW** rows **block** V1 apply

### 2.5 Unknown reference values

| Value | Severity | Behavior |
|-------|----------|----------|
| Unknown unit | **ERROR** | Row blocked until fixed/skipped (catalog membership required for Import V1) |
| Unknown storage location | **WARNING** | May fall back to `Main Storage` **only** after explicit operator confirmation |
| Unknown category | **WARNING** | Proposed default `Other` |
| Supplier | Text only | No automatic supplier row creation; optional later `supplier_id` resolve is out of V1 apply writes |

### 2.6 Row correction

V1 does **not** require an in-grid cell editor.

Allowed operator decisions per row (where eligibility permits):

- inspect
- `create`
- `link`
- `update`
- `skip`
- `manual_review`

### 2.7 Raw-file retention

Permanent raw-file blob storage is **not** required.

Persist at minimum:

- source filename
- file metadata (size, format, MIME if known)
- file fingerprint
- sheet/header selection
- mapping configuration
- staged raw row JSON (audit)
- normalized row JSON
- validation and conflict evidence

Staged data **may** be purged after a future retention period (purge not specified here).

---

## 3. Field contract

Contract version for this section: **`import_field_contract_v1`**.

Canonical field names use **camelCase** in the normalized payload (aligned with Stock JS). Destination columns use **snake_case** as in `public.stock_items`.

### 3.1 Persistable fields (have `stock_items` destinations)

#### `name`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.name` |
| Type | string |
| Required | **REQUIRED** |
| Default | none |
| Nullable | no (empty after trim → ERROR) |
| Max length | 200 characters (import contract; DB is unbounded `text`) |
| Examples | `Ketel One`, `Πίτσα Base` |
| Normalization | trim; collapse internal whitespace to single spaces; preserve case for display; identity key uses Unicode casefold + trim |
| Validation | non-empty after normalize |
| Identity match | **yes** (with location; see §8) |
| UPDATE may change | **yes**, only under explicit `update` action and field allow-list |

#### `unit`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.unit` |
| Type | string |
| Required | **REQUIRED** |
| Default | none |
| Nullable | no |
| Max length | 80 |
| Examples | `Bottle 700ml`, `Kg`, `Case 12 bottles` |
| Normalization | trim; compare against catalog using case-insensitive exact match to known presets for the row’s category (union of category presets + `STOCK_GENERAL_UNIT_PRESETS`); store canonical casing of the matched preset |
| Validation | must match a known preset after normalize → else **ERROR** `UNKNOWN_UNIT` |
| Identity match | no |
| UPDATE may change | **yes** (explicit update allow-list) |

Note: DB `unit` is free text and the Stock UI allows custom units. **Import V1** intentionally requires catalog membership (locked product decision). Custom free-text units are out of Import V1 unless promoted into catalog presets later.

#### `currentQuantity`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.current_quantity` |
| Type | number (`numeric(12,3)` scale) |
| Required | **REQUIRED** (zero allowed) |
| Default | none |
| Nullable | no |
| Examples | `12`, `12.5`, `12,5` |
| Normalization | trim; accept `.` or `,` as decimal separator; strip thousands separators (`1.234,56` / `1,234.56` heuristics documented in parser sprint); reject non-finite |
| Validation | finite; **≥ 0**; else ERROR |
| Identity match | no |
| UPDATE may change | **only** when operator selects `update` **and** explicit quantity-update confirmation is recorded for that row |

#### `category`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.category` |
| Type | string |
| Required | **OPTIONAL** |
| Default | `Other` |
| Nullable | no at apply (always resolved) |
| Max length | 80 |
| Examples | `Spirits`, `Wine` |
| Normalization | trim; apply legacy alias map consistent with `normalizeStockCategory` / `STOCK_CATEGORIES` |
| Validation | unknown after normalize → **WARNING** `UNKNOWN_CATEGORY` with proposed `Other` |
| Identity match | no |
| UPDATE may change | **yes** (explicit update) |

Allowed values (current catalog):
`Spirits`, `Syrups & Purées`, `Beverages`, `Wine`, `Fresh`, `Consumables`, `Other`.

#### `itemType`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.item_type` |
| Type | string |
| Required | **OPTIONAL** |
| Default | `Other` |
| Nullable | no at apply |
| Max length | 80 |
| Examples | `Vodka`, `Red Wine` |
| Normalization | trim; normalize via category type options (`normalizeStockItemType` / `STOCK_TYPES_BY_CATEGORY`) |
| Validation | unknown for category → **WARNING**; proposed `Other` |
| Identity match | no |
| UPDATE may change | **yes** (explicit update) |

#### `minimumQuantity`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.minimum_quantity` |
| Type | number (`numeric(12,3)`) |
| Required | **OPTIONAL** |
| Default | `0` |
| Nullable | no at apply |
| Normalization / validation | same numeric rules as quantity; must be ≥ 0 |
| Identity match | no |
| UPDATE may change | **yes** (explicit update) |

#### `targetQuantity`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.target_quantity` |
| Type | number or null (`numeric(12,3)`) |
| Required | **OPTIONAL** |
| Default | `null` |
| Nullable | **yes** |
| Normalization / validation | empty → null; else ≥ 0 finite |
| Identity match | no |
| UPDATE may change | **yes** (explicit update) |

#### `storageLocation`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.storage_location` |
| Type | string |
| Required | **OPTIONAL** |
| Default | category default from `STOCK_DEFAULT_LOCATION_BY_CATEGORY`, else `Main Storage` — **only after confirmation when source was empty/unknown** |
| Nullable | no at apply |
| Max length | 80 |
| Examples | `Bar`, `Main Storage` |
| Normalization | trim; exact case-insensitive match to `STOCK_LOCATIONS` |
| Validation | unknown → **WARNING** `UNKNOWN_LOCATION`; apply uses `Main Storage` only if session confirmation `confirmUnknownLocationFallback` is true |
| Identity match | **yes** (with name) |
| UPDATE may change | **yes** (explicit update) |

Allowed values (current catalog):
`Main Storage`, `Bar`, `Fridge`, `Freezer`, `Wine Storage`, `Coffee Station`, `Kitchen`, `Other`.

#### `costPrice`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.cost_price` |
| Type | number (`numeric(12,2)`) |
| Required | **OPTIONAL** |
| Default | `0` |
| Nullable | no at apply |
| Normalization / validation | decimal rules; ≥ 0; else ERROR `INVALID_COST` |
| Identity match | no |
| UPDATE may change | **yes** (explicit update) |

#### `supplier`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.supplier` (text only in V1 apply) |
| Type | string |
| Required | **OPTIONAL** |
| Default | `''` |
| Nullable | no at apply (empty string) |
| Max length | 200 |
| Normalization | trim; preserve display case; matching/compare uses casefold |
| Validation | length only; no supplier entity creation |
| Identity match | no |
| UPDATE may change | **yes** (explicit update) |

**Not written by Import V1 apply:** `stock_items.supplier_id`. Optional future resolve is out of contract scope.

#### `active`

| Attribute | Value |
|-----------|--------|
| Destination | `stock_items.active` |
| Type | boolean |
| Required | **OPTIONAL** |
| Default | `true` |
| Nullable | no at apply |
| Accepted inputs | `true`/`false`, `1`/`0`, `yes`/`no`, `y`/`n`, `active`/`inactive` (case-insensitive) |
| Validation | unparseable → ERROR `MALFORMED_BOOLEAN` |
| Identity match | no |
| UPDATE may change | **yes** (explicit update) |

### 3.2 Staged-only / deferred fields (no valid `stock_items` column today)

Verified against `supabase/stock_items_schema.sql` and alters: **no** `sku`, `barcode`, or `notes` columns on `stock_items`.

#### `sku`

| Attribute | Value |
|-----------|--------|
| Classification | **Staged-only V1 metadata** (deferred persistence until schema support) |
| Destination | none |
| Required | OPTIONAL |
| Max length | 64 |
| Normalization | trim; preserve as string (leading zeros) |
| Validation | length; in-file duplicate SKU → ERROR among non-empty SKUs |
| DB identity match | **not operational** in V1 |
| Apply | **must not** write to `stock_items` |

#### `barcode`

| Attribute | Value |
|-----------|--------|
| Classification | **Staged-only V1 metadata** (deferred persistence until schema support) |
| Destination | none |
| Required | OPTIONAL |
| Max length | 64 |
| Normalization | trim; preserve as string |
| Validation | length; in-file duplicate barcode → ERROR among non-empty barcodes |
| DB identity match | **not operational** in V1 |
| Apply | **must not** write to `stock_items` |

#### `notes`

| Attribute | Value |
|-----------|--------|
| Classification | **Deferred until schema support** (may be kept in staged JSON for audit only) |
| Destination | none |
| Required | OPTIONAL |
| Max length | 2000 (staged) |
| Apply | **must not** write to `stock_items` |

### 3.3 Explicitly not in Import V1 field contract

| Field | Reason |
|-------|--------|
| `orderQuantity` / `order_quantity` | Exists on `stock_items` but not imported in V1 |
| `supplierId` / `supplier_id` | Not auto-created/resolved on apply in V1 |
| Recipe / pack conversion fields | Out of scope |

---

## 4. Normalized row contract

Independent of CSV/XLSX parser library. Conceptual shape (documentation example):

```json
{
  "sourceRowNumber": 2,
  "raw": {
    "cellsBySourceHeader": { "Product": "Ketel One", "Unit": "bottle" },
    "cellsByMappedField": { "name": "Ketel One", "unit": "bottle" }
  },
  "normalized": {
    "name": "Ketel One",
    "unit": "Bottle",
    "currentQuantity": 12,
    "category": "Spirits",
    "itemType": "Vodka",
    "minimumQuantity": 6,
    "targetQuantity": null,
    "storageLocation": "Bar",
    "costPrice": 24.5,
    "supplier": "Malakakos AE",
    "sku": null,
    "barcode": null,
    "notes": null,
    "active": true
  },
  "mappingEvidence": {
    "fieldSources": { "name": "Product", "unit": "Unit" }
  },
  "validationState": "warning",
  "validationMessages": [],
  "conflictState": "none",
  "conflictEvidence": {},
  "proposedAction": "create",
  "selectedAction": null,
  "matchedStockItemId": null,
  "sourceFingerprint": "sha256:…",
  "applyState": "pending",
  "applyResult": null
}
```

### 4.1 Field meanings

| Field | Meaning |
|-------|---------|
| `sourceRowNumber` | 1-based data row index in the selected sheet after header (stable for the session) |
| `raw` | Original cell strings after parse; never authoritative for apply |
| `normalized` | Values after normalization pipeline; candidate for apply |
| `mappingEvidence` | Which source headers fed which destination fields |
| `validationState` | See §6 |
| `validationMessages` | Array of structured messages (§7) |
| `conflictState` | See §6 |
| `conflictEvidence` | Match candidates, duplicate peers, fingerprints |
| `proposedAction` | System proposal |
| `selectedAction` | Operator override or confirmed proposal; null until review |
| `matchedStockItemId` | Existing `stock_items.id` when LINK/UPDATE targets one item |
| `sourceFingerprint` | Stable hash of session identity + row identity inputs (see §12) |
| `applyState` | See §6 |
| `applyResult` | Post-apply evidence for this row |

Effective action for apply = `selectedAction` if set, else `proposedAction`.

---

## 5. Session lifecycle

Session status values (lowercase snake_case):

`draft` → `parsing` → `mapping` → `validating` → `review` → `ready` → `applying` → `completed`
Parallel terminal / failure paths: `failed`, `cancelled`

### 5.1 States

| Status | Meaning |
|--------|---------|
| `draft` | Session created; file metadata may be attached; parse not finished |
| `parsing` | Parser running or parse result being persisted to staged rows |
| `mapping` | Header/sheet confirmed; operator editing column mapping |
| `validating` | Normalization + validation + conflict detection in progress |
| `review` | Operator reviewing rows and selecting actions |
| `ready` | Apply eligibility satisfied; awaiting explicit confirm |
| `applying` | Server apply in progress (exclusive lock) |
| `completed` | Apply finished with recorded result evidence (success or partial — see §10) |
| `failed` | Unrecoverable session failure before/during apply without a completed apply result |
| `cancelled` | Operator cancelled before successful apply completion |

### 5.2 Allowed transitions

| From | To |
|------|-----|
| `draft` | `parsing`, `cancelled` |
| `parsing` | `mapping`, `failed`, `cancelled` |
| `mapping` | `validating`, `parsing` (re-parse/re-sheet), `cancelled` |
| `validating` | `review`, `mapping` (remap), `failed`, `cancelled` |
| `review` | `ready`, `validating` (revalidate), `mapping`, `cancelled` |
| `ready` | `applying`, `review`, `cancelled` |
| `applying` | `completed`, `failed` |
| `completed` | *(none — immutable)* |
| `failed` | `cancelled` only if never applied; otherwise immutable once apply evidence exists |
| `cancelled` | *(none — immutable)* |

### 5.3 Capabilities by state

| Status | Mapping change | Staged rows change | Apply may begin | Cancel allowed | Immutable |
|--------|----------------|--------------------|-----------------|----------------|-----------|
| `draft` | no | limited (meta) | no | yes | no |
| `parsing` | no | yes (write rows) | no | yes | no |
| `mapping` | **yes** | no (except clear on re-parse) | no | yes | no |
| `validating` | no | yes (validation fields) | no | yes | no |
| `review` | no* | action/selection only | no | yes | no |
| `ready` | no | no | **yes** | yes | no |
| `applying` | no | apply fields only | n/a (in progress) | no | soft lock |
| `completed` | no | no | **no** | no | **yes** |
| `failed` | no | no | no | limited | **yes** if apply started |
| `cancelled` | no | no | **no** | no | **yes** |

\* Returning to `mapping` requires an explicit transition (clears `ready` and requires revalidation).

### 5.4 Reapply rule

A session that reached `completed` or that recorded an apply attempt **must not** be silently reopened and reapplied. New imports require a **new session**. Idempotent duplicate submit of the same apply request returns the original apply evidence (see §10).

---

## 6. Row lifecycle

Three orthogonal dimensions (do not collapse):

### 6.1 Validation state

| Value | Meaning |
|-------|---------|
| `pending` | Not yet validated |
| `valid` | No WARNING or ERROR messages |
| `warning` | One or more WARNING; no ERROR |
| `error` | One or more ERROR |

If both warnings and errors exist → `error`.

### 6.2 Conflict state

| Value | Meaning |
|-------|---------|
| `none` | No conflict detected |
| `exact_match` | Exactly one safe existing-item match under §8 |
| `possible_match` | Name-only or weak candidate(s); not safe for auto LINK |
| `duplicate_in_file` | Conflicts with another staged row in this session |
| `duplicate_previous_import` | Fingerprint matches a previously applied import row (same workspace) |
| `ambiguous` | Multiple equally plausible existing matches |

### 6.3 Action (`proposedAction` / `selectedAction`)

| Value | Meaning |
|-------|---------|
| `create` | Create one new `stock_items` row |
| `link` | Associate with existing item; no field/qty mutation by default |
| `update` | Explicit mutation of allow-listed fields and/or quantity |
| `skip` | No destination write |
| `manual_review` | Unresolved; blocks apply |

### 6.4 Apply state

| Value | Meaning |
|-------|---------|
| `pending` | Not applied |
| `applied` | Destination write or link recorded successfully |
| `skipped` | Intentionally not written (`skip` action) |
| `failed` | Attempted apply failed for this row |

---

## 7. Validation code catalogue

Every validation message object:

| Property | Type | Meaning |
|----------|------|---------|
| `code` | string | Stable machine code below |
| `severity` | `warning` \| `error` | |
| `field` | string \| null | Normalized field name |
| `message` | string | Human-readable |
| `sourceValue` | string \| null | Safe display of raw input |
| `normalizedValue` | string \| number \| boolean \| null | |
| `overrideable` | boolean | Whether operator can proceed despite this code |
| `scope` | `session` \| `row` | |
| `applyBlocking` | boolean | Blocks apply while present/unresolved |

### 7.1 File / session codes

| Code | Severity | Scope | Overrideable | Apply-blocking |
|------|----------|-------|--------------|----------------|
| `UNSUPPORTED_FORMAT` | error | session | no | yes |
| `UNREADABLE_FILE` | error | session | no | yes |
| `EMPTY_WORKBOOK` | error | session | no | yes |
| `NO_USABLE_SHEET` | error | session | no | yes |
| `FILE_TOO_LARGE` | error | session | no | yes |
| `EXCESSIVE_ROWS` | error | session | no | yes |
| `EXCESSIVE_COLUMNS` | error | session | no | yes |

### 7.2 Header / mapping codes

| Code | Severity | Scope | Overrideable | Apply-blocking |
|------|----------|-------|--------------|----------------|
| `MISSING_HEADER` | error | session | no | yes |
| `DUPLICATE_SOURCE_HEADERS` | error | session | no | yes |
| `REQUIRED_DESTINATION_UNMAPPED` | error | session | no | yes |
| `DESTINATION_MAPPED_MORE_THAN_ONCE` | error | session | no | yes |
| `AMBIGUOUS_AUTOMATIC_MAPPING` | warning | session | yes (manual map) | yes until resolved |

### 7.3 Row value codes

| Code | Severity | Scope | Overrideable | Apply-blocking |
|------|----------|-------|--------------|----------------|
| `MISSING_ITEM_NAME` | error | row | no | yes |
| `MISSING_UNIT` | error | row | no | yes |
| `MISSING_QUANTITY` | error | row | no | yes |
| `INVALID_NUMERIC` | error | row | no | yes |
| `NEGATIVE_QUANTITY` | error | row | no | yes |
| `INVALID_COST` | error | row | no | yes |
| `VALUE_TOO_LONG` | error | row | no | yes |
| `UNKNOWN_UNIT` | error | row | no | yes |
| `UNKNOWN_LOCATION` | warning | row | yes (session fallback confirm) | yes until confirmed or location remapped/skipped |
| `UNKNOWN_CATEGORY` | warning | row | yes (accept `Other`) | yes until confirmation recorded |
| `UNSUPPORTED_FORMULA_VALUE` | error | row | no | yes |
| `MALFORMED_BOOLEAN` | error | row | no | yes |

### 7.4 Conflict codes

| Code | Severity | Scope | Overrideable | Apply-blocking |
|------|----------|-------|--------------|----------------|
| `DUPLICATE_ROW_IN_FILE` | error | row | no* | yes |
| `DUPLICATE_SKU_IN_FILE` | error | row | no* | yes |
| `DUPLICATE_BARCODE_IN_FILE` | error | row | no* | yes |
| `EXACT_EXISTING_ITEM_MATCH` | warning | row | yes (choose link/update/skip) | yes until action ≠ `manual_review` |
| `AMBIGUOUS_EXISTING_ITEM_MATCH` | error | row | no (must pick skip or resolve to single target) | yes while `manual_review` |
| `REPEATED_SOURCE_FINGERPRINT` | error | row | no | yes |
| `PREVIOUSLY_APPLIED_ROW` | error | row | no* | yes |

\* Operator may set action to `skip` to clear apply-blocking for that row without mutating stock.

---

## 8. Conflict and matching contract

### 8.1 Matching precedence (design order)

1. Exact stable identifier (`stock_items.id`) — only if an import column maps to an existing id (not a V1 spreadsheet requirement)
2. Barcode exact match — **not operational** until schema support
3. SKU exact match — **not operational** until schema support
4. **Normalized name + normalized storage location** (workspace-scoped) — **primary V1 matcher**
5. Normalized name only → `possible_match` / `ambiguous` (never auto LINK)

### 8.2 Safe fallback for current schema

With no `sku`/`barcode` columns on `stock_items`:

- **Exact match** = exactly one active-or-inactive stock item in the workspace with the same normalized name **and** normalized storage location.
- Zero matches → propose `create` (if validation allows).
- One exact match → propose `link` (not `update`).
- Multiple name+location matches (data anomaly) or multiple name-only candidates → `ambiguous` / `manual_review`.

Inactive items may still match; linking to inactive does not auto-reactivate unless `update` includes `active`.

### 8.3 Actions

#### CREATE

- No safe existing match
- No unresolved blocking validation for the row
- Creates exactly one `stock_items` row from normalized persistable fields

#### LINK

- Associates staged row with `matchedStockItemId`
- Does **not** modify quantity or catalog fields by default
- Records link evidence on the import row

#### UPDATE

- Explicit operator `update` selection
- Must record `updateFieldAllowList` (subset of persistable fields)
- Quantity change requires `updateCurrentQuantity: true` independently
- No wholesale overwrite from raw spreadsheet object

Default UPDATE allow-list candidates (all still explicit):
`name`, `unit`, `category`, `itemType`, `minimumQuantity`, `targetQuantity`, `storageLocation`, `costPrice`, `supplier`, `active`
Quantity: only with `updateCurrentQuantity`.

#### SKIP

- No destination mutation
- Outcome retained in session evidence; `applyState` → `skipped`

#### MANUAL REVIEW

- Ambiguous or unsupported conflict
- Blocks V1 apply until changed to an eligible action (including `skip`)

**No silent destructive merge.**

---

## 9. Apply eligibility contract

Apply may start only when **all** are true:

1. Session `workspace_id` equals caller’s current workspace
2. Caller can manage workspace stock
3. Session status is `ready`
4. Mapping complete; required destinations mapped: `name`, `unit`, `currentQuantity`
5. Parsing completed; staged rows present (or explicitly empty file rejected earlier)
6. Validation completed (`validationState` not `pending` on any non-skipped eligibility set)
7. No session-level ERROR codes
8. No row with `validationState = error` whose effective action is not `skip`
9. No row whose effective action is `manual_review`
10. No apply already in progress (`applying`) or completed for this session
11. Operator confirmations recorded as required:
    - `confirmUnknownLocationFallback` if any eligible row uses location fallback
    - `confirmUnknownCategoryDefault` if any eligible row accepts proposed `Other`
    - Explicit confirm of apply intent
12. Staged row fingerprints stable since last validation (`mappingVersion` / content hash unchanged)

### WARNING rows

Eligible when:

- severity is warning-only, and
- all required explicit confirmations for those warning codes are recorded, and
- effective action is one of `create` | `link` | `update` | `skip`

---

## 10. Apply result contract

### 10.1 Result evidence (session-level)

| Field | Meaning |
|-------|---------|
| `eligibleRowCount` | Rows considered for apply |
| `createdCount` | Successful creates |
| `linkedCount` | Successful links |
| `updatedCount` | Successful updates |
| `skippedCount` | Skipped |
| `failedCount` | Failed attempts |
| `createdStockItemIds` | uuid[] |
| `linkedStockItemIds` | uuid[] |
| `updatedStockItemIds` | uuid[] |
| `rowFailures` | Per-row `{ sourceRowNumber, code, message }` |
| `startedAt` / `completedAt` | timestamptz |
| `operatorUserId` | auth user |
| `sessionId` | uuid |
| `idempotencyKey` | Stable key for this apply attempt |
| `idempotencyResult` | `performed` \| `replayed` |

### 10.2 Session outcomes

| Outcome | Session status | Notes |
|---------|----------------|-------|
| All successful | `completed` | `failedCount = 0` |
| Partially failed | `completed` | Some rows failed; evidence retained; **no silent retry of whole session** — new session for remainder if needed |
| Fully failed | `failed` or `completed` with all failed | Prefer `failed` if no durable destination writes; `completed` if any write committed |
| Duplicate submission | unchanged (`completed`/`applying`) | Return prior evidence; `idempotencyResult = replayed` |
| Cancelled before apply | `cancelled` | No destination writes |
| Apply interrupted | `failed` or remain `applying` until recovery job | Recovery must be server-side; client must not invent completion |

---

## 11. Client vs server responsibilities

| Responsibility | Client | Server |
|----------------|--------|--------|
| File selection | yes | no |
| Constrained initial parse | yes | may re-verify structure |
| Sheet / header selection | yes | persist + enforce |
| Mapping UI | yes | persist + enforce |
| Preview rendering | yes | — |
| Operator action selection | yes | persist + enforce eligibility |
| Permissions | display only | **authoritative** |
| Workspace ownership | — | **authoritative** |
| Session mutation rules / transitions | suggest | **authoritative** |
| DB conflict checks | advisory preview | **authoritative** before apply |
| Idempotency | send key | **authoritative** |
| Final apply eligibility | gate UI | **authoritative** |
| Destination writes | **never** | **only via Apply RPC** |
| Final result evidence | display | **authoritative** |

### Normalization / validation trust

- Client may run normalization and validation for UX.
- Server **must** re-run or verify normalization, validation, and conflict detection against current DB before apply.
- Client-provided `validationState` / `proposedAction` are **never** authoritative.

---

## 12. Conceptual persistence model

No SQL in this sprint. Conceptual tables for the next schema sprint:

### 12.1 `inventory_import_sessions`

| Concept | Notes |
|---------|--------|
| `id` | uuid PK |
| `workspace_id` | uuid NOT NULL |
| `created_by` / `updated_by` | auth user uuid |
| `source_filename` | text |
| `source_format` | `csv` \| `xlsx` |
| `source_byte_size` | int |
| `source_fingerprint` | text (file hash) |
| `parser_version` | text |
| `normalization_version` | text |
| `validation_rules_version` | text |
| `contract_version` | text (this document’s version id) |
| `selected_sheet` | text / index |
| `header_row_index` | int |
| `mapping` | jsonb |
| `status` | enum §5 |
| Counters | total/valid/warning/error/create/link/update/skip/manual/applied/failed |
| `confirmations` | jsonb (fallback flags, apply confirm) |
| `apply_evidence` | jsonb (§10) |
| `apply_idempotency_key` | text nullable unique per session when set |
| Timestamps | `created_at`, `updated_at`, `ready_at`, `apply_started_at`, `completed_at`, `cancelled_at` |

### 12.2 `inventory_import_rows`

| Concept | Notes |
|---------|--------|
| `id` | uuid PK |
| `session_id` | uuid FK |
| `workspace_id` | uuid (denormalized for RLS) |
| `source_row_number` | int |
| `raw_payload` | jsonb |
| `normalized_payload` | jsonb |
| `validation_state` | §6.1 |
| `validation_messages` | jsonb |
| `conflict_state` | §6.2 |
| `conflict_evidence` | jsonb |
| `proposed_action` / `selected_action` | §6.3 |
| `matched_stock_item_id` | uuid nullable |
| `source_fingerprint` | text |
| `apply_state` | §6.4 |
| `apply_result` | jsonb |
| Timestamps | `created_at`, `updated_at` |

### 12.3 Uniqueness and indexing concepts

| Rule | Purpose |
|------|---------|
| Unique `(session_id, source_row_number)` | Stable row identity |
| Unique `(session_id, source_fingerprint)` | Prevent duplicate staged fingerprints in one session |
| At most one in-flight apply per session (`status = applying` or non-null apply lock) | Concurrency |
| Index `(workspace_id, status)` | Operator lists |
| Index `(workspace_id, source_fingerprint)` on applied rows / sessions | Rerun detection |

---

## 13. Versioning

| Version key | Purpose |
|-------------|---------|
| `contract_version` | This document revision (e.g. `import_v1.0`) |
| `parser_version` | CSV/XLSX parser implementation id |
| `normalization_version` | Normalization rule set id |
| `validation_rules_version` | Validation catalogue id |
| `mapping_schema_version` | Mapping JSON shape id |

### Stale session rule

A staged session remains bound to the versions recorded when it was last validated.

After parser/validation changes:

- Old sessions are **not** silently reinterpreted.
- Operator must **explicitly revalidate** (transition through `validating`) to upgrade versions, or cancel and create a new session.
- Apply rejects version mismatch between session-recorded versions and server-required minimums unless revalidated.

---

## 14. Explicit V1 exclusions

Out of this contract sprint and generally outside Import V1 unless a later contract revises them:

- `.xls`
- Automatic supplier creation
- Recipe import
- Pack/unit conversion math
- Arbitrary spreadsheet cell editing
- Automatic destructive merge
- Automatic current-quantity overwrite
- Permanent raw-file blob storage
- Scheduled recurring imports
- Background POS synchronization
- Cross-workspace mapping templates
- Multi-workspace import in one session
- Writing `inventory_items` or migration map rows
- Persisting `sku` / `barcode` / `notes` onto `stock_items` without schema support
- Writing `supplier_id` / `order_quantity` on apply

---

## 15. Open schema gaps discovered

| Gap | Impact |
|-----|--------|
| No `sku` on `stock_items` | SKU cannot be destination or DB matcher in V1 |
| No `barcode` on `stock_items` | Barcode cannot be destination or DB matcher in V1 |
| No `notes` on `stock_items` | Notes stay staged-only / deferred |
| `unit` has no DB CHECK against presets | Import enforces catalog in contract; DB still free text |
| No natural-key UNIQUE on `(workspace_id, name, storage_location)` | Matching is application-level; duplicates possible in catalog |
| `inventory_items` lacks `workspace_id` | Confirms Import must not use it as onboarding store |

---

## 16. Document control

| Field | Value |
|-------|--------|
| Contract id | `import_v1.0` |
| Field contract | `import_field_contract_v1` |
| Validation catalogue | `import_validation_v1` |
| Lifecycle | `import_session_lifecycle_v1` / `import_row_lifecycle_v1` |
| Supersedes | none |
| Related | `docs/stock_inventory_migration_runbook.md` (migration only; not import staging) |
