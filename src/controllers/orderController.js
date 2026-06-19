const pool = require('../db/pool');
const { generateBonCommande } = require('../utils/pdf.generator');

async function getOrders(req, res, next) {
  const { status, delivery_user_id, date_from, date_to } = req.query;
  try {
    let q = `
      SELECT o.*,
        c.name AS client_name, c.phone AS client_phone,
        u1.name AS pre_seller_name,
        u2.name AS delivery_name,
        json_agg(json_build_object(
          'id', ol.id, 'variant_id', ol.variant_id,
          'quantity', ol.quantity, 'unit_price', ol.unit_price,
          'variant_name', pv.name, 'product_name', p.name
        )) AS lines
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN users u1 ON u1.id = o.pre_seller_id
      LEFT JOIN users u2 ON u2.id = o.delivery_user_id
      LEFT JOIN order_lines ol ON ol.order_id = o.id
      LEFT JOIN product_variants pv ON pv.id = ol.variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE o.tenant_id = $1`;
    const params = [req.tenantId];

    if (status) { params.push(status); q += ` AND o.status = $${params.length}`; }
    if (delivery_user_id) { params.push(delivery_user_id); q += ` AND o.delivery_user_id = $${params.length}`; }
    if (date_from) { params.push(date_from); q += ` AND o.created_at::date >= $${params.length}::date`; }
    if (date_to)   { params.push(date_to);   q += ` AND o.created_at::date <= $${params.length}::date`; }

    q += ' GROUP BY o.id, c.name, c.phone, u1.name, u2.name ORDER BY o.created_at DESC';

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { next(err); }
}

async function getOrder(req, res, next) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT o.*,
        c.name AS client_name, c.phone AS client_phone,
        u1.name AS pre_seller_name,
        u2.name AS delivery_name,
        json_agg(json_build_object(
          'id', ol.id, 'variant_id', ol.variant_id,
          'quantity', ol.quantity, 'unit_price', ol.unit_price,
          'variant_name', pv.name, 'product_name', p.name
        )) AS lines
       FROM orders o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN users u1 ON u1.id = o.pre_seller_id
       LEFT JOIN users u2 ON u2.id = o.delivery_user_id
       LEFT JOIN order_lines ol ON ol.order_id = o.id
       LEFT JOIN product_variants pv ON pv.id = ol.variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE o.id = $1 AND o.tenant_id = $2
       GROUP BY o.id, c.name, c.phone, u1.name, u2.name`,
      [id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Commande introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function createOrder(req, res, next) {
  const { client_id, lines, payment_status, delivery_address, delivery_latitude, delivery_longitude, desired_delivery_date, note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Prochain numéro de commande par tenant
    const { rows: [{ next_num }] } = await client.query(
      `SELECT COALESCE(MAX(order_number), 0) + 1 AS next_num FROM orders WHERE tenant_id = $1`,
      [req.tenantId]
    );

    // unit_price = prix TTC (tel que saisi dans le catalogue)
    // HT = TTC / (1 + tva/100)
    const total_ttc = parseFloat(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0).toFixed(2));
    const total_tva = parseFloat(lines.reduce((s, l) => {
      const lineTTC = l.quantity * l.unit_price;
      return s + lineTTC - lineTTC / (1 + (l.tva_rate ?? 20) / 100);
    }, 0).toFixed(2));
    const total_ht_rounded = parseFloat((total_ttc - total_tva).toFixed(2));

    const { rows: [order] } = await client.query(
      `INSERT INTO orders
         (tenant_id, client_id, pre_seller_id, payment_status,
          delivery_address, delivery_latitude, delivery_longitude,
          desired_delivery_date, note,
          order_number, total_ht, total_tva, total_ttc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [req.tenantId, client_id, req.user.id, payment_status || 'unpaid',
       delivery_address, delivery_latitude || null, delivery_longitude || null,
       desired_delivery_date || null, note || null,
       next_num, total_ht_rounded, total_tva, total_ttc]
    );

    for (const line of lines) {
      await client.query(
        'INSERT INTO order_lines (tenant_id, order_id, variant_id, quantity, unit_price, tva_rate) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.tenantId, order.id, line.variant_id, line.quantity, line.unit_price, line.tva_rate ?? 20]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(order);

    // Génération PDF en arrière-plan (sans bloquer la réponse)
    generateBonCommande(order.id, req.tenantId).catch(err =>
      console.error('[PDF] Échec génération bon de commande:', err.message)
    );
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function assignOrder(req, res, next) {
  const { id } = req.params;
  const { delivery_user_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE orders SET delivery_user_id=$1, status='assigned'
       WHERE id=$2 AND tenant_id=$3 AND status='pending' RETURNING *`,
      [delivery_user_id, id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Commande introuvable ou déjà assignée' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function updateOrderStatus(req, res, next) {
  const { id } = req.params;
  const { status } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [order] } = await client.query(
      `SELECT o.status,
         json_agg(json_build_object('variant_id', ol.variant_id, 'quantity', ol.quantity)) AS lines
       FROM orders o
       LEFT JOIN order_lines ol ON ol.order_id = o.id
       WHERE o.id=$1 AND o.tenant_id=$2
       GROUP BY o.id, o.status`,
      [id, req.tenantId]
    );
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Commande introuvable' });
    }

    // NOTE: le déstockage se fait uniquement dans generateDeliveryNote (POST /:id/deliver)
    // pour éviter un double déstockage. updateOrderStatus gère uniquement le statut.
    const deliveredAt = status === 'delivered' ? 'NOW()' : 'delivered_at';
    const { rows: [updated] } = await client.query(
      `UPDATE orders SET status=$1, delivered_at=${deliveredAt} WHERE id=$2 AND tenant_id=$3 RETURNING *`,
      [status, id, req.tenantId]
    );

    await client.query('COMMIT');
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Démarrer une livraison : assigned → in_progress
async function startDelivery(req, res, next) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE orders
       SET status = 'in_progress', started_at = NOW()
       WHERE id = $1 AND tenant_id = $2
         AND status = 'assigned'
         AND (delivery_user_id = $3 OR $4 = 'admin')
       RETURNING *`,
      [id, req.tenantId, req.user.id, req.user.role]
    );
    if (!rows.length) return res.status(404).json({ message: 'Commande introuvable ou non assignée à vous' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function updateOrder(req, res, next) {
  const { id } = req.params;
  const { client_id, lines, payment_status, delivery_address, note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [existing] } = await client.query(
      `SELECT * FROM orders WHERE id=$1 AND tenant_id=$2`,
      [id, req.tenantId]
    );
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Commande introuvable' }); }
    if (existing.payment_status === 'paid') { await client.query('ROLLBACK'); return res.status(403).json({ message: 'Impossible de modifier une commande payée' }); }

    const total_ttc = parseFloat(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0).toFixed(2));
    const total_tva = parseFloat(lines.reduce((s, l) => {
      const lineTTC = l.quantity * l.unit_price;
      return s + lineTTC - lineTTC / (1 + (l.tva_rate ?? 20) / 100);
    }, 0).toFixed(2));
    const total_ht = parseFloat((total_ttc - total_tva).toFixed(2));

    await client.query(
      `UPDATE orders SET client_id=$1, payment_status=$2, delivery_address=$3, note=$4, total_ht=$5, total_tva=$6, total_ttc=$7 WHERE id=$8 AND tenant_id=$9`,
      [client_id, payment_status, delivery_address, note || null, total_ht, total_tva, total_ttc, id, req.tenantId]
    );

    await client.query('DELETE FROM order_lines WHERE order_id=$1 AND tenant_id=$2', [id, req.tenantId]);
    for (const line of lines) {
      await client.query(
        'INSERT INTO order_lines (tenant_id, order_id, variant_id, quantity, unit_price, tva_rate) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.tenantId, id, line.variant_id, line.quantity, line.unit_price, line.tva_rate ?? 20]
      );
    }

    await client.query('COMMIT');

    generateBonCommande(id, req.tenantId).catch(err =>
      console.error('[PDF] Échec régénération bon de commande:', err.message)
    );

    res.json({ id, total_ht, total_tva, total_ttc });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { getOrders, getOrder, createOrder, updateOrder, assignOrder, updateOrderStatus, startDelivery };
