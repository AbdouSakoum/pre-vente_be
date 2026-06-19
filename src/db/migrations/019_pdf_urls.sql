-- Migration 019 : URLs PDFs bon de livraison et bon de reception
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS bon_livraison_url TEXT;
ALTER TABLE arrivages ADD COLUMN IF NOT EXISTS bon_reception_url TEXT;
