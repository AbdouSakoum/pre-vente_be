const pool = require('../db/pool');

// Générer un bon de livraison, encaisser et déduire le stock entrepôt
async function generateDeliveryNote(req, res, next) {
  const { order_id } = req.params;
  const paid_amount_input = parseFloat(req.body?.paid_amount ?? 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier la commande
    const { rows: [order] } = await client.query(
      `SELECT o.*, json_agg(json_build_object(
          'variant_id', ol.variant_id, 'quantity', ol.quantity, 'unit_price', ol.unit_price,
          'tva_rate', ol.tva_rate,
          'variant_name', pv.name, 'product_name', p.name
        )) AS lines
       FROM orders o
       JOIN order_lines ol ON ol.order_id = o.id
       JOIN product_variants pv ON pv.id = ol.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE o.id = $1 AND o.tenant_id = $2 AND o.status IN ('assigned','in_progress')
       GROUP BY o.id`,
      [order_id, req.tenantId]
    );

    if (!order) return res.status(404).json({ message: 'Commande introuvable ou non assignée' });

    // Calculer le total TTC de la commande
    const total_ttc = parseFloat(order.total_ttc ?? order.lines.reduce(
      (s, l) => s + l.quantity * l.unit_price * (1 + (l.tva_rate ?? 20) / 100), 0
    ));

    // Calculer montant encaissé total (déjà encaissé + nouveau paiement)
    const already_paid = parseFloat(order.paid_amount ?? 0);
    const new_paid = Math.min(Math.max(0, paid_amount_input), total_ttc - already_paid);
    const total_paid = already_paid + new_paid;
    const reste = total_ttc - total_paid;

    const payment_status = reste <= 0 ? 'paid' : total_paid > 0 ? 'partial' : 'unpaid';

    // Décrémenter stock entrepôt
    for (const line of order.lines) {
      await client.query(
        `UPDATE stock_warehouse SET quantity = GREATEST(0, quantity - $1), updated_at=NOW()
         WHERE tenant_id=$2 AND variant_id=$3`,
        [line.quantity, req.tenantId, line.variant_id]
      );

      await client.query(
        `INSERT INTO stock_movements (tenant_id, variant_id, movement_type, quantity, note, created_by)
         VALUES ($1,$2,'delivery_out',$3,'Livraison commande',$4)`,
        [req.tenantId, line.variant_id, line.quantity, req.user.id]
      );
    }

    // Générer numéro bon de livraison
    const noteNumber = `BL-${Date.now()}`;
    const { rows: [note] } = await client.query(
      `INSERT INTO delivery_notes (tenant_id, order_id, number, generated_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.tenantId, order_id, noteNumber, req.user.id]
    );

    // Mettre à jour statut commande + encaissement
    const { rows: [updated] } = await client.query(
      `UPDATE orders
       SET status = 'delivered',
           delivered_at = NOW(),
           paid_amount = $3,
           payment_status = $4
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [order_id, req.tenantId, total_paid, payment_status]
    );

    await client.query('COMMIT');

    res.json({
      delivery_note: note,
      order: { ...updated, lines: order.lines },
      generated_at: note.generated_at
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function getDeliveryNotes(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT dn.*, o.delivery_address, c.name AS client_name,
        u.name AS generated_by_name
       FROM delivery_notes dn
       JOIN orders o ON o.id = dn.order_id
       JOIN clients c ON c.id = o.client_id
       LEFT JOIN users u ON u.id = dn.generated_by
       WHERE dn.tenant_id = $1
       ORDER BY dn.generated_at DESC`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// Commandes du jour assignées au livreur connecté
async function getMyOrders(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT o.*,
         c.name AS client_name, c.phone AS client_phone,
         u.name AS delivery_name,
         COALESCE(o.delivery_address, c.address) AS delivery_address,
         COALESCE(o.delivery_latitude, c.latitude::numeric)   AS delivery_latitude,
         COALESCE(o.delivery_longitude, c.longitude::numeric) AS delivery_longitude,
         json_agg(json_build_object(
           'id', ol.id, 'variant_id', ol.variant_id,
           'quantity', ol.quantity, 'unit_price', ol.unit_price,
           'tva_rate', ol.tva_rate,
           'variant_name', pv.name, 'product_name', p.name
         ) ORDER BY ol.id) AS lines
       FROM orders o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN users u ON u.id = o.delivery_user_id
       LEFT JOIN order_lines ol ON ol.order_id = o.id
       LEFT JOIN product_variants pv ON pv.id = ol.variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE o.tenant_id = $1
         AND ($2::uuid IS NULL OR o.delivery_user_id = $2)
         AND o.status IN ('assigned', 'in_progress', 'delivered')
         AND (
           o.desired_delivery_date = CURRENT_DATE
           OR (o.desired_delivery_date IS NULL AND o.created_at::date = CURRENT_DATE)
           OR o.status IN ('assigned', 'in_progress')
         )
       GROUP BY o.id, c.name, c.phone, c.address, c.latitude, c.longitude, u.name
       ORDER BY
         CASE o.status WHEN 'in_progress' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,
         o.desired_delivery_date ASC NULLS LAST,
         o.created_at ASC`,
      [req.tenantId, req.user.role === 'admin' ? null : req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { generateDeliveryNote, getDeliveryNotes, getMyOrders };
