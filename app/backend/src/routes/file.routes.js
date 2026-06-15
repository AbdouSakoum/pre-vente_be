const router = require('express').Router();
const auth = require('../middlewares/auth');
const fileCtrl = require('../controllers/fileController');

// Télécharger un fichier par son ID
router.get('/:file_id', auth(), fileCtrl.download);

// Lister les fichiers d'une entité
router.get('/:module/:entity_id', auth(), fileCtrl.listByEntity);

module.exports = router;
