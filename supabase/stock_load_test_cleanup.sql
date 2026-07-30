-- =============================================================================
-- Stock Load-Test Dataset CLEANUP — discoverability alias
-- =============================================================================
-- OFFICIAL P8.31.5 path (run this instead):
--   supabase/p8_31_5_controlled_test_catalog_cleanup.sql
--
-- This filename is retained from P8.17.2a so operators find the cleanup entry.
-- The executable body lives only in the official P8.31.5 file to prevent drift.
--
-- MANUAL EXECUTION ONLY — Supabase SQL Editor.
-- =============================================================================

do $p8_31_5_cleanup_alias$
begin
  raise exception
    'P8.31.5: run supabase/p8_31_5_controlled_test_catalog_cleanup.sql — that is the official controlled test catalog cleanup for ONE_STOCK_LOAD_TEST_2026_07.';
end;
$p8_31_5_cleanup_alias$;
