const router = require('express').Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const upload = require('../middlewares/upload');
const fileService = require('../services/fileService');

// GET /api/superadmin/tenants — liste tous les tenants avec stats
router.get('/tenants', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id, t.name, t.subdomain, t.is_active, t.created_at,
        COUNT(DISTINCT u.id) AS user_count,
        COUNT(DISTINCT o.id) AS order_count,
        f.id AS logo_file_id,
        f.stored_name AS logo_stored_name,
        f.module AS logo_module,
        f.url AS logo_url_direct
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      LEFT JOIN orders o ON o.tenant_id = t.id
      LEFT JOIN files f ON f.id = t.logo_file_id
      GROUP BY t.id, f.id, f.stored_name, f.module
      ORDER BY t.created_at DESC
    `);
    const rows = result.rows.map(t => ({
      ...t,
      logo_url: t.logo_url_direct || (t.logo_file_id ? `/api/files/${t.logo_file_id}` : null)
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/superadmin/tenants — créer un tenant + admin initial
router.post('/tenants', (req, res, next) => { req.uploadModule = 'societe'; next(); }, upload.single('logo'), async (req, res) => {
  const { name, subdomain, admin_name, admin_email, admin_password } = req.body;
  if (!name || !subdomain || !admin_email || !admin_password) {
    return res.status(400).json({ message: 'Champs obligatoires manquants' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM tenants WHERE subdomain = $1', [subdomain]);
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Ce sous-domaine existe déjà' });
    }

    const tenantRes = await client.query(
      'INSERT INTO tenants (name, subdomain) VALUES ($1, $2) RETURNING id',
      [name, subdomain]
    );
    const tenantId = tenantRes.rows[0].id;

    // Compte admin
    const hash = await bcrypt.hash(admin_password, 10);
    await client.query(
      'INSERT INTO users (tenant_id, name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, $5, true)',
      [tenantId, admin_name || name + ' Admin', admin_email, hash, 'admin']
    );

    // Véhicule par défaut
    await client.query(
      'INSERT INTO vehicles (tenant_id, label, plate) VALUES ($1, $2, $3)',
      [tenantId, 'Véhicule 1', 'VH-001']
    );

    // Catégorie par défaut
    const catRes = await client.query(
      'INSERT INTO categories (tenant_id, name) VALUES ($1, $2) RETURNING id',
      [tenantId, 'Général']
    );
    const categoryId = catRes.rows[0].id;

    // Produit exemple avec variante
    const prodRes = await client.query(
      'INSERT INTO products (tenant_id, category_id, name, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [tenantId, categoryId, 'Produit exemple', 'Produit créé automatiquement — à modifier']
    );
    const productId = prodRes.rows[0].id;

    await client.query(
      'INSERT INTO product_variants (tenant_id, product_id, name, price, sku) VALUES ($1, $2, $3, $4, $5)',
      [tenantId, productId, 'Standard', 0, 'EX-001']
    );

    await client.query('COMMIT');

    if (req.file) {
      const savedFile = await fileService.save({
        tenantId,
        module: 'societe',
        entityId: tenantId,
        file: req.file,
        uploadedBy: null
      });
      await pool.query('UPDATE tenants SET logo_file_id = $1 WHERE id = $2', [savedFile.id, tenantId]);
    }

    res.status(201).json({ message: 'Tenant créé', subdomain, tenant_id: tenantId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/superadmin/tenants/:id — modifier nom et/ou logo
router.patch('/tenants/:id', (req, res, next) => { req.uploadModule = 'societe'; next(); }, upload.single('logo'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Le nom est obligatoire' });
  try {
    const result = await pool.query('UPDATE tenants SET name = $1 WHERE id = $2 RETURNING id, logo_file_id', [name, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ message: 'Tenant introuvable' });

    if (req.file) {
      const tenantId = req.params.id;
      // Supprimer l'ancien logo s'il existe
      const oldFileId = result.rows[0].logo_file_id;
      if (oldFileId) await fileService.deleteById(oldFileId, tenantId);

      const savedFile = await fileService.save({
        tenantId,
        module: 'societe',
        entityId: tenantId,
        file: req.file,
        uploadedBy: null
      });
      await pool.query('UPDATE tenants SET logo_file_id = $1 WHERE id = $2', [savedFile.id, tenantId]);
    }

    res.json({ message: 'Tenant mis à jour' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/superadmin/tenants/:id/toggle — activer / désactiver
router.patch('/tenants/:id/toggle', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE tenants SET is_active = NOT is_active WHERE id = $1 RETURNING id, name, subdomain, is_active',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Tenant introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/superadmin/tenants/:id/activation-code — générer un code d'activation mobile
router.post('/tenants/:id/activation-code', async (req, res) => {
  try {
    const tenant = await pool.query('SELECT id, name FROM tenants WHERE id = $1', [req.params.id]);
    if (!tenant.rows.length) return res.status(404).json({ message: 'Tenant introuvable' });

    // Générer un code à 6 chiffres unique
    let code, exists;
    do {
      code = String(Math.floor(100000 + Math.random() * 900000));
      const check = await pool.query(
        'SELECT id FROM tenant_activation_codes WHERE code = $1 AND used = false AND expires_at > NOW()',
        [code]
      );
      exists = check.rows.length > 0;
    } while (exists);

    // Expiration dans 7 jours
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(
      'INSERT INTO tenant_activation_codes (tenant_id, code, expires_at) VALUES ($1, $2, $3)',
      [req.params.id, code, expiresAt]
    );

    res.status(201).json({
      code,
      expires_at: expiresAt,
      tenant_name: tenant.rows[0].name,
      message: `Code valable 7 jours — à transmettre au client`
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/superadmin/stats — stats globales
router.get('/stats', async (req, res) => {
  try {
    const [tenants, users, orders] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM tenants WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM orders'),
    ]);
    res.json({
      active_tenants: parseInt(tenants.rows[0].count),
      total_users: parseInt(users.rows[0].count),
      total_orders: parseInt(orders.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
