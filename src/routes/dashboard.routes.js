const router = require('express').Router();
const auth = require('../middlewares/auth');
const pool = require('../db/pool');

// GET /api/dashboard?period=today|week|month|all
router.get('/', auth('admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId;
    const period = req.query.period || 'today';

    // Filtres date — on caste explicitement en DATE pour visited_at
    let dateFilter = '';
    let dateFilterJoin = '';
    let dateFilterDelivered = '';
    let dateFilterVisits = '';

    if (period === 'today') {
      dateFilter          = `AND DATE(created_at)       = CURRENT_DATE`;
      dateFilterJoin      = `AND DATE(o.created_at)     = CURRENT_DATE`;
      dateFilterDelivered = `AND DATE(delivered_at)     = CURRENT_DATE`;
      dateFilterVisits    = `AND v.visited_at           = CURRENT_DATE`;
    } else if (period === 'week') {
      dateFilter          = `AND created_at   >= date_trunc('week',  NOW())`;
      dateFilterJoin      = `AND o.created_at >= date_trunc('week',  NOW())`;
      dateFilterDelivered = `AND delivered_at >= date_trunc('week',  NOW())`;
      dateFilterVisits    = `AND v.visited_at >= date_trunc('week',  NOW())::date`;
    } else if (period === 'month') {
      dateFilter          = `AND created_at   >= date_trunc('month', NOW())`;
      dateFilterJoin      = `AND o.created_at >= date_trunc('month', NOW())`;
      dateFilterDelivered = `AND delivered_at >= date_trunc('month', NOW())`;
      dateFilterVisits    = `AND v.visited_at >= date_trunc('month', NOW())::date`;
    }
    // period === 'all' → pas de filtre date

    const [
      kpiClients,
      kpiOrders,
      kpiDeliveries,
      kpiRevenue,
      kpiStock,
      stockAlerts,
      tournees,
      visites,
    ] = await Promise.all([

      // 1. Clients actifs
      pool.query(
        `SELECT COUNT(*) AS total FROM clients WHERE tenant_id = $1`,
        [tid]
      ),

      // 2. Commandes sur la période
      pool.query(
        `SELECT COUNT(*) AS total FROM orders WHERE tenant_id = $1 ${dateFilter}`,
        [tid]
      ),

      // 3. Livraisons : livrées vs total assignées
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
           COUNT(*) FILTER (WHERE status IN ('assigned','in_progress','delivered')) AS total_assigned
         FROM orders WHERE tenant_id = $1 ${dateFilter}`,
        [tid]
      ),

      // 4. CA livré sur la période
      pool.query(
        `SELECT COALESCE(SUM(total_ttc), 0) AS ca,
                COALESCE(SUM(paid_amount), 0) AS encaisse
         FROM orders
         WHERE tenant_id = $1 AND status = 'delivered' ${dateFilterDelivered}`,
        [tid]
      ),

      // 5. Stock total + alertes
      pool.query(
        `SELECT
           COALESCE(SUM(quantity), 0) AS total,
           COUNT(*) FILTER (WHERE seuil_alerte IS NOT NULL AND quantity <= seuil_alerte) AS alertes
         FROM stock_warehouse WHERE tenant_id = $1`,
        [tid]
      ),

      // 6. Alertes stock détail
      pool.query(
        `SELECT sw.quantity, sw.seuil_alerte,
                pv.name AS variant_name, p.name AS product_name
         FROM stock_warehouse sw
         JOIN product_variants pv ON pv.id = sw.variant_id
         JOIN products p ON p.id = pv.product_id
         WHERE sw.tenant_id = $1
           AND sw.seuil_alerte IS NOT NULL
           AND sw.quantity <= sw.seuil_alerte
         ORDER BY (sw.quantity::float / NULLIF(sw.seuil_alerte,0)) ASC
         LIMIT 5`,
        [tid]
      ),

      // 7. Tournées : stats par livreur + CA livré
      pool.query(
        `SELECT u.id, u.name,
           COUNT(o.id) FILTER (WHERE o.status IN ('assigned','in_progress','delivered')) AS total_assigned,
           COUNT(o.id) FILTER (WHERE o.status = 'delivered')                             AS delivered,
           COUNT(o.id) FILTER (WHERE o.status IN ('assigned','in_progress'))             AS restantes,
           COALESCE(SUM(o.total_ttc) FILTER (WHERE o.status = 'delivered'), 0)           AS ca_livre
         FROM users u
         LEFT JOIN orders o ON o.delivery_user_id = u.id
           AND o.tenant_id = $1 ${dateFilterJoin}
         WHERE u.tenant_id = $1 AND u.role = 'delivery' AND u.is_active = true
         GROUP BY u.id, u.name
         ORDER BY total_assigned DESC, u.name`,
        [tid]
      ),

      // 8. Visites : stats par pré-vendeur + CA des commandes converties
      pool.query(
        `SELECT u.id, u.name,
           COUNT(v.id)                                                AS total,
           COUNT(v.id) FILTER (WHERE v.status = 'ordered')           AS converties,
           COUNT(v.id) FILTER (WHERE v.status = 'closed')            AS perdues,
           COUNT(v.id) FILTER (WHERE v.status = 'in_progress')       AS en_cours,
           COALESCE(SUM(o.total_ttc) FILTER (WHERE v.status = 'ordered' AND o.id IS NOT NULL), 0) AS ca_converti
         FROM users u
         LEFT JOIN visits v ON v.pre_seller_id = u.id
           AND v.tenant_id = $1 ${dateFilterVisits}
         LEFT JOIN orders o ON o.id = v.order_id
         WHERE u.tenant_id = $1 AND u.role = 'pre_seller' AND u.is_active = true
         GROUP BY u.id, u.name
         ORDER BY total DESC, u.name`,
        [tid]
      ),
    ]);

    const deliv = kpiDeliveries.rows[0];
    const stock = kpiStock.rows[0];

    res.json({
      period,
      kpis: {
        clients:    { total: parseInt(kpiClients.rows[0].total) },
        orders:     { total: parseInt(kpiOrders.rows[0].total) },
        deliveries: { delivered: parseInt(deliv.delivered), total: parseInt(deliv.total_assigned) },
        revenue:    { ca: parseFloat(kpiRevenue.rows[0].ca), encaisse: parseFloat(kpiRevenue.rows[0].encaisse) },
        stock:      { total: parseInt(stock.total), alertes: parseInt(stock.alertes) },
      },
      stock_alerts: stockAlerts.rows.map(r => ({
        product_name: r.product_name,
        variant_name: r.variant_name,
        quantity:     parseInt(r.quantity),
        seuil:        parseInt(r.seuil_alerte),
      })),
      tournees: tournees.rows.map(r => ({
        id:             r.id,
        name:           r.name,
        total_assigned: parseInt(r.total_assigned),
        delivered:      parseInt(r.delivered),
        restantes:      parseInt(r.restantes),
        ca_livre:       parseFloat(r.ca_livre),
      })),
      visites: visites.rows.map(r => ({
        id:          r.id,
        name:        r.name,
        total:       parseInt(r.total),
        converties:  parseInt(r.converties),
        perdues:     parseInt(r.perdues),
        en_cours:    parseInt(r.en_cours),
        ca_converti: parseFloat(r.ca_converti),
      })),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/dashboard/mobile ─────────────────────────────────────────────
// Dashboard mobile : accessible à tous les rôles, données filtrées par rôle
router.get('/mobile', auth('admin', 'pre_seller', 'delivery', 'stock_manager'), async (req, res, next) => {
  try {
    const tid    = req.tenantId;
    const userId = req.user.id;
    const role   = req.user.role;
    const period = req.query.period || 'today';

    let dateFilter = '', dateFilterDelivered = '', dateFilterVisits = '';
    if (period === 'today') {
      dateFilter          = `AND DATE(created_at) = CURRENT_DATE`;
      dateFilterDelivered = `AND DATE(delivered_at) = CURRENT_DATE`;
      dateFilterVisits    = `AND v.visited_at = CURRENT_DATE`;
    } else if (period === 'week') {
      dateFilter          = `AND created_at   >= date_trunc('week',  NOW())`;
      dateFilterDelivered = `AND delivered_at >= date_trunc('week',  NOW())`;
      dateFilterVisits    = `AND v.visited_at >= date_trunc('week',  NOW())::date`;
    } else if (period === 'month') {
      dateFilter          = `AND created_at   >= date_trunc('month', NOW())`;
      dateFilterDelivered = `AND delivered_at >= date_trunc('month', NOW())`;
      dateFilterVisits    = `AND v.visited_at >= date_trunc('month', NOW())::date`;
    }

    // Filtre selon rôle pour les requêtes métier
    const userFilter      = (role === 'admin') ? '' : `AND pre_seller_id = '${userId}'`;
    const deliveryFilter  = (role === 'admin') ? '' : `AND delivery_user_id = '${userId}'`;
    const visitsUserFilter = (role === 'admin') ? '' : `AND v.pre_seller_id = '${userId}'`;

    const queries = [
      // KPI commandes
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status='pending')     AS pending,
                COUNT(*) FILTER (WHERE status='delivered')   AS delivered
         FROM orders WHERE tenant_id=$1 ${dateFilter} ${userFilter}`,
        [tid]
      ),
      // KPI livraisons
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status='delivered') AS delivered,
                COUNT(*) FILTER (WHERE status IN ('assigned','in_progress','delivered')) AS total_assigned
         FROM orders WHERE tenant_id=$1 ${dateFilter} ${deliveryFilter}`,
        [tid]
      ),
      // KPI CA
      pool.query(
        `SELECT COALESCE(SUM(total_ttc),0) AS ca, COALESCE(SUM(paid_amount),0) AS encaisse
         FROM orders WHERE tenant_id=$1 AND status='delivered' ${dateFilterDelivered} ${deliveryFilter}`,
        [tid]
      ),
      // KPI stock alertes
      pool.query(
        `SELECT COALESCE(SUM(quantity),0) AS total,
                COUNT(*) FILTER (WHERE seuil_alerte IS NOT NULL AND quantity <= seuil_alerte) AS alertes
         FROM stock_warehouse WHERE tenant_id=$1`,
        [tid]
      ),
      // Visites du pré-vendeur
      pool.query(
        `SELECT COUNT(v.id) AS total,
                COUNT(v.id) FILTER (WHERE v.status='ordered')     AS converties,
                COUNT(v.id) FILTER (WHERE v.status='closed')      AS perdues,
                COUNT(v.id) FILTER (WHERE v.status='in_progress') AS en_cours,
                COALESCE(SUM(o.total_ttc) FILTER (WHERE v.status='ordered' AND o.id IS NOT NULL),0) AS ca_converti
         FROM visits v
         LEFT JOIN orders o ON o.id = v.order_id
         WHERE v.tenant_id=$1 ${dateFilterVisits} ${visitsUserFilter}`,
        [tid]
      ),
      // Top alertes stock
      pool.query(
        `SELECT sw.quantity, sw.seuil_alerte, pv.name AS variant_name, p.name AS product_name,
                CASE WHEN sw.quantity=0 THEN 'rupture'
                     WHEN sw.quantity <= sw.seuil_alerte*0.3 THEN 'critique'
                     ELSE 'faible' END AS niveau
         FROM stock_warehouse sw
         JOIN product_variants pv ON pv.id=sw.variant_id
         JOIN products p ON p.id=pv.product_id
         WHERE sw.tenant_id=$1 AND sw.seuil_alerte IS NOT NULL AND sw.quantity<=sw.seuil_alerte
         ORDER BY (sw.quantity::float/NULLIF(sw.seuil_alerte,0)) ASC LIMIT 5`,
        [tid]
      ),
      // Activité récente (toutes rôles)
      pool.query(
        `SELECT o.order_number, o.status, o.total_ttc, o.created_at, o.delivered_at,
                c.name AS client_name, u.name AS actor_name
         FROM orders o
         JOIN clients c ON c.id=o.client_id
         LEFT JOIN users u ON u.id=o.pre_seller_id
         WHERE o.tenant_id=$1 ${userFilter}
         ORDER BY o.created_at DESC LIMIT 8`,
        [tid]
      ),
    ];

    const [ordersR, delivR, caR, stockR, visitsR, alertsR, activityR] = await Promise.all(queries);

    const o = ordersR.rows[0];
    const d = delivR.rows[0];
    const ca = caR.rows[0];
    const s = stockR.rows[0];
    const v = visitsR.rows[0];

    res.json({
      period,
      kpis: {
        orders:     { total: +o.total, pending: +o.pending, delivered: +o.delivered },
        deliveries: { delivered: +d.delivered, total: +d.total_assigned },
        revenue:    { ca: +ca.ca, encaisse: +ca.encaisse },
        stock:      { total: +s.total, alertes: +s.alertes },
      },
      visites: {
        total: +v.total, converties: +v.converties,
        perdues: +v.perdues, en_cours: +v.en_cours,
        ca_converti: +v.ca_converti,
      },
      stock_alerts: alertsR.rows.map(r => ({
        product_name: r.product_name, variant_name: r.variant_name,
        quantity: +r.quantity, seuil: +r.seuil_alerte, niveau: r.niveau,
        pct: r.seuil_alerte > 0 ? Math.round((+r.quantity / +r.seuil_alerte) * 100) : 0,
      })),
      activity: activityR.rows.map(r => ({
        order_number: r.order_number, status: r.status,
        total_ttc: +r.total_ttc, client_name: r.client_name,
        actor_name: r.actor_name, created_at: r.created_at, delivered_at: r.delivered_at,
      })),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/dashboard/badges ─────────────────────────────────────────────
// Compteurs pour les badges de la sidebar (commandes en attente + alertes stock)
router.get('/badges', auth('admin', 'stock_manager', 'pre_seller', 'delivery'), async (req, res, next) => {
  try {
    const tid = req.tenantId;

    const [ordersRes, stockRes, visitsRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count FROM orders WHERE tenant_id=$1 AND status='pending'`,
        [tid]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM stock_warehouse
         WHERE tenant_id=$1 AND seuil_alerte IS NOT NULL AND quantity <= seuil_alerte`,
        [tid]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM visits WHERE tenant_id=$1 AND status='in_progress'`,
        [tid]
      ),
    ]);

    res.json({
      orders_pending:  parseInt(ordersRes.rows[0].count),
      stock_alerts:    parseInt(stockRes.rows[0].count),
      visits_active:   parseInt(visitsRes.rows[0].count),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/dashboard/stock-alerts ───────────────────────────────────────
// Alertes stock : produits sous seuil, sans filtre de période
router.get('/stock-alerts', auth('admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId;

    const result = await pool.query(
      `SELECT
         sw.quantity,
         sw.seuil_alerte,
         pv.name  AS variant_name,
         p.name   AS product_name,
         CASE
           WHEN sw.quantity = 0                          THEN 'rupture'
           WHEN sw.quantity <= sw.seuil_alerte * 0.3    THEN 'critique'
           ELSE                                               'faible'
         END AS niveau
       FROM stock_warehouse sw
       JOIN product_variants pv ON pv.id = sw.variant_id
       JOIN products p          ON p.id  = pv.product_id
       WHERE sw.tenant_id = $1
         AND sw.seuil_alerte IS NOT NULL
         AND sw.quantity <= sw.seuil_alerte
       ORDER BY (sw.quantity::float / NULLIF(sw.seuil_alerte, 0)) ASC
       LIMIT 10`,
      [tid]
    );

    res.json({
      alerts: result.rows.map(r => ({
        product_name: r.product_name,
        variant_name: r.variant_name,
        quantity:     parseInt(r.quantity),
        seuil:        parseInt(r.seuil_alerte),
        niveau:       r.niveau,
        pct:          r.seuil_alerte > 0
                        ? Math.round((parseInt(r.quantity) / parseInt(r.seuil_alerte)) * 100)
                        : 0,
      })),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/dashboard/activity ───────────────────────────────────────────
// Activité récente : mix commandes + visites, 15 derniers événements
router.get('/activity', auth('admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId;

    const [ordersRes, visitsRes] = await Promise.all([

      // Dernières commandes et changements de statut
      pool.query(
        `SELECT
           o.id, o.order_number, o.status, o.total_ttc, o.paid_amount,
           o.created_at, o.delivered_at, o.started_at,
           c.name  AS client_name,
           u.name  AS actor_name,
           du.name AS delivery_name
         FROM orders o
         JOIN clients c          ON c.id  = o.client_id
         LEFT JOIN users u       ON u.id  = o.pre_seller_id
         LEFT JOIN users du      ON du.id = o.delivery_user_id
         WHERE o.tenant_id = $1
         ORDER BY GREATEST(
           o.created_at,
           COALESCE(o.started_at,   '1970-01-01'),
           COALESCE(o.delivered_at, '1970-01-01')
         ) DESC
         LIMIT 10`,
        [tid]
      ),

      // Dernières visites
      pool.query(
        `SELECT
           v.id, v.status, v.visited_at, v.created_at,
           c.name AS client_name,
           c.city AS client_city,
           u.name AS pre_seller_name
         FROM visits v
         JOIN clients c    ON c.id = v.client_id
         LEFT JOIN users u ON u.id = v.pre_seller_id
         WHERE v.tenant_id = $1
         ORDER BY v.created_at DESC
         LIMIT 10`,
        [tid]
      ),
    ]);

    // Construire une liste unifiée d'événements
    const events = [];

    for (const o of ordersRes.rows) {
      // Livraison confirmée
      if (o.delivered_at) {
        events.push({
          type:    'delivered',
          time:    o.delivered_at,
          label:   `${o.client_name} — livraison confirmée · ${fmt(o.paid_amount)} DH encaissé`,
          actor:   o.delivery_name || o.actor_name,
          ref:     `CMD-${o.order_number}`,
          color:   'green',
        });
      }
      // Tournée démarrée
      if (o.started_at) {
        events.push({
          type:  'started',
          time:  o.started_at,
          label: `${o.delivery_name || '—'} a démarré la livraison pour ${o.client_name}`,
          actor: o.delivery_name,
          ref:   `CMD-${o.order_number}`,
          color: 'amber',
        });
      }
      // Nouvelle commande
      events.push({
        type:  'order',
        time:  o.created_at,
        label: `Nouvelle commande CMD-${o.order_number} — ${o.client_name} · ${fmt(o.total_ttc)} DH`,
        actor: o.actor_name,
        ref:   `CMD-${o.order_number}`,
        color: 'blue',
      });
    }

    for (const v of visitsRes.rows) {
      events.push({
        type:  'visit',
        time:  v.created_at,
        label: `${v.pre_seller_name || '—'} — visite chez ${v.client_name}${v.client_city ? ', ' + v.client_city : ''}`,
        actor: v.pre_seller_name,
        ref:   null,
        color: 'blue',
      });
    }

    // Trier par date desc, garder les 15 plus récents
    events.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({ events: events.slice(0, 15) });
  } catch (err) { next(err); }
});

function fmt(val) {
  if (!val) return '0';
  return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(parseFloat(val));
}

module.exports = router;
