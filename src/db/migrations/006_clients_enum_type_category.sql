-- Migration 006: Convert clients type and category to enum

CREATE TYPE client_type AS ENUM ('particulier', 'entreprise');
CREATE TYPE client_category AS ENUM ('hanout', 'supermarche', 'mini_supermarche', 'epicerie', 'laiterie', 'restaurant', 'cafe');

ALTER TABLE clients
  ALTER COLUMN type DROP DEFAULT,
  ALTER COLUMN type TYPE client_type USING type::client_type,
  ALTER COLUMN type SET DEFAULT 'particulier',
  ALTER COLUMN category TYPE client_category USING category::client_category;
