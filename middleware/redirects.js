const db = require('../db/database');

let redirectMap = new Map();
let lastLoaded = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function loadRedirects() {
  const rows = db.prepare('SELECT from_path, to_url FROM redirects').all();
  redirectMap = new Map(rows.map(r => [r.from_path, r.to_url]));
  lastLoaded = Date.now();
}

function refreshRedirects() {
  loadRedirects();
}

function redirectMiddleware(req, res, next) {
  // Refresh cache if stale
  if (Date.now() - lastLoaded > CACHE_TTL) {
    loadRedirects();
  }

  const target = redirectMap.get(req.path);
  if (target) {
    return res.redirect(301, target);
  }
  next();
}

// Initial load
try { loadRedirects(); } catch (e) { /* table may not exist yet */ }

module.exports = { redirectMiddleware, refreshRedirects };
