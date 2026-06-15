const router = require('express').Router();
const auth = require('../middlewares/auth');
const pool = require('../db/pool');

router.get('/', auth('admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId;

    const [orders, stock, drivers] = await Promise.all([
      pool.query(
        `SELECT status, COUNT(*) AS count FROM orders WHERE tenant_id=$1 GROUP BY status`,
        [tid]
      ),
      pool.query(
        `SELECT SUM(quantity) AS total FROM stock_warehouse WHERE tenant_id=$1`,
        [tid]
      ),
      pool.query(
        `SELECT id, name FROM users WHERE tenant_id=$1 AND role='delivery' AND is_active=true ORDER BY name`,
        [tid]
      )
    ]);

    const ordersByStatus = {};
    for (const row of orders.rows) ordersByStatus[row.status] = parseInt(row.count);

    res.json({
      orders: ordersByStatus,
      warehouse_stock_total: parseInt(stock.rows[0]?.total || 0),
      drivers: drivers.rows
    });
  } catch (err) { next(err); }
});

module.exports = router;
