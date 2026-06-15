-- Migration 012: Améliorations module stock
-- Fournisseurs, seuil alerte, prix achat, arrivages multi-lignes, charges livreurs

-- =====================
-- FOURNISSEURS
-- =====================
CREATE TABLE IF NOT EXISTS fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom VARCHAR(200) NOT NULL,
  telephone VARCHAR(30),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fournisseurs_tenant ON fournisseurs(tenant_id);

-- =====================
-- STOCK WAREHOUSE : seuil + prix achat
-- =====================
ALTER TABLE stock_warehouse
  ADD COLUMN IF NOT EXISTS seuil_alerte INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prix_achat NUMERIC(10,2) NOT NULL DEFAULT 0;

-- =====================
-- ARRIVAGES (BL multi-lignes)
-- =====================
CREATE TABLE IF NOT EXISTS arrivages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fournisseur_id UUID REFERENCES fournisseurs(id) ON DELETE SET NULL,
  bl VARCHAR(100),
  arrivage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  statut VARCHAR(20) NOT NULL DEFAULT 'recu' CHECK (statut IN ('recu', 'partiel', 'annule')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arrivages_tenant ON arrivages(tenant_id);

CREATE TABLE IF NOT EXISTS arrivage_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arrivage_id UUID NOT NULL REFERENCES arrivages(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantite INT NOT NULL DEFAULT 0,
  prix_unitaire NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_arrivage_lines_arrivage ON arrivage_lines(arrivage_id);

-- =====================
-- CHARGES LIVREURS
-- =====================
CREATE TABLE IF NOT EXISTS delivery_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  charge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  statut VARCHAR(20) NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'a_regler', 'cloture')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_delivery_charges_tenant ON delivery_charges(tenant_id);

CREATE TABLE IF NOT EXISTS delivery_charge_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES delivery_charges(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  qty_charged INT NOT NULL DEFAULT 0,
  qty_sold INT NOT NULL DEFAULT 0,
  qty_returned INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_delivery_charge_lines_charge ON delivery_charge_lines(charge_id);

-- =====================
-- ÉTENDRE LES TYPES DE MOUVEMENTS
-- On ne touche pas à la contrainte existante ici car la migration 010
-- la gère séparément. On accepte toutes les valeurs via NOT VALID.
-- =====================
ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('arrival', 'transfer_to_vehicle', 'delivery_out', 'adjustment', 'charge', 'return_from_charge')) NOT VALID;
