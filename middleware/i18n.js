const fs = require('fs');
const path = require('path');
const db = require('../db/database');

// Load all locale files at startup
const localesDir = path.join(__dirname, '..', 'locales');
const locales = {};
const allLangs = [];

fs.readdirSync(localesDir).forEach(file => {
  if (file.endsWith('.json') && !file.startsWith('_')) {
    const lang = file.replace('.json', '');
    locales[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    allLangs.push(lang);
  }
});

const defaultLang = 'en';

/**
 * Get the list of currently enabled languages (always includes 'en').
 * Reads from site_settings on each request so admin changes take effect immediately.
 */
async function getEnabledLangs() {
  const enabled = ['en'];
  for (const lang of allLangs) {
    if (lang === 'en') continue;
    const setting = await db.get("SELECT value FROM site_settings WHERE key = $1", [`lang_${lang}_enabled`]);
    // Default to enabled if no setting exists yet
    if (!setting || setting.value === 'true') {
      enabled.push(lang);
    }
  }
  return enabled;
}

/**
 * Parse Accept-Language header and return best matching enabled language.
 * e.g. "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7" → "de"
 */
function parseAcceptLanguage(header, enabledLangs) {
  if (!header) return null;

  const langs = header.split(',').map(part => {
    const [langTag, qPart] = part.trim().split(';');
    const q = qPart ? parseFloat(qPart.split('=')[1]) : 1;
    const lang = langTag.trim().split('-')[0].toLowerCase(); // "de-DE" → "de"
    return { lang, q };
  }).sort((a, b) => b.q - a.q);

  for (const { lang } of langs) {
    if (enabledLangs.includes(lang)) {
      return lang;
    }
  }
  return null;
}

/**
 * i18n middleware — determines language from:
 * 1. ?lang=xx query parameter (also sets cookie)
 * 2. lang cookie (from previous manual selection)
 * 3. Accept-Language header
 * 4. Default to English
 *
 * Only enabled languages are offered. Disabled languages fall back to English.
 */
async function i18nMiddleware(req, res, next) {
  try {
    const enabledLangs = await getEnabledLangs();

    // Skip admin routes — admin is always in English
    if (req.path.startsWith('/admin') || req.path.startsWith('/api')) {
      res.locals.t = locales[defaultLang];
      res.locals.lang = defaultLang;
      res.locals.supportedLangs = enabledLangs;
      res.locals.locales = locales;
      return next();
    }

    let lang = null;

    // 1. Query parameter override — ?lang=de (only if that language is enabled)
    if (req.query.lang && enabledLangs.includes(req.query.lang)) {
      lang = req.query.lang;
      // Set cookie for 30 days so the choice persists
      res.cookie('lang', lang, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    }

    // 2. Cookie from previous selection (only if that language is still enabled)
    if (!lang && req.cookies && req.cookies.lang && enabledLangs.includes(req.cookies.lang)) {
      lang = req.cookies.lang;
    }

    // 3. Accept-Language header
    if (!lang) {
      lang = parseAcceptLanguage(req.headers['accept-language'], enabledLangs);
    }

    // 4. Default
    if (!lang) {
      lang = defaultLang;
    }

    res.locals.t = locales[lang] || locales[defaultLang];
    res.locals.lang = lang;
    res.locals.supportedLangs = enabledLangs;
    res.locals.locales = locales;

    next();
  } catch (err) {
    // Fallback to English if DB query fails
    res.locals.t = locales[defaultLang];
    res.locals.lang = defaultLang;
    res.locals.supportedLangs = ['en'];
    res.locals.locales = locales;
    next();
  }
}

module.exports = { i18nMiddleware, locales, supportedLangs: allLangs };
