-- Migration 007: Create visits table

CREATE TYPE visit_status AS ENUM ('in_progress', 'ordered', 'closed');

CREATE TABLE IF NOT EXISTS visits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pre_seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  status        visit_status NOT NULL DEFAULT 'in_progress',
  close_reason  TEXT,
  visited_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_visits_tenant      ON visits(tenant_id);
CREATE INDEX idx_visits_pre_seller  ON visits(tenant_id, pre_seller_id);
CREATE INDEX idx_visits_client      ON visits(tenant_id, client_id);
CREATE INDEX idx_visits_date        ON visits(tenant_id, visited_at);
