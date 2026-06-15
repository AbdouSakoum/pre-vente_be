const router = require('express').Router();
const pool = require('../db/pool');

// GET /api/tenant/info?subdomain=sakoum1
router.get('/info', async (req, res) => {
  const { subdomain } = req.query;
  if (!subdomain) return res.status(400).json({ message: 'subdomain requis' });

  try {
    const result = await pool.query(`
      SELECT t.id, t.name, t.subdomain, t.is_active,
             f.stored_name AS logo_stored_name,
             f.module AS logo_module,
             t.id AS tenant_id_for_logo
      FROM tenants t
      LEFT JOIN files f ON f.id = t.logo_file_id
      WHERE t.subdomain = $1
    `, [subdomain]);

    if (!result.rows.length) return res.status(404).json({ message: 'Entreprise introuvable' });

    const t = result.rows[0];
    if (!t.is_active) return res.status(403).json({ message: 'Entreprise désactivée' });

    res.json({
      id: t.id,
      name: t.name,
      subdomain: t.subdomain,
      logo_url: t.logo_stored_name
        ? `http://localhost:3000/uploads/${t.id}/${t.logo_module}/${t.logo_stored_name}`
        : null
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tenant/activate/:code — valider un code d'activation mobile
router.get('/activate/:code', async (req, res) => {
  const { code } = req.params;
  if (!code || code.length !== 6) {
    return res.status(400).json({ message: 'Code invalide' });
  }

  try {
    const result = await pool.query(`
      SELECT
        ac.id AS code_id, ac.expires_at, ac.used,
        t.id, t.name, t.subdomain, t.is_active,
        f.stored_name AS logo_stored_name,
        f.module AS logo_module
      FROM tenant_activation_codes ac
      JOIN tenants t ON t.id = ac.tenant_id
      LEFT JOIN files f ON f.id = t.logo_file_id
      WHERE ac.code = $1
    `, [code]);

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Code introuvable' });
    }

    const row = result.rows[0];

    if (row.used) {
      return res.status(410).json({ message: 'Ce code a déjà été utilisé' });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ message: 'Ce code a expiré' });
    }

    if (!row.is_active) {
      return res.status(403).json({ message: 'Entreprise désactivée' });
    }

    // Marquer le code comme utilisé
    await pool.query(
      'UPDATE tenant_activation_codes SET used = true WHERE id = $1',
      [row.code_id]
    );

    res.json({
      tenant: {
        id: row.id,
        name: row.name,
        subdomain: row.subdomain,
        logo_url: row.logo_stored_name
          ? `http://localhost:3000/uploads/${row.id}/${row.logo_module}/${row.logo_stored_name}`
          : null
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
