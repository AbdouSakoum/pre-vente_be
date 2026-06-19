-- Migration 016 : Numéro de facture sur les commandes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS facture_num VARCHAR(50);
