-- Migration 010: Suppression du concept de véhicule
-- Les livreurs représentent directement leur propre véhicule.
-- Le stock est uniquement dans stock_warehouse ; les livraisons débitent l'entrepôt.

-- 1. Supprimer la clé étrangère vehicle_id sur orders (colonne gardée momentanément puis supprimée)
ALTER TABLE orders DROP COLUMN IF EXISTS vehicle_id;

-- 2. Supprimer la clé étrangère vehicle_id sur stock_movements
ALTER TABLE stock_movements DROP COLUMN IF EXISTS vehicle_id;

-- 3. Mettre à jour le CHECK sur movement_type
-- On garde transfer_to_vehicle pour les données historiques existantes
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('arrival', 'transfer_to_vehicle', 'delivery_out', 'adjustment')) NOT VALID;

-- 4. Supprimer la table stock_vehicle
DROP TABLE IF EXISTS stock_vehicle;

-- 5. Supprimer la table vehicles
DROP TABLE IF EXISTS vehicles;
