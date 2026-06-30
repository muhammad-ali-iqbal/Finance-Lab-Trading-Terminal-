-- migrations/007_transaction_fees.sql
--
-- Adds PSX brokerage fee tracking to the transactions ledger.
-- Fee schedule applied on every fill (buy and sell):
--   CDC settlement fee : 0.01% of transaction value, max PKR 10
--   NCCPL clearing fee : 0.017% of transaction value
--   PSX transaction fee: 0.003% of transaction value

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS fees NUMERIC(15,4) NOT NULL DEFAULT 0;
