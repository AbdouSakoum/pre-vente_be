const router = require('express').Router();
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const c = require('../controllers/catalogController');

// Categories
router.get('/categories', auth(), c.getCategories);
router.post('/categories', auth('admin', 'stock_manager'), c.createCategory);
router.put('/categories/:id', auth('admin', 'stock_manager'), c.updateCategory);
router.delete('/categories/:id', auth('admin', 'stock_manager'), c.deleteCategory);

const setArticleModule = (req, res, next) => { req.uploadModule = 'article'; next(); };

// champs dynamiques pour variants images (jusqu'à 20 variantes)
const variantImageFields = Array.from({ length: 20 }, (_, i) => ({ name: `variant_image_${i}`, maxCount: 1 }));
const productCreateFields = upload.fields([{ name: 'product_image', maxCount: 1 }, ...variantImageFields]);

// Vue commande (prévendeur)
router.get('/products/order-view', auth('admin', 'stock_manager', 'pre_seller'), c.getProductsForOrder);

// Products
router.get('/products', auth(), c.getProducts);
router.get('/products/:id', auth(), c.getProduct);
router.post('/products', auth('admin', 'stock_manager'), setArticleModule, productCreateFields, c.createProduct);
router.put('/products/:id', auth('admin', 'stock_manager'), setArticleModule, productCreateFields, c.updateProduct);
router.delete('/products/:id', auth('admin', 'stock_manager'), c.deleteProduct);

// Variants
router.post('/products/:product_id/variants', auth('admin', 'stock_manager'), setArticleModule, upload.single('image'), c.createVariant);
router.put('/variants/:id', auth('admin', 'stock_manager'), setArticleModule, upload.single('image'), c.updateVariant);
router.delete('/variants/:id', auth('admin', 'stock_manager'), c.deleteVariant);

module.exports = router;
