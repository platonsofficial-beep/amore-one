# Stock Inventory Migration Runbook

**Pipeline:** P7.4.x → P7.5.0 → P7.8.x session stages → **P8.13.0 Phase 1 production verification**
**Document:** Production operator runbook
**Audience:** Operators running migration via ONE Operator Panel and/or Supabase SQL editor

This document is documentation only. It does not execute migrations.

---

## Canonical production Phase 1 path (REQUIRED)

**Production Phase 1 uses only the session-owned RPC:**

`public.run_inventory_migration_phase1(p_workspace_id, p_session_id)`

**ONE Operator flow (canonical):**

1. Preview / Preflight workspaces (read-only readiness)
2. Operator Panel eligibility (session running, `phase1` waiting, preview completed)
3. Acknowledge attention if preview → phase1 requires acknowledgement
4. Operator Panel **Phase 1** → `runInventoryMigrationPhase1` → RPC above
5. Refresh metrics / session steps
6. Run read-only verification: `supabase/inventory_migration_phase1_runtime_validation.sql`

**Do not** run the legacy DO-block for production:

| Status | File |
|--------|------|
| **DEPRECATED — not production** | `supabase/inventory_movement_execute_phase1.sql` |
| **Canonical Phase 1 RPC** | `supabase/inventory_migration_phase1_rpc.sql` |
| **Read-only post-run verification** | `supabase/inventory_migration_phase1_runtime_validation.sql` |

Deploy check (expected: non-null OID):

```sql
select to_regprocedure('public.run_inventory_migration_phase1(uuid,uuid)');
```

Grants (expected: EXECUTE for `authenticated` only; not `public` / `anon`):

```sql
select
  has_function_privilege(
    'authenticated',
    'public.run_inventory_migration_phase1(uuid,uuid)'::regprocedure,
    'EXECUTE'
  ) as authenticated_execute,
  has_function_privilege(
    'public',
    'public.run_inventory_migration_phase1(uuid,uuid)'::regprocedure,
    'EXECUTE'
  ) as public_execute,
  has_function_privilege(
    'anon',
    'public.run_inventory_migration_phase1(uuid,uuid)'::regprocedure,
    'EXECUTE'
  ) as anon_execute;
```

---

## Purpose

### Scope

Migrate legacy `inventory_items` into the workspace-scoped Stock V1 catalog (`stock_items`) using the durable identity map `inventory_stock_item_map`, then:

1. Create deterministic `stock_movements` ledger rows for quantity deltas (Phase 1).
2. Apply those deltas to `stock_items.current_quantity` once, marked by `migrated_at` (Phase 2).
3. Prove consistency with a read-only post-apply audit.

Out of scope for this pipeline:

- Supplier catalog mutation
- Bar Refill schema changes
- Rewriting Phase 1 movement semantics

### Preconditions

Before any write step:

1. `public.workspaces`, `public.stock_items`, and `public.stock_movements` exist (Stock V1 schemas applied).
2. Foundation map applied once: `supabase/inventory_stock_item_map.sql`.
3. Session migration RPCs applied (including `inventory_migration_phase1_rpc.sql`).
4. Part A of `inventory_migration_phase1_runtime_validation.sql` PASSes (RPC deployed + grants).
5. Database backup completed and confirmed restorable.
6. A controlled maintenance window is scheduled for Phase 1 + Phase 2 (see below).

### Supported version

This runbook matches the repository migration scripts on `main`.

**Legacy SQL editor pipeline (historical / non-session)** — retained for reference only. Prefer ONE Operator Panel + session RPCs for production.

| Step | Script | Notes |
|------|--------|--------|
| Foundation | `supabase/inventory_stock_item_map.sql` | Still required |
| Orchestrator (read-only) | `supabase/inventory_migration_orchestrator.sql` | Optional dry-run |
| Persist (legacy) | `supabase/inventory_stock_map_persist.sql` | Prefer session `run_inventory_migration_persist` |
| Auto-link (legacy) | `supabase/inventory_stock_map_auto_link.sql` | Prefer session RPC |
| Auto-create (legacy) | `supabase/inventory_stock_map_auto_create.sql` | Prefer session RPC |
| Integrity audit (legacy) | `supabase/inventory_stock_integrity_audit.sql` | Prefer session RPC |
| Movement preflight (legacy) | `supabase/inventory_movement_preflight.sql` | Prefer session RPC |
| Movement preview (legacy) | `supabase/inventory_movement_preview.sql` | Prefer session RPC |
| Phase 1 | **`supabase/inventory_migration_phase1_rpc.sql`** | **Canonical** |
| Phase 1 (legacy DO-block) | `supabase/inventory_movement_execute_phase1.sql` | **DEPRECATED** |
| Phase 2 | Prefer `supabase/inventory_migration_phase2_rpc.sql` | Session-owned |
| Post-apply audit | Prefer session post-apply RPC / `inventory_post_apply_audit.sql` | Read-only proof |

Do not mix scripts from divergent branches without re-validating the runbook.

---

## Maintenance Window

### Required duration

Allocate a single continuous window long enough to run **Phase 1 → Phase 2 → post-apply audit** without interruption. Earlier steps (persist through preview) may run before the window if no stock quantity activity depends on them; **Phase 1 and Phase 2 must not be separated by normal operations**.

Recommended pattern:

1. Complete steps 1–6 (persist → preview) in a quiet period.
2. Enter maintenance window.
3. Run steps 7–9 (Phase 1 → Phase 2 → post-apply audit) back-to-back.
4. Exit maintenance only after post-apply audit **PASSED**.

### No stock activity

Between Phase 1 and Phase 2 (and during Phase 2):

- No stock receives, usage, wastage, adjustments, or stock counts
- No order receipts that write `stock_movements` / update quantities
- No manual `current_quantity` edits

Phase 1 stores a **delta** against stock quantity at Phase 1 time. Intervening stock activity makes that delta wrong relative to live quantity.

### Backup confirmation

Before step 1 (and again before Phase 1 if steps 1–6 ran earlier):

- [ ] Backup taken
- [ ] Restore procedure known
- [ ] Stakeholder notified of maintenance window

---

## Execution Order

Run scripts **manually** in the Supabase SQL editor in this exact order:

1. Persist classifications — `inventory_stock_map_persist.sql`
2. Auto-link — `inventory_stock_map_auto_link.sql`
3. Auto-create — `inventory_stock_map_auto_create.sql`
4. Integrity audit — `inventory_stock_integrity_audit.sql`
5. Movement preflight — `inventory_movement_preflight.sql`
6. Movement preview — `inventory_movement_preview.sql`
7. Phase 1 movement creation — **canonical:** Operator Panel / `run_inventory_migration_phase1` (NOT legacy `inventory_movement_execute_phase1.sql`)
8. Phase 2 quantity apply — prefer session `run_inventory_migration_phase2`
9. Post-apply audit — session post-apply / `inventory_post_apply_audit.sql`
10. Phase 1 read-only verification — `inventory_migration_phase1_runtime_validation.sql` (after step 7; safe anytime)

Optional before step 1: orchestrator dry-run and/or dry-run classifier (read-only).

---

## Operator Checklist

### Step 0 — Orchestrator (recommended)

| | |
|---|---|
| **SQL file** | `supabase/inventory_migration_orchestrator.sql` |
| **Expected outcome** | NOTICE sections A–D; prerequisite tables present |
| **Pass criteria** | `READY FOR CONTROLLED EXECUTION` |
| **Stop conditions** | `SETUP REQUIRES ATTENTION` — apply missing schemas/map foundation first |

### Step 1 — Persist classifications

| | |
|---|---|
| **SQL file** | `supabase/inventory_stock_map_persist.sql` |
| **Expected outcome** | Map rows upserted with classifications; `created`/`linked` protected |
| **Pass criteria** | NOTICE completes without unexpected error spike; protected rows retain `stock_item_id` / `migrated_at` |
| **Stop conditions** | Mass errors; unexpected overwrite of created/linked rows |

### Step 2 — Auto-link

| | |
|---|---|
| **SQL file** | `supabase/inventory_stock_map_auto_link.sql` |
| **Expected outcome** | Eligible `classified` + `auto_link` rows → `status = linked` |
| **Pass criteria** | Only status finalization; no unexpected `stock_item_id` writes |
| **Stop conditions** | High error count; workspace mismatches dominating results |

### Step 3 — Auto-create

| | |
|---|---|
| **SQL file** | `supabase/inventory_stock_map_auto_create.sql` |
| **Expected outcome** | New `stock_items` from `source_snapshot`; map → `status = created` with `stock_item_id` |
| **Pass criteria** | Created count matches expectations; supplier_id left null; second run creates ~0 |
| **Stop conditions** | Orphan inserts without map update; large error counter |

### Step 4 — Integrity audit

| | |
|---|---|
| **SQL file** | `supabase/inventory_stock_integrity_audit.sql` |
| **Expected outcome** | NOTICE categories A–R; no writes |
| **Pass criteria** | No critical integrity failures (duplicate keys, orphan refs, cross-workspace, null stock on created/linked) |
| **Stop conditions** | Any critical integrity failure — investigate before movements |

### Step 5 — Movement preflight

| | |
|---|---|
| **SQL file** | `supabase/inventory_movement_preflight.sql` |
| **Expected outcome** | Eligibility counts for `created`/`linked` rows |
| **Pass criteria** | Eligible / blocked / coverage understood; no surprise mass blocks |
| **Stop conditions** | Preflight incomplete due to missing objects; majority blocked without known cause |

### Step 6 — Movement preview

| | |
|---|---|
| **SQL file** | `supabase/inventory_movement_preview.sql` |
| **Expected outcome** | Result set of planned IN/OUT/UNCHANGED; NOTICE summary |
| **Pass criteria** | Operators review and accept planned deltas before Phase 1 |
| **Stop conditions** | Unexpected large OUT movements; preview incomplete; do **not** proceed to Phase 1 |

### Step 7 — Phase 1 movement creation

| | |
|---|---|
| **Canonical path** | ONE Operator Panel → **Phase 1** → `public.run_inventory_migration_phase1(workspace, session)` |
| **RPC source** | `supabase/inventory_migration_phase1_rpc.sql` |
| **Post-run verification** | `supabase/inventory_migration_phase1_runtime_validation.sql` (read-only) |
| **Expected outcome** | `stock_movements` with note `INITIAL_IMPORT\|map_id=<uuid>`; step `phase1` completed; **no** quantity apply; **no** `migrated_at` |
| **Pass criteria** | Operator Panel success; validation Part A+B PASS; second Phase 1 run mostly `duplicate_prevented`; stock quantities unchanged |
| **Stop conditions** | High `errors` / `blocked` in step result; duplicate INITIAL_IMPORT notes; do not start Phase 2 until investigated |
| **DEPRECATED** | `supabase/inventory_movement_execute_phase1.sql` — legacy DO-block; **do not use for production** |

### Step 8 — Phase 2 quantity apply

| | |
|---|---|
| **SQL file** | `supabase/inventory_movement_apply_phase2.sql` |
| **Expected outcome** | `current_quantity` updated; `migrated_at = now()` for applied rows |
| **Pass criteria** | Maintenance interlock set `v_confirm_maintenance_window := true` only under window; `EXECUTION PHASE 2 COMPLETE`; second run applies ~0 |
| **Stop conditions** | Confirmation still `false` (script refuses — correct); high blocked/errors; any stock activity since Phase 1 → **abort Phase 2**, investigate |

### Step 9 — Post-apply audit

| | |
|---|---|
| **SQL file** | `supabase/inventory_post_apply_audit.sql` |
| **Expected outcome** | NOTICE A–R; single verdict line |
| **Pass criteria** | `POST MIGRATION AUDIT PASSED` |
| **Stop conditions** | `POST MIGRATION AUDIT REQUIRES ATTENTION` — do not declare complete |

---

## Rollback Guidance

### What can be rerun safely (idempotent / read-only)

| Script | Behavior on rerun |
|--------|-------------------|
| Orchestrator | Read-only — safe anytime |
| Dry-run classifier | Read-only — safe anytime |
| Integrity audit | Read-only — safe anytime |
| Movement preflight | Read-only — safe anytime |
| Movement preview | Read-only — safe anytime |
| Post-apply audit | Read-only — safe anytime |
| Persist | Idempotent upsert; protects created/linked and `migrated_at` |
| Auto-link | Idempotent status finalization |
| Auto-create | Idempotent; skips rows that already have `stock_item_id` |
| Phase 1 (session RPC) | Idempotent via deterministic note `INITIAL_IMPORT\|map_id=<id>` + step completion gate |
| Phase 1 (legacy DO-block) | **DEPRECATED** — do not rerun in production |
| Phase 1 verification SQL | Read-only — safe anytime |
| Phase 2 | Idempotent via `migrated_at IS NULL` gate under map row lock |

### Which steps require investigation before retry

- **Phase 2 after stock activity between Phase 1 and Phase 2** — do not retry blindly; delta may be wrong. Investigate quantities vs preview before any further apply.
- **Duplicate `INITIAL_IMPORT` notes** — Phase 1/2 will block; do not delete ledger rows without investigation.
- **Integrity / post-apply ATTENTION** — resolve root cause before re-running write steps.
- **Partial Phase 2 failures** — per-row rollback leaves `migrated_at` NULL for failed rows; safe to retry Phase 2 for remaining eligible rows only after confirming no intervening stock activity.

### What this pipeline does not auto-rollback

- Created `stock_items` (auto-create) are not deleted by later scripts.
- Phase 1 `stock_movements` are not deleted by Phase 2 or audits.
- Restoring from backup is the only full environment rollback.

---

## Acceptance Criteria

Migration is **complete** only when all of the following are true:

1. **No integrity failures** — integrity audit shows no critical duplicate/orphan/cross-workspace/null-stock issues on created/linked rows.
2. **No blocked rows requiring action** — Phase 1/2 blocked counters are explained (e.g. intentional skips) or resolved; no stuck unapplied rows that have an `INITIAL_IMPORT` movement.
3. **Post-apply audit passes** — NOTICE ends with `POST MIGRATION AUDIT PASSED`.
4. **Movement coverage complete** — every successfully quantity-applied (`migrated_at` set) map row has exactly one matching `INITIAL_IMPORT|map_id=…` movement.
5. **Quantity application complete** — all rows that received a Phase 1 movement have `migrated_at` set; no stuck unapplied movements remain.

Until the post-apply audit passes, treat the migration as **in progress**, not production-complete.

---

## Quick reference — fingerprint queries

Capture before Phase 1 and after Phase 2 (read-only):

```sql
select 'map' as t, count(*) from public.inventory_stock_item_map
union all select 'migrated_at_set', count(*) from public.inventory_stock_item_map where migrated_at is not null
union all select 'stock_items', count(*) from public.stock_items
union all select 'stock_qty_sum', coalesce(sum(current_quantity),0)::bigint from public.stock_items
union all select 'stock_movements', count(*) from public.stock_movements
union all select 'initial_import', count(*) from public.stock_movements
  where note like 'INITIAL_IMPORT|map_id=%';
```
