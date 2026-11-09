function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in first.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only.' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };