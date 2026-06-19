const pool = require('../db/pool');

async function getVisits(req, res, next) {
  try {
    const { date } = req.query;
    const { rows } = await pool.query(
      `SELECT v.*,
              c.name AS client_name, c.phone AS client_phone, c.city AS client_city, c.address AS client_address,
              c.category AS client_category,
              u.name AS pre_seller_name
       FROM visits v
       JOIN clients c ON c.id = v.client_id
       LEFT JOIN users u ON u.id = v.pre_seller_id
       WHERE v.tenant_id = $1
         AND ($2::date IS NULL OR v.visited_at = $2::date)
       ORDER BY v.created_at DESC`,
      [req.tenantId, date || null]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getMyVisits(req, res, next) {
  try {
    const { date, date_from, client_id } = req.query;
    const { rows } = await pool.query(
      `SELECT v.*,
              c.name AS client_name, c.phone AS client_phone, c.city AS client_city, c.address AS client_address,
              c.category AS client_category,
              -- Infos commande liée
              o.order_number, o.total_ht, o.total_tva, o.total_ttc,
              o.created_at AS order_date,
              -- Lignes de commande (articles)
              CASE WHEN o.id IS NOT NULL THEN
                (SELECT json_agg(json_build_object(
                  'product_name', p.name,
                  'variant_name', pv.name,
                  'quantity',     ol.quantity,
                  'unit_price',   ol.unit_price,
                  'line_total',   ol.quantity * ol.unit_price
                ) ORDER BY p.name)
                FROM order_lines ol
                JOIN product_variants pv ON pv.id = ol.variant_id
                JOIN products p ON p.id = pv.product_id
                WHERE ol.order_id = o.id)
              ELSE NULL END AS order_lines
       FROM visits v
       JOIN clients c ON c.id = v.client_id
       LEFT JOIN orders o ON o.id = v.order_id
       WHERE v.tenant_id = $1
         AND v.pre_seller_id = $2
         AND ($3::date IS NULL OR v.visited_at = $3::date)
         AND ($4::uuid IS NULL OR v.client_id = $4::uuid)
         AND ($5::date IS NULL OR v.visited_at >= $5::date)
       ORDER BY v.created_at DESC`,
      [req.tenantId, req.user.id, date || null, client_id || null, date_from || null]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createVisit(req, res, next) {
  const { client_id, visited_at } = req.body;
  if (!client_id) return res.status(400).json({ message: 'client_id est obligatoire' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO visits (tenant_id, pre_seller_id, client_id, visited_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenantId, req.user.id, client_id, visited_at || new Date().toISOString().slice(0, 10)]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function closeVisit(req, res, next) {
  const { id } = req.params;
  const { status, close_reason, order_id } = req.body;

  if (!['ordered', 'closed'].includes(status)) {
    return res.status(400).json({ message: 'Statut invalide' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE visits
       SET status = $1, close_reason = $2, order_id = $3
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [status, close_reason || null, order_id || null, id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Visite introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteVisit(req, res, next) {
  try {
    const { rows } = await pool.query(
      `DELETE FROM visits WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Visite introuvable' });
    res.json({ message: 'Visite supprimée' });
  } catch (err) { next(err); }
}

module.exports = { getVisits, getMyVisits, createVisit, closeVisit, deleteVisit };
