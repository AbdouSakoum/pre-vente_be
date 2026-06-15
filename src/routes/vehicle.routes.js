const router = require('express').Router();
const auth = require('../middlewares/auth');
const pool = require('../db/pool');

router.get('/', auth(), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, u.name AS driver_name
       FROM vehicles v
       LEFT JOIN users u ON u.id = v.driver_id
       WHERE v.tenant_id=$1 AND v.is_active=true ORDER BY v.label`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', auth('admin'), async (req, res, next) => {
  const { label, plate, driver_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO vehicles (tenant_id, label, plate, driver_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.tenantId, label, plate || null, driver_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', auth('admin'), async (req, res, next) => {
  const { id } = req.params;
  const { label, plate, driver_id, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE vehicles SET label=$1, plate=$2, driver_id=$3, is_active=$4
       WHERE id=$5 AND tenant_id=$6 RETURNING *`,
      [label, plate || null, driver_id || null, is_active ?? true, id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Véhicule introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
