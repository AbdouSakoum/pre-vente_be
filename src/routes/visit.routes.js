const router = require('express').Router();
const auth = require('../middlewares/auth');
const { getVisits, getMyVisits, createVisit, closeVisit, deleteVisit } = require('../controllers/visitController');

// Mes visites du jour (pré-vendeur)
router.get('/my',  auth('pre_seller', 'admin'), getMyVisits);

// Toutes les visites (admin)
router.get('/',    auth('admin'),               getVisits);

// Créer une visite
router.post('/',   auth('pre_seller', 'admin'), createVisit);

// Clôturer une visite (ordered ou closed)
router.patch('/:id/close', auth('pre_seller', 'admin'), closeVisit);

// Supprimer (admin uniquement)
router.delete('/:id', auth('admin'),            deleteVisit);

module.exports = router;
