const db = require('../db/database');

let redirectMap = new Map();
let lastLoaded = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadRedirects() {
  const rows = await db.all('SELECT from_path, to_url FROM redirects');
  redirectMap = new Map(rows.map(r => [r.from_path, r.to_url]));
  lastLoaded = Date.now();
}

async function refreshRedirects() {
  await loadRedirects();
}

async function redirectMiddleware(req, res, next) {
  try {
    // Refresh cache if stale
    if (Date.now() - lastLoaded > CACHE_TTL) {
      await loadRedirects();
    }

    const target = redirectMap.get(req.path);
    if (target) {
      return res.redirect(301, target);
    }
  } catch (err) {
    // Don't block the request if redirect loading fails
    console.error('Redirect middleware error:', err.message);
  }
  next();
}

// Initial load will happen on first request (async)

module.exports = { redirectMiddleware, refreshRedirects };
