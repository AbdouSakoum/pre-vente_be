-- Migration 017 : URL PDF bon de commande sur les commandes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bon_commande_url TEXT;
