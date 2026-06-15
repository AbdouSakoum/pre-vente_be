-- Migration 008: ajouter numéro de commande et totaux HT/TVA/TTC

-- Séquence par tenant simulée via un compteur sur la table orders
-- order_number = numéro séquentiel auto par tenant (géré applicativement)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number   INT,
  ADD COLUMN IF NOT EXISTS total_ht       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_tva      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_ttc      NUMERIC(12,2);

-- Index pour accélerer la recherche du dernier order_number par tenant
CREATE INDEX IF NOT EXISTS idx_orders_tenant_order_number
  ON orders (tenant_id, order_number);
