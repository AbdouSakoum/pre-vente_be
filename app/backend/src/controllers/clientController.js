const pool = require('../db/pool');

const CLIENT_FIELDS = [
  'name', 'second_name', 'type', 'category',
  'phone', 'city', 'email',
  'patente', 'rc', 'ice', 'if_fiscal',
  'address', 'latitude', 'longitude',
];

async function getClients(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clients WHERE tenant_id=$1 ORDER BY name`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getClient(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clients WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Client introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function createClient(req, res, next) {
  const {
    name, second_name, type, category,
    phone, city, email,
    patente, rc, ice, if_fiscal,
    address, latitude, longitude,
  } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO clients
        (tenant_id, name, second_name, type, category,
         phone, city, email, patente, rc, ice, if_fiscal,
         address, latitude, longitude, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        req.tenantId,
        name,
        second_name || null,
        type || 'particulier',
        category || null,
        phone || null,
        city || null,
        email || null,
        patente || null,
        rc || null,
        ice || null,
        if_fiscal || null,
        address || null,
        latitude || null,
        longitude || null,
        req.user.id,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateClient(req, res, next) {
  const { id } = req.params;
  const {
    name, second_name, type, category,
    phone, city, email,
    patente, rc, ice, if_fiscal,
    address, latitude, longitude,
  } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE clients SET
        name=$1, second_name=$2, type=$3, category=$4,
        phone=$5, city=$6, email=$7,
        patente=$8, rc=$9, ice=$10, if_fiscal=$11,
        address=$12, latitude=$13, longitude=$14
       WHERE id=$15 AND tenant_id=$16
       RETURNING *`,
      [
        name,
        second_name || null,
        type || 'particulier',
        category || null,
        phone || null,
        city || null,
        email || null,
        patente || null,
        rc || null,
        ice || null,
        if_fiscal || null,
        address || null,
        latitude || null,
        longitude || null,
        id,
        req.tenantId,
      ]
    );
    if (!rows.length) return res.status(404).json({ message: 'Client introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteClient(req, res, next) {
  try {
    const { rows } = await pool.query(
      `DELETE FROM clients WHERE id=$1 AND tenant_id=$2 RETURNING id`,
      [req.params.id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Client introuvable' });
    res.json({ message: 'Client supprimé' });
  } catch (err) { next(err); }
}

module.exports = { getClients, getClient, createClient, updateClient, deleteClient };
