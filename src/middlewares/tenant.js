const pool = require('../db/pool');
const jwt  = require('jsonwebtoken');

async function tenantMiddleware(req, res, next) {
  // Accepte le tenant via header X-Tenant (dev) ou sous-domaine (prod)
  const host = req.get('host') || req.hostname;
  const xTenant = req.get('X-Tenant');
  const subdomain = xTenant || host.split('.')[0];

  // Résolution par sous-domaine
  if (subdomain) {
    try {
      const result = await pool.query(
        'SELECT id, name, is_active FROM tenants WHERE subdomain = $1',
        [subdomain]
      );

      if (result.rows.length > 0) {
        const tenant = result.rows[0];
        if (!tenant.is_active) {
          return res.status(403).json({ message: 'Compte suspendu' });
        }
        req.tenantId = tenant.id;
        req.tenantName = tenant.name;
        return next();
      }
    } catch (err) {
      return next(err);
    }
  }

  // Fallback : résolution depuis le JWT (liens PDF en dev ou sans sous-domaine)
  const tokenFromQuery = req.query.token;
  const tokenFromHeader = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const token = tokenFromQuery || tokenFromHeader;

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.tenantId) {
        req.tenantId = payload.tenantId;
        return next();
      }
    } catch (_) {
      // token invalide, on laisse auth() gérer l'erreur
    }
  }

  return res.status(404).json({ message: 'Tenant introuvable' });
}

module.exports = tenantMiddleware;
