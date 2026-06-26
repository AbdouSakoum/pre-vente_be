const router  = require('express').Router();
const auth    = require('../middlewares/auth');
const pool    = require('../db/pool');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { saveFile, useAzure } = require('../services/storageService');

const upload = multer({
  storage: useAzure ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../../uploads', req.tenantId, 'logo');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `logo_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg','image/png','image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté (JPEG, PNG, WEBP uniquement)'));
  },
});

// ── GET /api/print-settings ──────────────────────────────────────────────────
// Retourne les paramètres du tenant (crée une ligne vide si inexistante)
router.get('/', auth('admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId;

    let result = await pool.query(
      `SELECT * FROM print_settings WHERE tenant_id = $1`,
      [tid]
    );

    // Auto-créer si première visite
    if (!result.rows.length) {
      result = await pool.query(
        `INSERT INTO print_settings (tenant_id) VALUES ($1) RETURNING *`,
        [tid]
      );
    }

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── PUT /api/print-settings ──────────────────────────────────────────────────
router.put('/', auth('admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId;
    const {
      company_name, address, city, phone, email,
      ice, if_fiscal, rc, patente, footer_text,
      sector, currency, lang, primary_color, secondary_color,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO print_settings
         (tenant_id, company_name, address, city, phone, email, ice, if_fiscal, rc, patente, footer_text,
          sector, currency, lang, primary_color, secondary_color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (tenant_id) DO UPDATE SET
         company_name     = EXCLUDED.company_name,
         address          = EXCLUDED.address,
         city             = EXCLUDED.city,
         phone            = EXCLUDED.phone,
         email            = EXCLUDED.email,
         ice              = EXCLUDED.ice,
         if_fiscal        = EXCLUDED.if_fiscal,
         rc               = EXCLUDED.rc,
         patente          = EXCLUDED.patente,
         footer_text      = EXCLUDED.footer_text,
         sector           = EXCLUDED.sector,
         currency         = EXCLUDED.currency,
         lang             = EXCLUDED.lang,
         primary_color    = EXCLUDED.primary_color,
         secondary_color  = EXCLUDED.secondary_color,
         updated_at       = NOW()
       RETURNING *`,
      [tid, company_name, address, city, phone, email, ice, if_fiscal, rc, patente, footer_text,
       sector, currency, lang, primary_color || '#2f6bff', secondary_color || '#16a34a']
    );

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── POST /api/print-settings/logo ────────────────────────────────────────────
// Upload du logo
router.post('/logo', auth('admin'), upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });
    const tid     = req.tenantId;
    const logoUrl = await saveFile(req.file, tid, 'logo');
    const result = await pool.query(
      `INSERT INTO print_settings (tenant_id, logo_url)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO UPDATE SET logo_url = EXCLUDED.logo_url, updated_at = NOW()
       RETURNING *`,
      [tid, logoUrl]
    );
    res.json({ logo_url: result.rows[0].logo_url });
  } catch (err) { next(err); }
});

// ── DELETE /api/print-settings/logo ─────────────────────────────────────────
router.delete('/logo', auth('admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId;

    const existing = await pool.query(
      `SELECT logo_url FROM print_settings WHERE tenant_id = $1`, [tid]
    );

    if (existing.rows[0]?.logo_url) {
      const filePath = path.join(__dirname, '../../', existing.rows[0].logo_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query(
      `UPDATE print_settings SET logo_url = NULL, updated_at = NOW() WHERE tenant_id = $1`,
      [tid]
    );

    res.json({ message: 'Logo supprimé' });
  } catch (err) { next(err); }
});

// ── POST /api/print-settings/cachet ─────────────────────────────────────────
router.post('/cachet', auth('admin'), upload.single('cachet'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });
    const tid      = req.tenantId;
    const cachetUrl = await saveFile(req.file, tid, 'cachet');
    const result = await pool.query(
      `INSERT INTO print_settings (tenant_id, cachet_url)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO UPDATE SET cachet_url = EXCLUDED.cachet_url, updated_at = NOW()
       RETURNING cachet_url`,
      [tid, cachetUrl]
    );
    res.json({ cachet_url: result.rows[0].cachet_url });
  } catch (err) { next(err); }
});

// ── DELETE /api/print-settings/cachet ───────────────────────────────────────
router.delete('/cachet', auth('admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId;
    const existing = await pool.query(
      `SELECT cachet_url FROM print_settings WHERE tenant_id = $1`, [tid]
    );
    if (existing.rows[0]?.cachet_url) {
      const filePath = path.join(__dirname, '../../', existing.rows[0].cachet_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await pool.query(
      `UPDATE print_settings SET cachet_url = NULL, updated_at = NOW() WHERE tenant_id = $1`, [tid]
    );
    res.json({ message: 'Cachet supprimé' });
  } catch (err) { next(err); }
});

// ── GET /api/print-settings/activation-codes ────────────────────────────────
router.get('/activation-codes', auth('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tenant_activation_codes
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/print-settings/activation-codes ────────────────────────────────
// Génère un code d'activation mobile pour lier l'app à ce tenant
router.post('/activation-codes', auth('admin'), async (req, res, next) => {
  try {
    const { label, days } = req.body;
    const expiresAt = new Date(Date.now() + (parseInt(days) || 30) * 86400000);

    // Code numérique 6 chiffres (même format que le superadmin)
    let code, exists = true;
    while (exists) {
      code = String(Math.floor(100000 + Math.random() * 900000));
      const check = await pool.query(
        `SELECT id FROM tenant_activation_codes WHERE code = $1 AND used = false AND expires_at > NOW()`,
        [code]
      );
      exists = check.rows.length > 0;
    }

    const { rows } = await pool.query(
      `INSERT INTO tenant_activation_codes (tenant_id, code, expires_at, label)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenantId, code, expiresAt, label || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /api/print-settings/activation-codes/:id ─────────────────────────
router.delete('/activation-codes/:id', auth('admin'), async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM tenant_activation_codes WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    res.json({ message: 'Code supprime' });
  } catch (err) { next(err); }
});

module.exports = router;
