-- ============================================================
-- Migration 002: Add source column to guidelines table
-- Run this ONLY if you already ran migration 001 before
-- the source column was added.
-- ============================================================
alter table guidelines
  add column if not exists source text default 'community'
    check (source in ('gpc_pdf', 'community'));
