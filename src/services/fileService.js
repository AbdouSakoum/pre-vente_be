const pool = require('../db/pool');
const path = require('path');
const fs = require('fs');

async function save({ tenantId, module, entityId, file, uploadedBy }) {
  const storedName = path.basename(file.path);
  const result = await pool.query(
    `INSERT INTO files (tenant_id, module, entity_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [tenantId, module, entityId, file.originalname, storedName, file.mimetype, file.size, uploadedBy]
  );
  return result.rows[0];
}

async function getById(fileId, tenantId) {
  const result = await pool.query(
    `SELECT * FROM files WHERE id = $1 AND tenant_id = $2`,
    [fileId, tenantId]
  );
  return result.rows[0] || null;
}

async function listByEntity(module, entityId, tenantId) {
  const result = await pool.query(
    `SELECT * FROM files WHERE module = $1 AND entity_id = $2 AND tenant_id = $3 ORDER BY created_at DESC`,
    [module, entityId, tenantId]
  );
  return result.rows;
}

async function deleteById(fileId, tenantId) {
  const file = await getById(fileId, tenantId);
  if (!file) return null;

  const filePath = path.join('uploads', tenantId, file.module, file.stored_name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await pool.query(`DELETE FROM files WHERE id = $1 AND tenant_id = $2`, [fileId, tenantId]);
  return file;
}

module.exports = { save, getById, listByEntity, deleteById };
