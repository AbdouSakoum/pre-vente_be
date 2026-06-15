const pool = require('../db/pool');

async function tenantMiddleware(req, res, next) {
  // Accepte le tenant via header X-Tenant (dev) ou sous-domaine (prod)
  const host = req.get('host') || req.hostname;
  const xTenant = req.get('X-Tenant');
  const subdomain = xTenant || host.split('.')[0];

  if (!subdomain) {
    return res.status(400).json({ message: 'Tenant non identifiable' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, is_active FROM tenants WHERE subdomain = $1',
      [subdomain]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant introuvable' });
    }

    const tenant = result.rows[0];

    if (!tenant.is_active) {
      return res.status(403).json({ message: 'Compte suspendu' });
    }

    req.tenantId = tenant.id;
    req.tenantName = tenant.name;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = tenantMiddleware;
