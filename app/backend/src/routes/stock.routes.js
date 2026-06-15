const router = require('express').Router();
const auth = require('../middlewares/auth');
const c = require('../controllers/stockController');

router.get('/warehouse', auth(), c.getWarehouseStock);
router.post('/adjust', auth('admin', 'stock_manager'), c.adjustStock);
router.get('/movements', auth(), c.getMovements);

router.get('/arrivages', auth('admin', 'stock_manager'), c.getArrivages);
router.post('/arrivages', auth('admin', 'stock_manager'), c.createArrivage);
router.post('/arrival', auth('admin', 'stock_manager'), c.arrival); // rétrocompat

router.get('/delivery-users', auth('admin', 'stock_manager'), c.getDeliveryUsers);
router.get('/orders-for-delivery', auth('admin', 'stock_manager'), c.getOrdersForDelivery);
router.get('/charges', auth('admin', 'stock_manager'), c.getCharges);
router.post('/charges', auth('admin', 'stock_manager'), c.createCharge);
router.put('/charges/:id/close', auth('admin', 'stock_manager'), c.closeCharge);

module.exports = router;
