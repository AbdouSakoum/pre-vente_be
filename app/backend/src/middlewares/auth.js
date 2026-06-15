const jwt = require('jsonwebtoken');

function authMiddleware(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token manquant' });
    }

    const token = header.split(' ')[1];
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      // S'assurer que le token appartient bien au bon tenant
      if (payload.tenantId !== req.tenantId) {
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
