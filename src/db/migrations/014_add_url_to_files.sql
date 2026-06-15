-- Migration 014: ajouter colonne url pour Azure Blob Storage

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS url TEXT;
