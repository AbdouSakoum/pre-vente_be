const router = require('express').Router();
const auth = require('../middlewares/auth');
const { getClients, getClient, createClient, updateClient, deleteClient } = require('../controllers/clientController');

router.get('/',      auth(),                        getClients);
router.get('/:id',   auth(),                        getClient);
router.post('/',     auth('pre_seller', 'admin'),   createClient);
router.put('/:id',   auth('pre_seller', 'admin'),   updateClient);
router.delete('/:id', auth('admin'),                deleteClient);

module.exports = router;
