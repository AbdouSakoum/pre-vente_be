const router = require('express').Router();
const auth = require('../middlewares/auth');
const { getDeliveryNotes, getMyOrders } = require('../controllers/deliveryController');

router.get('/', auth(), getDeliveryNotes);
router.get('/my-orders', auth('delivery'), getMyOrders);

module.exports = router;
