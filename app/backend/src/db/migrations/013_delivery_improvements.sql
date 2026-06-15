-- Migration 013 : Améliorations module livraison
-- Ajout : paid_amount, started_at, payment_status 'partial'

-- 1. Ajouter colonne montant encaissé
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2. Ajouter timestamp début de livraison
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

-- 3. Étendre le CHECK payment_status pour inclure 'partial'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('paid', 'unpaid', 'partial'));
