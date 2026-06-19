const router = require('express').Router();
const auth = require('../middlewares/auth');
const c = require('../controllers/orderController');
const { generateDeliveryNote, getDeliveryNotes } = require('../controllers/deliveryController');

router.get('/', auth(), c.getOrders);
router.get('/:id', auth(), c.getOrder);
router.post('/', auth('pre_seller', 'admin'), c.createOrder);
router.put('/:id', auth('pre_seller', 'admin'), c.updateOrder);
router.post('/:id/assign', auth('admin'), c.assignOrder);
router.patch('/:id/status', auth('admin', 'delivery'), c.updateOrderStatus);
router.patch('/:id/start', auth('delivery', 'admin'), c.startDelivery);
router.post('/:order_id/deliver', auth('delivery', 'admin'), generateDeliveryNote);

module.exports = router;
