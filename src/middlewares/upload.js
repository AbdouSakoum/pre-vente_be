const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const useAzure = !!process.env.AZURE_STORAGE_CONNECTION_STRING;

const storage = useAzure
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => {
        const tenantId = req.tenantId || req.params.id;
        const module = req.params.module || req.uploadModule;
        const dir = tenantId && module
          ? path.join('uploads', tenantId, module)
          : path.join('uploads', '_tmp');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      }
    });

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WEBP, PDF'));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

module.exports = upload;
