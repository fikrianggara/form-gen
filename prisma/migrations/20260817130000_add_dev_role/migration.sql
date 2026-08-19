-- Add DEV role (TKT-047): operator-level permissions + API key issuance.
-- IF NOT EXISTS keeps this safe on DBs where the value already landed.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEV';
