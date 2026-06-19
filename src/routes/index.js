const router = require('express').Router();
const auth = require('../middlewares/auth');

const authCtrl = require('../controllers/authController');
const catalogCtrl = require('../controllers/catalogController');
const orderCtrl = require('../controllers/orderController');
const stockCtrl = require('../controllers/stockController');
const deliveryCtrl = require('../controllers/deliveryController');
const clientCtrl = require('../controllers/clientController');
const userCtrl = require('../controllers/userController');

const upload = require('../middlewares/upload');
const fileRoutes = require('./file.routes');

// AUTH
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', auth(), authCtrl.me);

// USERS (admin)
router.get('/users', auth('admin'), userCtrl.getUsers);
router.post('/users', auth('admin'), userCtrl.createUser);
router.put('/users/:id', auth('admin'), userCtrl.updateUser);
router.post('/users/:id/reset-password', auth('admin'), userCtrl.resetPassword);
router.get('/dashboard', auth('admin'), userCtrl.getDashboard);

// CATALOG
router.get('/categories', auth(), catalogCtrl.getCategories);
router.post('/categories', auth('admin', 'stock_manager'), catalogCtrl.createCategory);
router.put('/categories/:id', auth('admin', 'stock_manager'), catalogCtrl.updateCategory);
router.delete('/categories/:id', auth('admin', 'stock_manager'), catalogCtrl.deleteCategory);

router.get('/products', auth(), catalogCtrl.getProducts);
router.get('/products/:id', auth(), catalogCtrl.getProduct);
router.post('/products', auth('admin', 'stock_manager'), catalogCtrl.createProduct);
router.put('/products/:id', auth('admin', 'stock_manager'), catalogCtrl.updateProduct);
router.delete('/products/:id', auth('admin', 'stock_manager'), catalogCtrl.deleteProduct);

router.post('/products/:product_id/variants', auth('admin', 'stock_manager'), (req, res, next) => { req.uploadModule = 'article'; next(); }, upload.single('image'), catalogCtrl.createVariant);
router.put('/variants/:id', auth('admin', 'stock_manager'), (req, res, next) => { req.uploadModule = 'article'; next(); }, upload.single('image'), catalogCtrl.updateVariant);
router.delete('/variants/:id', auth('admin', 'stock_manager'), catalogCtrl.deleteVariant);

// CLIENTS
router.get('/clients', auth(), clientCtrl.getClients);
router.post('/clients', auth('admin', 'pre_seller'), clientCtrl.createClient);
router.put('/clients/:id', auth('admin', 'pre_seller'), clientCtrl.updateClient);

// ORDERS
router.get('/orders', auth(), orderCtrl.getOrders);
router.get('/orders/:id', auth(), orderCtrl.getOrder);
router.post('/orders', auth('pre_seller', 'admin'), orderCtrl.createOrder);
router.put('/orders/:id', auth('pre_seller', 'admin'), orderCtrl.updateOrder);
router.post('/orders/:id/assign', auth('admin'), orderCtrl.assignOrder);
router.patch('/orders/:id/status', auth('admin', 'delivery'), orderCtrl.updateOrderStatus);

// FOURNISSEURS
const fournisseurRoutes = require('./fournisseur.routes');
router.use('/fournisseurs', fournisseurRoutes);

// STOCK
const stockRoutes = require('./stock.routes');
router.use('/stock', stockRoutes);

// DELIVERY
router.get('/delivery/my-orders', auth('delivery'), deliveryCtrl.getMyOrders);
router.patch('/orders/:id/start', auth('delivery', 'admin'), orderCtrl.startDelivery);
router.post('/orders/:order_id/deliver', auth('delivery', 'admin'), deliveryCtrl.generateDeliveryNote);
router.get('/delivery-notes', auth('admin', 'delivery'), deliveryCtrl.getDeliveryNotes);

// VISITS
const visitRoutes = require('./visit.routes');
router.use('/visits', visitRoutes);

// FILES
router.use('/files', fileRoutes);

module.exports = router;
