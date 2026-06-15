const router = require('express').Router();
const auth = require('../middlewares/auth');
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

// Liste des livreurs (accessible à tous les rôles authentifiés)
router.get('/deliverers', auth(), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM users WHERE tenant_id=$1 AND role='delivery' AND is_active=true ORDER BY name`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/', auth('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE tenant_id=$1 ORDER BY name',
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', auth('admin'), async (req, res, next) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,$4,$5, true) RETURNING id, name, email, role, is_active`,
      [req.tenantId, name, email, hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth('admin'), async (req, res, next) => {
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
});

router.post('/:id/reset-password', auth('admin'), async (req, res, next) => {
  const { id } = req.params;
  const { password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash=$1, must_change_password=true WHERE id=$2 AND tenant_id=$3',
      [hash, id, req.tenantId]
    );
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) { next(err); }
});

module.exports = router;
