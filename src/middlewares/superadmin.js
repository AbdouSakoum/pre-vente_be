module.exports = (req, res, next) => {
  const token = req.headers['x-superadmin-token'];
  if (!token || token !== process.env.SUPERADMIN_SECRET) {
    return res.status(401).json({ message: 'Accès super admin refusé' });
  }
  next();
};
