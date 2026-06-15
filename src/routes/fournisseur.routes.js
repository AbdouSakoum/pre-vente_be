const router = require('express').Router();
const auth = require('../middlewares/auth');
const c = require('../controllers/fournisseurController');

router.get('/', auth(), c.list);
router.post('/', auth('admin', 'stock_manager'), c.create);
router.put('/:id', auth('admin', 'stock_manager'), c.update);
router.delete('/:id', auth('admin', 'stock_manager'), c.remove);

module.exports = router;
