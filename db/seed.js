require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');
const { initDatabase } = require('./database');

async function seed() {
  console.log('Initializing database schema...\n');
  await initDatabase();

  // ── Seed Admin User ──────────────────────────────────────
  const email = process.env.ADMIN_INITIAL_EMAIL || 'admin@salthorse.beer';
  const password = process.env.ADMIN_INITIAL_PASSWORD || 'changeme123';
  const hash = bcrypt.hashSync(password, 12);

  const existingUser = await db.get('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (!existingUser) {
    // Delete any old admin users and create fresh with current env vars
    await db.run('DELETE FROM users');
    await db.run('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', [email, hash, 'Admin']);
    console.log(`✓ Admin user created: ${email}`);
  } else {
    // Update existing user's password to match current env var
    await db.run('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email.toLowerCase().trim()]);
    console.log(`✓ Admin user updated: ${email}`);
  }

  // ── Seed Content Blocks ──────────────────────────────────
  const contentBlocks = [
    // Hero
    { key: 'hero_tagline', value: 'Craft Beer & Burgers — Edinburgh Old Town', type: 'text', label: 'Hero Tagline', section: 'Hero', sort_order: 1 },
    { key: 'meta_description', value: "Salt Horse offers local craft beers, grass-fed beef burgers, and numerous vegan choices. Edinburgh's Old Town craft beer bar.", type: 'text', label: 'Meta Description (SEO)', section: 'Hero', sort_order: 2 },

    // Stats
    { key: 'stats_taps', value: '14', type: 'text', label: 'Number of Taps', section: 'Stats', sort_order: 10 },
    { key: 'stats_taps_label', value: 'Rotating Taps', type: 'text', label: 'Taps Label', section: 'Stats', sort_order: 11 },
    { key: 'stats_bottles', value: '200+', type: 'text', label: 'Number of Bottles', section: 'Stats', sort_order: 12 },
    { key: 'stats_bottles_label', value: 'Cans & Bottles', type: 'text', label: 'Bottles Label', section: 'Stats', sort_order: 13 },
    { key: 'stats_years', value: '9', type: 'text', label: 'Years Open', section: 'Stats', sort_order: 14 },
    { key: 'stats_years_label', value: 'Years Pouring', type: 'text', label: 'Years Label', section: 'Stats', sort_order: 15 },

    // Drink
    { key: 'drink_label', value: 'What We Pour', type: 'text', label: 'Section Label', section: 'Drink', sort_order: 20 },
    { key: 'drink_title', value: 'Just the<br>Good Stuff.', type: 'html', label: 'Section Title', section: 'Drink', sort_order: 21 },
    { key: 'drink_description', value: 'We carry a carefully curated and rotating selection of craft beer with fourteen lines on draught and over 200 in cans and bottles. Crack one open here or haul it home. Your call.', type: 'text', label: 'Description', section: 'Drink', sort_order: 22 },
    { key: 'drink_feature_1', value: '14 rotating draught lines — always something new', type: 'text', label: 'Feature 1', section: 'Drink', sort_order: 23 },
    { key: 'drink_feature_2', value: 'Around 200 cans and bottles from the UK and beyond', type: 'text', label: 'Feature 2', section: 'Drink', sort_order: 24 },
    { key: 'drink_feature_3', value: 'Always a good selection of alcohol-free and gluten-free beers', type: 'text', label: 'Feature 3', section: 'Drink', sort_order: 25 },
    { key: 'drink_feature_4', value: 'A small, well-formed selection of wine and spirits', type: 'text', label: 'Feature 4', section: 'Drink', sort_order: 26 },
    { key: 'drink_feature_5', value: 'Take away available from the bottle shop', type: 'text', label: 'Feature 5', section: 'Drink', sort_order: 27 },

    // Food Banner
    { key: 'food_banner_text', value: "Burgers That Don't Mess About.", type: 'text', label: 'Banner Heading', section: 'Food', sort_order: 30 },

    // Food
    { key: 'food_label', value: 'What We Serve', type: 'text', label: 'Section Label', section: 'Food', sort_order: 31 },
    { key: 'food_title', value: 'Smashed.<br>Gone in Minutes.', type: 'html', label: 'Section Title', section: 'Food', sort_order: 32 },
    { key: 'food_description', value: "Burgers, wings, chips. That's the focus. The menu's small but tight — dry-aged beef, fried chicken sandwiches, proper chips hand cut and cooked twice. A few things for sharing. A few for soaking up the next beer. Vegan options that hold their own.", type: 'text', label: 'Description', section: 'Food', sort_order: 33 },
    { key: 'food_description_2', value: 'Freshly made. No shortcuts.', type: 'text', label: 'Description Line 2', section: 'Food', sort_order: 34 },
    { key: 'food_menu_url', value: 'https://www.canva.com/design/DAF60rRUkdo/05NCxWK150oq_6N_qFhoig/view?utm_content=DAF60rRUkdo&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=hee30c72c40', type: 'text', label: 'Current Menu URL', section: 'Food', sort_order: 35 },
    { key: 'food_allergens_url', value: 'https://docs.google.com/spreadsheets/d/1RYQO_EE9GnEy0Qtt7vddVJO8bqLquqUHEKRmd2tsPX8/edit#gid=0', type: 'text', label: 'Allergens Sheet URL', section: 'Food', sort_order: 36 },

    // Book
    { key: 'book_label', value: 'Reserve a Table', type: 'text', label: 'Section Label', section: 'Book', sort_order: 40 },
    { key: 'book_title', value: 'Bookings', type: 'text', label: 'Section Title', section: 'Book', sort_order: 41 },
    { key: 'book_description', value: 'Booking is optional — we always hold half the space for walk-ins. But if you want to guarantee a spot, book below.', type: 'text', label: 'Description', section: 'Book', sort_order: 42 },
    { key: 'book_url', value: 'https://book.tablesense.com/3oNRnDvfNYywe3S7n3WXrz', type: 'text', label: 'Booking URL', section: 'Book', sort_order: 43 },
    { key: 'book_groups_text', value: "Call us on +44 7400 653295. We can't assure multiple booked tables will be next to each other — contact us and we'll sort it.", type: 'text', label: 'Groups Info', section: 'Book', sort_order: 44 },
    { key: 'book_notice_text', value: "Tables are reserved for 10 minutes — give us a call if you're running late. Garden seating is first-come, first-served and cannot be reserved.", type: 'text', label: 'Notice Text', section: 'Book', sort_order: 45 },

    // Location
    { key: 'location_address_1', value: '57-61 Blackfriars St', type: 'text', label: 'Address Line 1', section: 'Location', sort_order: 50 },
    { key: 'location_address_2', value: 'Edinburgh', type: 'text', label: 'Address Line 2', section: 'Location', sort_order: 51 },
    { key: 'location_address_3', value: 'EH6 4BN', type: 'text', label: 'Address Line 3', section: 'Location', sort_order: 52 },
    { key: 'location_phone', value: '+44 7400 653 295', type: 'text', label: 'Phone Number', section: 'Location', sort_order: 53 },
    { key: 'location_maps_url', value: 'https://maps.app.goo.gl/cGZe1mgLYT23A3sm6', type: 'text', label: 'Google Maps URL', section: 'Location', sort_order: 54 },
    { key: 'location_notice', value: 'Our licence prohibits under-18s on the premises.', type: 'text', label: 'Licence Notice', section: 'Location', sort_order: 55 },
    { key: 'location_kitchen_note', value: 'Walk-in only after the kitchen closes.', type: 'text', label: 'Kitchen Note', section: 'Location', sort_order: 56 },

    // Footer
    { key: 'footer_tagline', value: "Craft Beer & Burgers in Edinburgh's Old Town since 2016.", type: 'text', label: 'Footer Tagline', section: 'Footer', sort_order: 60 },
    { key: 'footer_instagram', value: 'https://www.instagram.com/salthorsebar/', type: 'text', label: 'Instagram URL', section: 'Footer', sort_order: 61 },
    { key: 'footer_untappd', value: 'https://untappd.com/v/salt-horse/4673421', type: 'text', label: 'Untappd URL', section: 'Footer', sort_order: 62 },
  ];

  for (const block of contentBlocks) {
    await db.run(
      `INSERT INTO content_blocks (key, value, type, label, section, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (key) DO NOTHING`,
      [block.key, block.value, block.type, block.label, block.section, block.sort_order]
    );
  }
  console.log(`✓ Seeded ${contentBlocks.length} content blocks`);

  // ── Seed Opening Hours ───────────────────────────────────
  const hours = [
    { day: 'Monday',    day_order: 1, bar_open: '16:00', bar_close: '23:00', kitchen_open: '16:00', kitchen_close: '21:00' },
    { day: 'Tuesday',   day_order: 2, bar_open: '16:00', bar_close: '23:00', kitchen_open: '16:00', kitchen_close: '21:00' },
    { day: 'Wednesday', day_order: 3, bar_open: '16:00', bar_close: '23:00', kitchen_open: '16:00', kitchen_close: '21:00' },
    { day: 'Thursday',  day_order: 4, bar_open: '12:00', bar_close: '23:00', kitchen_open: '12:00', kitchen_close: '21:00' },
    { day: 'Friday',    day_order: 5, bar_open: '12:00', bar_close: '00:00', kitchen_open: '12:00', kitchen_close: '22:00' },
    { day: 'Saturday',  day_order: 6, bar_open: '12:00', bar_close: '00:00', kitchen_open: '12:00', kitchen_close: '22:00' },
    { day: 'Sunday',    day_order: 7, bar_open: '12:30', bar_close: '23:00', kitchen_open: '12:30', kitchen_close: '21:00' },
  ];

  for (const h of hours) {
    await db.run(
      `INSERT INTO opening_hours (day, day_order, bar_open, bar_close, kitchen_open, kitchen_close)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (day) DO NOTHING`,
      [h.day, h.day_order, h.bar_open, h.bar_close, h.kitchen_open, h.kitchen_close]
    );
  }
  console.log('✓ Seeded 7 days of opening hours');

  // ── Seed Site Settings ───────────────────────────────────
  const settings = [
    { key: 'gift_cards_enabled', value: 'false', label: 'Gift Cards Page Enabled' },
  ];

  for (const s of settings) {
    await db.run(
      `INSERT INTO site_settings (key, value, label) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
      [s.key, s.value, s.label]
    );
  }
  console.log('✓ Seeded site settings');

  console.log('\nDone! Database ready.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
