const pool = require('../db/pool');

// =====================
// ENTREPÔT
// =====================
async function getWarehouseStock(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT sw.*, pv.name AS variant_name, pv.sku, p.name AS product_name
       FROM stock_warehouse sw
       JOIN product_variants pv ON pv.id = sw.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE sw.tenant_id = $1
       ORDER BY p.name, pv.name`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function adjustStock(req, res, next) {
  const { variant_id, new_quantity, motif } = req.body;
  if (variant_id === undefined || new_quantity === undefined) return res.status(400).json({ message: 'variant_id et new_quantity requis' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT quantity FROM stock_warehouse WHERE tenant_id=$1 AND variant_id=$2`,
      [req.tenantId, variant_id]
    );
    const current = rows[0]?.quantity ?? 0;
    const delta = new_quantity - current;
    await client.query(
      `INSERT INTO stock_warehouse (tenant_id, variant_id, quantity)
       VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, variant_id)
       DO UPDATE SET quantity=$3, updated_at=NOW()`,
      [req.tenantId, variant_id, new_quantity]
    );
    if (delta !== 0) {
      await client.query(
        `INSERT INTO stock_movements (tenant_id, variant_id, movement_type, quantity, note, created_by)
         VALUES ($1,$2,'adjustment',$3,$4,$5)`,
        [req.tenantId, variant_id, delta, motif || 'Ajustement', req.user.id]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Stock ajusté', delta });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// =====================
// MOUVEMENTS
// =====================
async function getMovements(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT sm.*, pv.name AS variant_name, p.name AS product_name,
        u.name AS created_by_name
       FROM stock_movements sm
       JOIN product_variants pv ON pv.id = sm.variant_id
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN users u ON u.id = sm.created_by
       WHERE sm.tenant_id = $1
       ORDER BY sm.created_at DESC
       LIMIT 200`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// =====================
// ARRIVAGES
// =====================
async function getArrivages(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, f.nom AS fournisseur_nom,
        json_agg(json_build_object(
          'id', al.id,
          'variant_id', al.variant_id,
          'variant_name', pv.name,
          'sku', pv.sku,
          'product_name', p.name,
          'quantite', al.quantite,
          'prix_unitaire', al.prix_unitaire
        ) ORDER BY p.name) AS lines
       FROM arrivages a
       LEFT JOIN fournisseurs f ON f.id = a.fournisseur_id
       JOIN arrivage_lines al ON al.arrivage_id = a.id
       JOIN product_variants pv ON pv.id = al.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE a.tenant_id=$1
       GROUP BY a.id, f.nom
       ORDER BY a.arrivage_date DESC, a.created_at DESC
       LIMIT 100`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createArrivage(req, res, next) {
  const { fournisseur_id, bl, arrivage_date, lines } = req.body;
  if (!lines || !lines.length) return res.status(400).json({ message: 'Lignes requises' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [arr] } = await client.query(
      `INSERT INTO arrivages (tenant_id, fournisseur_id, bl, arrivage_date, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.tenantId, fournisseur_id || null, bl || null, arrivage_date || new Date().toISOString().slice(0, 10), req.user.id]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO arrivage_lines (arrivage_id, variant_id, quantite, prix_unitaire)
         VALUES ($1,$2,$3,$4)`,
        [arr.id, l.variant_id, l.quantite, l.prix_unitaire || 0]
      );
      await client.query(
        `INSERT INTO stock_warehouse (tenant_id, variant_id, quantity)
         VALUES ($1,$2,$3)
         ON CONFLICT (tenant_id, variant_id)
         DO UPDATE SET quantity = stock_warehouse.quantity + $3, updated_at=NOW()`,
        [req.tenantId, l.variant_id, l.quantite]
      );
      await client.query(
        `INSERT INTO stock_movements (tenant_id, variant_id, movement_type, quantity, note, created_by)
         VALUES ($1,$2,'arrival',$3,$4,$5)`,
        [req.tenantId, l.variant_id, l.quantite, bl || null, req.user.id]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: arr.id, message: 'Arrivage enregistré' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Ancien endpoint conservé pour compatibilité
async function arrival(req, res, next) {
  const { variant_id, quantity, note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO stock_warehouse (tenant_id, variant_id, quantity)
       VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, variant_id)
       DO UPDATE SET quantity = stock_warehouse.quantity + $3, updated_at = NOW()`,
      [req.tenantId, variant_id, quantity]
    );
    await client.query(
      `INSERT INTO stock_movements (tenant_id, variant_id, movement_type, quantity, note, created_by)
       VALUES ($1,$2,'arrival',$3,$4,$5)`,
      [req.tenantId, variant_id, quantity, note || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ message: 'Arrivage enregistré' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// =====================
// CHARGES LIVREURS
// =====================
async function getDeliveryUsers(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM users WHERE tenant_id=$1 AND role='delivery' AND is_active=true ORDER BY name`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getCharges(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT dc.*, u.name AS livreur_name,
        json_agg(json_build_object(
          'id', dcl.id,
          'variant_id', dcl.variant_id,
          'variant_name', pv.name,
          'sku', pv.sku,
          'product_name', p.name,
          'qty_charged', dcl.qty_charged,
          'qty_sold', dcl.qty_sold,
          'qty_returned', dcl.qty_returned
        ) ORDER BY p.name) AS lines
       FROM delivery_charges dc
       JOIN users u ON u.id = dc.delivery_user_id
       JOIN delivery_charge_lines dcl ON dcl.charge_id = dc.id
       JOIN product_variants pv ON pv.id = dcl.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE dc.tenant_id=$1
       GROUP BY dc.id, u.name
       ORDER BY dc.charge_date DESC, dc.created_at DESC
       LIMIT 100`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createCharge(req, res, next) {
  const { delivery_user_id, charge_date, lines } = req.body;
  if (!lines || !lines.length) return res.status(400).json({ message: 'Lignes requises' });
  if (!delivery_user_id) return res.status(400).json({ message: 'Livreur requis' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const l of lines) {
      const { rows } = await client.query(
        `SELECT quantity FROM stock_warehouse WHERE tenant_id=$1 AND variant_id=$2`,
        [req.tenantId, l.variant_id]
      );
      if ((rows[0]?.quantity ?? 0) < l.qty_charged) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Stock insuffisant pour la variante ${l.variant_id}` });
      }
    }
    const { rows: [charge] } = await client.query(
      `INSERT INTO delivery_charges (tenant_id, delivery_user_id, charge_date, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.tenantId, delivery_user_id, charge_date || new Date().toISOString().slice(0, 10), req.user.id]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO delivery_charge_lines (charge_id, variant_id, qty_charged)
         VALUES ($1,$2,$3)`,
        [charge.id, l.variant_id, l.qty_charged]
      );
      await client.query(
        `UPDATE stock_warehouse SET quantity = quantity - $1, updated_at=NOW()
         WHERE tenant_id=$2 AND variant_id=$3`,
        [l.qty_charged, req.tenantId, l.variant_id]
      );
      await client.query(
        `INSERT INTO stock_movements (tenant_id, variant_id, movement_type, quantity, note, created_by)
         VALUES ($1,$2,'charge',$3,$4,$5)`,
        [req.tenantId, l.variant_id, -l.qty_charged, `Charge livreur`, req.user.id]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: charge.id, message: 'Charge créée' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function closeCharge(req, res, next) {
  const { id } = req.params;
  const { lines } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [charge] } = await client.query(
      `SELECT * FROM delivery_charges WHERE id=$1 AND tenant_id=$2`,
      [id, req.tenantId]
    );
    if (!charge) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Charge introuvable' }); }
    if (charge.statut === 'cloture') { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Déjà clôturée' }); }

    for (const l of lines) {
      if ((l.qty_sold + l.qty_returned) > l.qty_charged) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Vendu + retour > chargé' });
      }
      await client.query(
        `UPDATE delivery_charge_lines SET qty_sold=$1, qty_returned=$2 WHERE id=$3`,
        [l.qty_sold, l.qty_returned, l.id]
      );
      if (l.qty_returned > 0) {
        await client.query(
          `UPDATE stock_warehouse SET quantity = quantity + $1, updated_at=NOW()
           WHERE tenant_id=$2 AND variant_id=$3`,
          [l.qty_returned, req.tenantId, l.variant_id]
        );
        await client.query(
          `INSERT INTO stock_movements (tenant_id, variant_id, movement_type, quantity, note, created_by)
           VALUES ($1,$2,'return_from_charge',$3,$4,$5)`,
          [req.tenantId, l.variant_id, l.qty_returned, `Retour tournée`, req.user.id]
        );
      }
    }
    await client.query(
      `UPDATE delivery_charges SET statut='cloture', closed_at=NOW() WHERE id=$1`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Charge clôturée' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Commandes assignées à un livreur (agrégées par variant pour pré-remplir une charge)
async function getOrdersForDelivery(req, res, next) {
  const { delivery_user_id } = req.query;
  if (!delivery_user_id) return res.status(400).json({ message: 'delivery_user_id requis' });
  try {
    // Retourne les commandes assigned + leurs lignes agrégées par variant
    const { rows: orders } = await pool.query(
      `SELECT o.id, o.order_number, c.name AS client_name,
        json_agg(json_build_object(
          'variant_id', ol.variant_id,
          'variant_name', pv.name,
          'product_name', p.name,
          'quantity', ol.quantity,
          'unit_price', ol.unit_price
        )) AS lines
       FROM orders o
       JOIN clients c ON c.id = o.client_id
       JOIN order_lines ol ON ol.order_id = o.id
       JOIN product_variants pv ON pv.id = ol.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE o.tenant_id=$1 AND o.delivery_user_id=$2 AND o.status='assigned'
       GROUP BY o.id, c.name
       ORDER BY o.created_at`,
      [req.tenantId, delivery_user_id]
    );

    // Agréger par variant pour pré-remplir les lignes de charge
    const byVariant = {};
    for (const order of orders) {
      for (const l of order.lines) {
        if (!byVariant[l.variant_id]) {
          byVariant[l.variant_id] = {
            variant_id: l.variant_id,
            variant_name: l.variant_name,
            product_name: l.product_name,
            qty_charged: 0,
          };
        }
        byVariant[l.variant_id].qty_charged += l.quantity;
      }
    }

    res.json({
      orders: orders.map(o => ({ id: o.id, order_number: o.order_number, client_name: o.client_name })),
      suggested_lines: Object.values(byVariant),
    });
  } catch (err) { next(err); }
}

module.exports = {
  getWarehouseStock, adjustStock, getMovements,
  arrival, getArrivages, createArrivage,
  getDeliveryUsers, getCharges, createCharge, closeCharge,
  getOrdersForDelivery,
};
