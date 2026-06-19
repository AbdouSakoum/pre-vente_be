require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const tenant = require('./middlewares/tenant');
const superadminAuth = require('./middlewares/superadmin');

const app = express();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet());
app.use('/api/', rateLimit({ windowMs: 60000, max: 100, standardHeaders: true, legacyHeaders: false }));
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const allowedOrigins = CORS_ORIGIN
  ? CORS_ORIGIN.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^http:\/\/([a-z0-9-]+\.)?localhost(:\d+)?$/.test(origin)) return callback(null, true);
    if (/^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return callback(null, true);
    if (/^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/.test(origin)) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS non autorisé : ' + origin));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(uploadDir));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Super admin — pas de middleware tenant ici
app.use('/api/superadmin', superadminAuth, require('./routes/superadmin.routes'));

// Endpoint public — info tenant par sous-domaine
app.use('/api/tenant', require('./routes/tenant.routes'));

app.use('/api', tenant);
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/vehicles', require('./routes/vehicle.routes'));
app.use('/api/clients', require('./routes/client.routes'));
app.use('/api', require('./routes/catalog.routes'));
app.use('/api/orders', require('./routes/order.routes'));
app.use('/api/stock', require('./routes/stock.routes'));
app.use('/api/fournisseurs', require('./routes/fournisseur.routes'));
app.use('/api/delivery-notes', require('./routes/delivery.routes'));
app.use('/api/delivery', require('./routes/delivery.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/print-settings', require('./routes/print-settings.routes'));
app.use('/api/pdf', require('./routes/pdf.routes'));
app.use('/api/visits', require('./routes/visit.routes'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Erreur serveur' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend démarré sur le port ${PORT}`));

module.exports = app;
