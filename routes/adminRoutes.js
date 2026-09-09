const express = require('express');
const router = express.Router();
const User = require('../models/User');
const isAdmin = require('../middlewares/isAdmin');

// Admin Dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
  const users = await User.find().sort('-createdAt').limit(10);
  res.render('admin/dashboard', { users });
});

// User Management
router.get('/users', isAdmin, async (req, res) => {
  const users = await User.find().sort('-createdAt');
  res.render('admin/users', { users });
});

// Delete User
router.post('/users/:id/delete', isAdmin, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/admin/users');
});

module.exports = router;