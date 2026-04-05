-- ═══════════════════════════════════════════════════════════
-- Dartech Payment System — Supabase SQL Schema
-- Run this in the Supabase SQL Editor (Database → SQL Editor)
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS TABLE ─────────────────────────────────────────────
-- Stores basic user info and subscription state
-- In production, this is likely managed by Supabase Auth (auth.users)
-- We keep a public profile table that mirrors it
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE,
  full_name     TEXT,

  -- Subscription fields
  subscription_status  TEXT NOT NULL DEFAULT 'inactive'
                         CHECK (subscription_status IN ('inactive', 'active', 'cancelled', 'expired')),
  subscription_start   TIMESTAMPTZ,
  subscription_end     TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PAYMENTS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reference           TEXT NOT NULL UNIQUE,       -- e.g. DTX-AB12CD34
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),

  -- Payment metadata
  amount              NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
  currency            TEXT NOT NULL DEFAULT 'USD',

  -- User-submitted proof fields (filled after InstaPay transfer)
  name                TEXT,
  last4digits         CHAR(4),
  transfer_time       TEXT,
  proof_image_url     TEXT,
  proof_submitted_at  TIMESTAMPTZ,

  -- Admin review fields
  reviewed_at         TIMESTAMPTZ,
  rejection_reason    TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUTO-UPDATE updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_user_id   ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_reference  ON public.payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
-- We use the service-role key on the backend which bypasses RLS.
-- Enable RLS anyway so the anon key can never read this data.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;

-- No public policies — only the service-role backend can access
-- (This means anon/authenticated Supabase client calls will be denied)

-- ─── SEED: Create a test user ─────────────────────────────────
-- (Optional — remove in production)
INSERT INTO public.users (id, email, full_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'test@dartech.ai', 'Test User')
ON CONFLICT DO NOTHING;
