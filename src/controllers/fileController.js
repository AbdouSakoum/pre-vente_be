const path = require('path');
const fs = require('fs');
const fileService = require('../services/fileService');

async function download(req, res) {
  const file = await fileService.getById(req.params.file_id, req.tenantId);
  if (!file) return res.status(404).json({ error: 'Fichier introuvable' });

  if (file.url) return res.redirect(file.url);

  const filePath = path.resolve('uploads', req.tenantId, file.module, file.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier manquant sur le serveur' });

  res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
  res.setHeader('Content-Type', file.mime_type);
  fs.createReadStream(filePath).pipe(res);
}

async function listByEntity(req, res) {
  const { module, entity_id } = req.params;
  const files = await fileService.listByEntity(module, entity_id, req.tenantId);
  res.json(files);
}

module.exports = { download, listByEntity };
