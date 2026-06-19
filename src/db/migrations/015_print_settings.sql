-- Migration 015: Paramètres d'impression par tenant

CREATE TABLE IF NOT EXISTS print_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identité société
  company_name    VARCHAR(200),
  address         TEXT,
  city            VARCHAR(100),
  phone           VARCHAR(50),
  email           VARCHAR(200),

  -- Identifiants fiscaux
  ice             VARCHAR(50),
  if_fiscal       VARCHAR(50),
  rc              VARCHAR(50),
  patente         VARCHAR(50),

  -- Branding
  logo_url        TEXT,

  -- Pied de page
  footer_text     TEXT,

  -- Numérotation documents (compteurs séquentiels)
  facture_seq     INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_print_settings_tenant ON print_settings(tenant_id);
