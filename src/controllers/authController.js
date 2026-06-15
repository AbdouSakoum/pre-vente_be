const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

async function login(req, res, next) {
  const { email, password } = req.body;
  const tenantId = req.tenantId;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE tenant_id = $1 AND email = $2 AND is_active = true',
      [tenantId, email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Identifiants incorrects' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      { id: user.id, tenantId: user.tenant_id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      must_change_password: user.must_change_password === true
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, me };
