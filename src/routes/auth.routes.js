const router = require('express').Router();
const { login, me } = require('../controllers/authController');
const auth = require('../middlewares/auth');
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

router.post('/login', login);
router.get('/me', auth(), me);

router.post('/change-password', auth(), async (req, res, next) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ message: 'Mot de passe minimum 6 caractères' });
  }
  try {
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash=$1, must_change_password=false WHERE id=$2 AND tenant_id=$3',
      [hash, req.user.id, req.user.tenantId]
    );
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) { next(err); }
});

module.exports = router;
