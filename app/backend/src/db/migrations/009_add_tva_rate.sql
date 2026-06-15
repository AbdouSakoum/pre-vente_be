-- Migration 009: ajouter taux TVA sur products et order_lines

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tva_rate NUMERIC(5,2) NOT NULL DEFAULT 20;

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS tva_rate NUMERIC(5,2) NOT NULL DEFAULT 20;
