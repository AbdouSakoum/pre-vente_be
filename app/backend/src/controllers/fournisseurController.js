const pool = require('../db/pool');

async function list(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM fournisseurs WHERE tenant_id=$1 AND is_active=true ORDER BY nom`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  const { nom, telephone } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  try {
    const { rows: [f] } = await pool.query(
      `INSERT INTO fournisseurs (tenant_id, nom, telephone) VALUES ($1,$2,$3) RETURNING *`,
      [req.tenantId, nom, telephone || null]
    );
    res.status(201).json(f);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  const { id } = req.params;
  const { nom, telephone } = req.body;
  try {
    const { rows: [f] } = await pool.query(
      `UPDATE fournisseurs SET nom=$1, telephone=$2 WHERE id=$3 AND tenant_id=$4 RETURNING *`,
      [nom, telephone || null, id, req.tenantId]
    );
    if (!f) return res.status(404).json({ message: 'Fournisseur introuvable' });
    res.json(f);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE fournisseurs SET is_active=false WHERE id=$1 AND tenant_id=$2`,
      [id, req.tenantId]
    );
    res.json({ message: 'Fournisseur supprimé' });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
