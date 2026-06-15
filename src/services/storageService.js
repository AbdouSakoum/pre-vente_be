const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

const useAzure = !!process.env.AZURE_STORAGE_CONNECTION_STRING;

let containerClient;
if (useAzure) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER || 'uploads');
}

async function saveFile(file, tenantId, module) {
  if (useAzure) {
    const ext = path.extname(file.originalname);
    const blobName = `${tenantId}/${module}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype }
    });
    return blockBlobClient.url;
  } else {
    return `/uploads/${tenantId}/${module}/${file.filename}`;
  }
}

module.exports = { saveFile, useAzure };
