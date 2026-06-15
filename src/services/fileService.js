const pool = require('../db/pool');
const path = require('path');
const fs = require('fs');

const useAzure = !!process.env.AZURE_STORAGE_CONNECTION_STRING;

let blobServiceClient, containerClient;
if (useAzure) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER || 'uploads');
}

async function uploadToAzure(file, tenantId, module) {
  const ext = path.extname(file.originalname);
  const blobName = `${tenantId}/${module}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(file.buffer, {
    blobHTTPHeaders: { blobContentType: file.mimetype }
  });
  return { storedName: blobName, url: blockBlobClient.url };
}

async function save({ tenantId, module, entityId, file, uploadedBy }) {
  let storedName, url;

  if (useAzure) {
    const result = await uploadToAzure(file, tenantId, module);
    storedName = result.storedName;
    url = result.url;
  } else {
    storedName = path.basename(file.path);
    url = null;
  }

  const result = await pool.query(
    `INSERT INTO files (tenant_id, module, entity_id, original_name, stored_name, mime_type, size_bytes, uploaded_by, url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [tenantId, module, entityId, file.originalname, storedName, file.mimetype, file.size, uploadedBy, url]
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

  if (useAzure) {
    const blockBlobClient = containerClient.getBlockBlobClient(file.stored_name);
    await blockBlobClient.deleteIfExists();
  } else {
    const filePath = path.join('uploads', tenantId, file.module, file.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await pool.query(`DELETE FROM files WHERE id = $1 AND tenant_id = $2`, [fileId, tenantId]);
  return file;
}

module.exports = { save, getById, listByEntity, deleteById };
