-- Migration 005: Extend clients table with full business fields

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS second_name   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS type          VARCHAR(20)  NOT NULL DEFAULT 'particulier'
                                           CHECK (type IN ('particulier', 'entreprise')),
  ADD COLUMN IF NOT EXISTS category      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS city          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS email         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS patente       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rc            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ice           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS if_fiscal     VARCHAR(50);
