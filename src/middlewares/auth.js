const jwt = require('jsonwebtoken');

function authMiddleware(...roles) {
  return (req, res, next) => {
    // Accepte le token via header Authorization OU query param ?token= (pour les liens PDF)
    let token = req.query.token;
    if (!token) {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token manquant' });
      }
      token = header.split(' ')[1];
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      // Pour les liens PDF (token en query param), req.tenantId peut ne pas être
      // résolu par le middleware tenant (ex: localhost en dev). On le prend du JWT.
      if (!req.tenantId) {
        req.tenantId = payload.tenantId;
      } else if (payload.tenantId !== req.tenantId) {
        return res.status(403).json({ message: 'Accès refusé' });
      }

      if (roles.length && payload.role !== 'admin' && !roles.includes(payload.role)) {
        return res.status(403).json({ message: 'Permission insuffisante' });
      }

      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Token invalide ou expiré' });
    }
  };
}

module.exports = authMiddleware;
