-- Table des codes d'activation mobile
CREATE TABLE IF NOT EXISTS tenant_activation_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        VARCHAR(6) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT NOW(),
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON tenant_activation_codes(code);
