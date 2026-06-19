-- Migration 020: Paramètres société étendus

ALTER TABLE print_settings
  ADD COLUMN IF NOT EXISTS sector       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS currency     VARCHAR(10)  DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS lang         VARCHAR(10)  DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS primary_color   VARCHAR(20) DEFAULT '#2f6bff',
  ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20) DEFAULT '#16a34a';

-- Libellé optionnel pour identifier l'usage du code (ex: "Pour Ahmed")
ALTER TABLE tenant_activation_codes
  ADD COLUMN IF NOT EXISTS label   VARCHAR(100);
