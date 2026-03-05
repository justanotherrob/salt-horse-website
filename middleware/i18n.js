const fs = require('fs');
const path = require('path');

// Load all locale files at startup
const localesDir = path.join(__dirname, '..', 'locales');
const locales = {};
const supportedLangs = [];

fs.readdirSync(localesDir).forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    locales[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    supportedLangs.push(lang);
  }
});

const defaultLang = 'en';

/**
 * Parse Accept-Language header and return best matching language.
 * e.g. "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7" → "de"
 */
function parseAcceptLanguage(header) {
  if (!header) return null;

  const langs = header.split(',').map(part => {
    const [langTag, qPart] = part.trim().split(';');
    const q = qPart ? parseFloat(qPart.split('=')[1]) : 1;
    const lang = langTag.trim().split('-')[0].toLowerCase(); // "de-DE" → "de"
    return { lang, q };
  }).sort((a, b) => b.q - a.q);

  for (const { lang } of langs) {
    if (supportedLangs.includes(lang)) {
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
 */
function i18nMiddleware(req, res, next) {
  // Skip admin routes — admin is always in English
  if (req.path.startsWith('/admin') || req.path.startsWith('/api')) {
    res.locals.t = locales[defaultLang];
    res.locals.lang = defaultLang;
    res.locals.supportedLangs = supportedLangs;
    res.locals.locales = locales;
    return next();
  }

  let lang = null;

  // 1. Query parameter override — ?lang=de
  if (req.query.lang && supportedLangs.includes(req.query.lang)) {
    lang = req.query.lang;
    // Set cookie for 30 days so the choice persists
    res.cookie('lang', lang, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
  }

  // 2. Cookie from previous selection
  if (!lang && req.cookies && req.cookies.lang && supportedLangs.includes(req.cookies.lang)) {
    lang = req.cookies.lang;
  }

  // 3. Accept-Language header
  if (!lang) {
    lang = parseAcceptLanguage(req.headers['accept-language']);
  }

  // 4. Default
  if (!lang) {
    lang = defaultLang;
  }

  res.locals.t = locales[lang] || locales[defaultLang];
  res.locals.lang = lang;
  res.locals.supportedLangs = supportedLangs;
  res.locals.locales = locales;

  next();
}

module.exports = { i18nMiddleware, locales, supportedLangs };
