-- ============================================
-- Migration: Add Subscription System to Workspaces
-- Description: Implements credit-based subscription tiers (Free, Basic, Pro)
-- Author: Claude Code
-- Date: 2025-11-11
-- ============================================

-- Step 1: Add subscription and credit columns to workspaces table
ALTER TABLE workspaces
  ADD COLUMN subscription_tier VARCHAR DEFAULT 'free',
  ADD COLUMN subscription_status VARCHAR DEFAULT 'active',
  ADD COLUMN stripe_customer_id VARCHAR,
  ADD COLUMN stripe_subscription_id VARCHAR,

  -- Credits tracking
  ADD COLUMN credits_monthly_allocated INT DEFAULT 100,
  ADD COLUMN credits_monthly_remaining INT DEFAULT 100,
  ADD COLUMN credits_purchased INT DEFAULT 0,
  ADD COLUMN credits_total_purchased INT DEFAULT 0,

  -- Billing periods
  ADD COLUMN billing_period_start TIMESTAMPTZ,
  ADD COLUMN billing_period_end TIMESTAMPTZ;

-- Step 2: Add indexes for better query performance
CREATE INDEX idx_workspaces_subscription_tier ON workspaces(subscription_tier);
CREATE INDEX idx_workspaces_stripe_customer_id ON workspaces(stripe_customer_id);
CREATE INDEX idx_workspaces_billing_period_end ON workspaces(billing_period_end);

-- Step 3: Add role column to user_workspaces for future team features
ALTER TABLE user_workspaces
  ADD COLUMN role VARCHAR DEFAULT 'owner';

CREATE INDEX idx_user_workspaces_role ON user_workspaces(role);

-- Step 4: Create credit purchases history table
CREATE TABLE credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  credits_purchased INT NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  stripe_payment_intent_id VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_purchases_workspace ON credit_purchases(workspace_id);
CREATE INDEX idx_credit_purchases_created_at ON credit_purchases(created_at);
CREATE INDEX idx_credit_purchases_stripe_payment ON credit_purchases(stripe_payment_intent_id);

-- Step 5: Add RLS policies for credit_purchases table
ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

-- Users can only see credit purchases for workspaces they belong to
CREATE POLICY credit_purchases_select_policy ON credit_purchases
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM user_workspaces
      WHERE user_id = auth.uid()
    )
  );

-- Step 6: Migrate ALL existing workspaces to Free plan with FRESH 100 credits
UPDATE workspaces SET
  subscription_tier = 'free',
  subscription_status = 'active',
  credits_monthly_allocated = 100,
  credits_monthly_remaining = 100,
  credits_purchased = 0,
  credits_total_purchased = 0,
  billing_period_start = NOW(),
  billing_period_end = NOW() + INTERVAL '1 month'
WHERE subscription_tier IS NULL;

-- Step 7: Add comments for documentation
COMMENT ON COLUMN workspaces.subscription_tier IS 'Subscription tier: free, basic, or pro';
COMMENT ON COLUMN workspaces.subscription_status IS 'Subscription status: active, past_due, canceled, or trialing';
COMMENT ON COLUMN workspaces.credits_monthly_allocated IS 'Monthly credit allocation based on tier (100 for free, 250 for basic, 500 for pro)';
COMMENT ON COLUMN workspaces.credits_monthly_remaining IS 'Remaining credits from monthly allocation (resets each billing period)';
COMMENT ON COLUMN workspaces.credits_purchased IS 'Purchased credits that never expire';
COMMENT ON COLUMN workspaces.credits_total_purchased IS 'Lifetime total of purchased credits for analytics';
COMMENT ON COLUMN workspaces.billing_period_start IS 'Start date of current billing period';
COMMENT ON COLUMN workspaces.billing_period_end IS 'End date of current billing period (when credits reset)';
COMMENT ON COLUMN user_workspaces.role IS 'User role in workspace: owner, admin, or member';
COMMENT ON TABLE credit_purchases IS 'History of one-time credit purchases';
