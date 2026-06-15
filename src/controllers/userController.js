const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

async function getUsers(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE tenant_id=$1 ORDER BY name',
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createUser(req, res, next) {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, is_active, created_at`,
      [req.tenantId, name, email, hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email déjà utilisé' });
    next(err);
  }
}

async function updateUser(req, res, next) {
  const { id } = req.params;
  const { name, role, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, role=$2, is_active=$3
       WHERE id=$4 AND tenant_id=$5 RETURNING id, name, email, role, is_active`,
      [name, role, is_active ?? true, id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  const { id } = req.params;
  const { password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash=$1 WHERE id=$2 AND tenant_id=$3',
      [hash, id, req.tenantId]
    );
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) { next(err); }
}

async function getDashboard(req, res, next) {
  try {
    const [orders, stock, drivers] = await Promise.all([
      pool.query(
        `SELECT status, COUNT(*) as count FROM orders WHERE tenant_id=$1 GROUP BY status`,
        [req.tenantId]
      ),
      pool.query(
        `SELECT SUM(quantity) AS total FROM stock_warehouse WHERE tenant_id=$1`,
        [req.tenantId]
      ),
      pool.query(
        `SELECT id, name, email FROM users WHERE tenant_id=$1 AND role='delivery' AND is_active=true ORDER BY name`,
        [req.tenantId]
      )
    ]);

    res.json({
      orders_by_status: orders.rows,
      warehouse_total: stock.rows[0]?.total || 0,
      drivers: drivers.rows
    });
  } catch (err) { next(err); }
}

module.exports = { getUsers, createUser, updateUser, resetPassword, getDashboard };
