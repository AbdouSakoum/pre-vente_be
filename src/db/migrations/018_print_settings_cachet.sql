-- Migration 018 : Ajout cachet/tampon dans print_settings
ALTER TABLE print_settings ADD COLUMN IF NOT EXISTS cachet_url TEXT;
