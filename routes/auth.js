const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const router = express.Router();

// GET /admin/login
router.get('/admin/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: null, layout: false });
});

// POST /admin/login
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('admin/login', { error: 'Email and password required', layout: false });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  if (!user) {
    return res.render('admin/login', { error: 'Invalid email or password', layout: false });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.render('admin/login', { error: 'Invalid email or password', layout: false });
  }

  req.session.userId = user.id;
  req.session.userName = user.name || user.email;
  res.redirect('/admin');
});

// POST /admin/logout
router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
