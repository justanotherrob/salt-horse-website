# Salt Horse — Site Specification

A single-page website for Salt Horse, a craft beer bar and burger restaurant in Edinburgh's Old Town, operating since 2016.

---

## Overview

The site is a single scrolling page with anchor sections: Hero, Stats, Drink, Food Banner, Food, Interior Banner, Bookings, Location & Hours, and Footer. There is also a standalone quiz page at `/butterbeer`.

The design is dark, minimal, and typographic — deep navy backgrounds with warm cream text and amber accents. It feels like a well-designed bar menu.

---

## Design System

### Colour Palette

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#182241` | Primary background (deep navy) |
| `--bg-light` | `#1e2d54` | Section alternate (food section, admin panels) |
| `--bg-dark` | `#111a33` | Darker sections (stats, location, mobile menu) |
| `--cream` | `#FFF6DA` | Primary text, headings, links |
| `--cream-dim` | `rgba(255, 246, 218, 0.6)` | Body text, secondary text |
| `--cream-faint` | `rgba(255, 246, 218, 0.12)` | Borders, dividers, subtle backgrounds |
| `--amber` | `#D4943A` | Accent — section labels, CTAs, hover states |
| `--amber-glow` | `rgba(212, 148, 58, 0.15)` | Amber tinted backgrounds (notices, active states) |

### Typography

Two Google Fonts loaded via `fonts.googleapis.com`:

- **Space Grotesk** (weights: 400, 500, 600, 700) — Primary typeface for headings, body text, buttons
- **Space Mono** (weights: 400, 700) — Monospace accent for labels, nav links, small caps text, hours

General rules:
- Body: `font-family: 'Space Grotesk', -apple-system, sans-serif`
- `line-height: 1.6` on body
- Labels use Space Mono at `0.65–0.75rem`, `letter-spacing: 0.15–0.3em`, `text-transform: uppercase`
- Section titles: `font-size: clamp(2rem, 5vw, 3.2rem)`, `font-weight: 700`, `letter-spacing: -0.02em`, `line-height: 1.1`
- Body text: `1.05rem`, `line-height: 1.7`, colour `--cream-dim`, `max-width: 600px`

### Spacing

- Sections: `padding: 6rem 2rem` (desktop), `4rem 1.5rem` (mobile)
- `.section-inner`: `max-width: 1100px`, `margin: 0 auto`
- Content grids use `gap: 4rem` (desktop), `2.5rem` (mobile, single column)

### Buttons

Three button styles, all using Space Mono monospace at `0.7rem`, uppercase, with `letter-spacing: 0.15em`:

- `.btn` — Ghost button: transparent with cream border, fills cream on hover
- `.btn-fill` — Filled button: cream background, becomes ghost on hover
- `.btn-amber` — Amber ghost: amber border + text, fills amber on hover

All use `padding: 0.85rem 2rem`, `border: 1px solid`, `transition: all 0.3s`.

---

## Navigation

Fixed top bar (`position: fixed`, `z-index: 100`). Transparent by default, gains a blurred navy background on scroll (`background: rgba(24, 34, 65, 0.92)`, `backdrop-filter: blur(20px)`, box shadow).

- Left: Logo image (36px height)
- Centre: Horizontal link list — Space Mono, `0.75rem`, uppercase, `letter-spacing: 0.15em`, `--cream-dim` colour. Hover: `--cream` with a 1px amber underline that animates width from 0 to 100%.
- Right: "Reserve" CTA button (ghost style with cream border, fills cream on hover)
- Hamburger: Hidden on desktop, visible below 900px. Three 24×2px cream bars that animate into an X when active.

### Mobile Menu

Below 900px, nav links become a slide-in panel from the right: `width: 75%`, `max-width: 320px`, `height: 100vh`, `background: var(--bg-dark)`, vertical stack with `gap: 1.5rem`.

### Nav Links

- Drink (anchors to `#drink`)
- Food (anchors to `#food`)
- Book (anchors to `#book`)
- Find Us (anchors to `#location`)
- Reserve (CTA button, opens external booking URL in new tab)

---

## Page Sections

### 1. Hero (Full Viewport)

Full-screen section (`height: 100vh`, `min-height: 600px`), vertically and horizontally centred.

- **Background**: Full-bleed photo (`outsidebar.jpeg`) with `filter: brightness(0.3) saturate(0.7)`, slightly scaled up (`transform: scale(1.05)`)
- **Logo**: Centred, `width: min(400px, 70vw)`, fades up on load (`animation: fadeUp 1s ease-out`)
- **Tagline**: Space Mono, `clamp(0.7rem, 1.5vw, 0.9rem)`, uppercase, `letter-spacing: 0.3em`, `--cream-dim`. Fades up with 0.2s delay.
- **Scroll indicator**: "Explore" text + a 1px × 40px cream line that pulses opacity. Links to `#drink`.

### 2. Stats Row

`background: var(--bg-dark)`, `padding: 4rem 2rem`.

Three-column grid (`max-width: 900px`), centred text. Each stat:
- Number: `clamp(2.5rem, 6vw, 4rem)`, weight 700, `--cream`
- Label: Space Mono, `0.7rem`, uppercase, `--cream-dim`

On mobile (below 900px): single column.

### 3. Drink Section

`background: var(--bg)`.

Two-column grid layout (`1fr 1fr`, `gap: 4rem`):
- **Left**: Image (`fridges.jpg`) in a container with `border-radius: 4px`, `overflow: hidden`. Image is `height: 500px`, `object-fit: cover`, scales to 1.03 on hover.
- **Right**: Section label (amber, uppercase mono) → Title (large, bold) → Description paragraph → Feature list

Feature list: vertical stack with `gap: 1rem`. Each item has a `padding-left: 1.5rem` and an 8×1px amber dash as `::before` pseudo-element.

On mobile: single column.

### 4. Food Banner

`height: 45vh`, `min-height: 300px`. Full-width image (`IMG_3780.jpg`) with `filter: brightness(0.6) saturate(0.8)`. Centred overlay text: `clamp(1.8rem, 4vw, 3rem)`, weight 700.

### 5. Food Section

`background: var(--bg-light)`.

Two-column grid:
- **Left**: Photo gallery — 2×2 grid with `gap: 0.75rem`. First image spans full width (`grid-column: 1 / -1`, `height: 260px`), remaining images are `height: 220px`. All `object-fit: cover`, scale on hover.
- **Right**: Section label → Title → Two description paragraphs → Two buttons side by side (Current Menu as `.btn`, Allergens as `.btn-amber`)

On mobile: single column, text above gallery (`order: -1` on `.food-text`).

### 6. Interior Banner

Same style as food banner but no text overlay. Uses `barnight2400x800.jpg`.

### 7. Book Section

`background: var(--bg)`, `text-align: center`.

Centred section label → Title → Description paragraph (max-width 650px) → "Book a Table" button (`.btn-fill`).

Below that, a two-column card grid (`max-width: 700px`, `min-width: 250px` per card). Cards: `padding: 1.5rem`, `background: var(--cream-faint)`, `border-radius: 4px`.

### 8. Location & Hours

`background: var(--bg-dark)`.

Three-column grid (`1fr 1fr 1fr`, `gap: 3rem`):

**Column 1 — Address:**
- Block title: Space Mono, `0.7rem`, uppercase, amber, with a bottom border
- "Salt Horse" in cream, bold, `1.1rem`
- Address lines in `--cream-dim`
- Phone number
- Arrow-prefixed links (`→ Google Maps`, `→ +44 7400 653295`) in amber, hover to cream
- Notice box: `background: var(--amber-glow)`, `border-left: 2px solid var(--amber)`, `0.85rem`

**Column 2 — Bar Hours:**
- Table with day names on the left (`--cream-dim`) and times on the right (Space Mono, `--cream`)
- Rows separated by `1px solid var(--cream-faint)` borders

**Column 3 — Kitchen Hours:**
- Same table format
- Note below: `0.8rem`, `--cream-dim`

On mobile: single column.

---

## Animations

### Fade Up (page load)

```css
@keyframes fadeUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
}
```

Used on hero elements with staggered delays (0s, 0.2s, 0.4s).

### Scroll Reveal

Elements with class `.reveal` start invisible (`opacity: 0`, `transform: translateY(40px)`) and transition in when they enter the viewport (IntersectionObserver, threshold 0.15). Applied to stats grid, drink layout, food layout, book section, and location section.

### Scroll Line Pulse

The hero scroll indicator line pulses its opacity between 0.4 and 1.

---

## Footer

`background: var(--bg)`, `padding: 4rem 2rem 2rem`, centred.

- Logo (60px wide, `opacity: 0.5`)
- Tagline (`0.8rem`, `--cream-dim`)
- Social links: Space Mono, `0.7rem`, uppercase, `--cream-dim`, hover `--amber`. Two links side by side with `gap: 2rem`.
- Bottom bar: `border-top: 1px solid var(--cream-faint)`, copyright text in very faint cream (`rgba(255, 246, 218, 0.3)`)

---

## The Sorting Tap (Butterbeer Quiz) — `/butterbeer`

A standalone page with its own inline styles (not using the main stylesheet). Same design tokens as the main site.

### Purpose

A playful beer quiz that catches tourists searching for butterbeer and redirects them into craft beer culture. SEO-targeted at "butterbeer Edinburgh".

### Layout

Fixed full-bleed background image (`candleswindow.jpg`, `brightness(0.2) saturate(0.5)`) with a radial gradient overlay fading to `--bg`. Single centred column (`max-width: 680px`).

### Flow

1. **Intro Screen**: "We Do Not Sell Butterbeer." headline (amber on the word "Butterbeer"), subtitle, description, and "Approach the Sorting Tap" amber ghost button.
2. **Quiz**: 5 questions, each with 4–5 options. A 2px amber progress bar at the top. Questions fade in with animation. Options are full-width buttons with `--cream-faint` background, amber border + amber glow on hover, amber fill when selected. After selection, a 400ms delay before advancing.
3. **Sorting Animation**: A beer emoji wobbles while beer names flash through rapidly (150ms intervals, 20 flashes). "The Sorting Tap is Deciding..." pulses.
4. **Result**: Style name label (amber, mono) → large emoji → beer style title (large, with a glow animation) → "house" name (amber subtitle) → witty description paragraph → "Still no butterbeer though." punchline in a subtle card → "See What's on Tap" and "Book a Table" buttons → "Try Again" link.
5. **Beer List**: A long paragraph listing every beer style they sell, ending with "but no butterbeer" in bold cream.

### Scoring System

Each answer adds points to style categories (`ipa`, `stout`, `tripel`, `sour`, `helles`, `saison`, `mead`). Highest score wins. On retake, the system forces a result the user hasn't seen yet.

### Quiz Questions & Answers

**Q1: "You walk into Salt Horse. Where are you heading?"**
- Straight to the board to see what's new on tap → ipa:2, sour:1
- The dark corner booth with the candles → stout:2, tripel:1
- The big table. I've got seven mates behind me. → tripel:2, saison:1
- The bar. I already know what I want. → helles:2, saison:1
- I was looking for a castle, actually → mead:3

**Q2: "You're ordering food. What is it?"**
- Nashville Hot with extra hot sauce → ipa:2, saison:1
- The Bowhouse. Classic, no extras needed. → stout:2, tripel:1
- Italian Piccante. Nduja, crispy onions, the works. → tripel:2, helles:1
- Cauli Bombs. I like to keep things interesting. → sour:2, saison:1
- Do you do fish and chips? → mead:3

**Q3: "It's raining in Edinburgh. Obviously. What are you doing?"**
- Walking up Arthur's Seat anyway → sour:2, saison:1
- Ordering another round. Not going back out there. → stout:2, ipa:1
- Ducking into a bookshop on Victoria Street → tripel:1, helles:2
- I didn't notice. I'm already at the bar. → ipa:2, helles:1
- Rain? I sailed here from Norway in worse. → mead:3

**Q4: "Pick the sauce."**
- Nashville Hot. Bold and spicy. → ipa:2, sour:1
- Black Garlic Mayo. Rich, mellow, umami. → stout:2, tripel:1
- Salt Horse BBQ. Smoky with a touch of gochujang. → saison:2, sour:1
- Salt Horse Ranch. Cool, creamy, sorted. → helles:2, ipa:1
- Honey. Just honey. → mead:3

**Q5: "The bartender says 'trust me' and reaches for a glass. What are you hoping for?"**
- Something hazy, tropical, and absolutely loaded → ipa:2, tripel:1
- Something dark and heavy I can sit with all night → stout:2, saison:1
- Something weird from the fridge I've never heard of → sour:2, tripel:1
- Something clean, cold, and perfect → helles:2, saison:1
- A drinking horn → mead:3

### Results

**Hazy IPA** — 🌊 "The Permanent Haze"
You don't want beer. You want a pint of liquidised mango with a grudge. Dank, hazy, so thick it leaves a ring on the glass like a bathtub. Otherworld, Verdant, DEYA, Garage Beer. We've got about forty cans in the fridge and you will try to drink all of them. You told yourself you'd just have one. You've never just had one. See you tomorrow.

**Imperial Stout** — 🌑 "The Midnight Society"
You want a beer darker than a Scottish winter and thicker than your accent after three of them. Tonka beans, vanilla, cocoa, whisky barrels. If it spent time in a cask, you're interested. Lervig 3 Bean Stout, Otherworld Cerberus aged in Caol Ila casks, The Kernel Porter on tap. You're not leaving that corner booth until closing time and honestly, we respect it.

**Belgian Tripel** — ⚗️ "The 9% Club"
Look at you. Golden, complex, 9% and you're acting like it's water. Westmalle, Duvel, La Chouffe. You say "it's actually a Belgian tradition" while your mates slide off their chairs. We stock St Bernardus Abt 12 and D'Orval in sharing bottles. You won't share them. You never do. Someone's getting a taxi.

**Sour / Lambic** — 🍋 "The Acquired Taste"
You enjoy watching people try your beer and immediately regret it. Cantillon, 3 Fonteinen, Holy Goat. Half the fridge is basically yours at this point. You once described a lambic as "barnyard-forward" and meant it as a compliment. You've spent more on a single bottle of geuze than most people spend on a round. No regrets. You'd do it again. You will do it again.

**German Helles** — ✨ "The Quiet Genius"
You walked into a bar with 14 taps and 200 bottles and ordered the most normal thing on the menu. And you know what? You're having a better time than everyone else. While the IPA lot are comparing tasting notes you didn't ask for, you're three Augustiners deep and absolutely vibing. Rothaus, Tegernseer, perfection in a glass. You don't need to explain yourself. The lager speaks.

**Mead** — ⚔️ "The Wrong Century"
Mate. We're a craft beer bar on the Royal Mile, not a longship. We respect the energy. You came here looking for butterbeer and somehow ended up even further back in history. We do technically sell mead sometimes, but only when we can find one that doesn't taste like someone dissolved a Werther's Original in white wine. Check back in 800 years. Or next Tuesday. Honestly it varies.

**Farmhouse Saison** — 🌾 "The Tote Bag"
Oh you're THAT person. You ordered the Brasserie Dupont while everyone else was still reading the menu. Peppery, bone-dry, a bit funky. Like you, probably. You've described Taras Boulba as "the perfect table beer" to someone who absolutely didn't ask. You own a tote bag from a brewery that closed down. We love you. You're our favourite customer. Please stop talking about natural wine.

### Sorting Animation Beer Names

Otherworld Barghest, Lervig 3 Bean Stout, Cantillon Geuze, Augustiner Hell, Dupont Saison, Westmalle Tripel, The Kernel Porter, Verdant Lightbulb, Holy Goat Thundercurrent, 3 Fonteinen Oude Geuze, DEYA Steady Rolling Man, Schlenkerla Rauchbier, Boon Kriek, Garage Beer Soup, Rothaus Tannenzäpfle, St Bernardus Abt 12, Duvel, Timmermans Kriek, Sierra Nevada Celebration, Viking Blood Mead

### Full Beer List (shown after result)

Helles lagers, export lagers, Czech helless, German-style helless, kellerbiers, doppelbocks, dunkels, smoked Märzens, rauchbiers, hefeweizens, weissbiers, pale ales, Bretted pales, historic pales, tropical pales, Italian pales, extra hoppy ales, session IPAs, West Coast IPAs, hazy IPAs, New England IPAs, double IPAs, New Zealand IPAs, experimental hop IPAs, Belgian blondes, dubbels, tripels, Belgian quads, Trappist ales, wee heavies, saisons, barrel-aged saisons, farmhouse ales, London porters, nitro porters, Baltic porters, milk stouts, imperial stouts, coffee imperial stouts, whisky barrel-aged imperial stouts, barleywines, Oude Geuzes, Oude Geuze cuvées, lambic geuzes, cherry lambics, raspberry lambics, peach & cardamom lambics, cherry & black pepper lambics, strawberry & thyme lambics, Flanders reds, dry-hopped sours, mixed-fermentation sours, mango gose, key lime pie sours, barrel-aged wild ales, lemon radlers, watermelon & mint radlers, fruit ciders, rosé ciders, elderflower ciders, perries, dry-hopped sake, a generous selection of alcohol-free options, sharers up to six litres, and other things you would expect, **but no butterbeer.**

---

## English Copy

### Navigation

- Drink
- Food
- Book
- Find Us
- Reserve

### Hero

- Tagline: "Craft Beer & Burgers in Edinburgh's Old Town" (editable via CMS)
- Scroll CTA: "Explore"

### Stats Row

- 14 → "Rotating Taps"
- 200+ → "Cans & Bottles"
- 9 → "Years Pouring"

(Numbers are editable via CMS.)

### Drink Section

- Label: "What We Pour"
- Title: "Just the Good Stuff."
- Description: "We carry a carefully curated and rotating selection of craft beer with fourteen lines on draught and over 200 in cans and bottles. Crack one open here or haul it home. Your call."
- Feature 1: "14 rotating draught lines — always something new"
- Feature 2: "Around 200 cans and bottles from the UK and beyond"
- Feature 3: "Always a good selection of alcohol-free and gluten-free beers"
- Feature 4: "A small, well-formed selection of wine and spirits"
- Feature 5: "Take away available from the bottle shop"

### Food Banner

- "Burgers That Don't Mess About."

### Food Section

- Label: "What We Serve"
- Title: "Smashed. Gone in Minutes."
- Description: "Burgers, wings, chips. That's the focus. The menu's small but tight — dry-aged beef, fried chicken sandwiches, proper chips hand cut and cooked twice. A few things for sharing. A few for soaking up the next beer. Vegan options that hold their own."
- Description 2: "Freshly made. No shortcuts."
- Button 1: "Current Menu" (links to external menu URL)
- Button 2: "Allergens" (links to external allergens URL)

### Book Section

- Label: "Reserve a Table"
- Title: "Bookings"
- Description: "Booking is optional — we always hold half the space for walk-ins. But if you want to guarantee a spot, book below."
- Button: "Book a Table" (links to external booking URL)
- Card 1 title: "Groups over 6?"
- Card 1 text: "Call us on +44 7400 653295. We can't assure multiple booked tables will be next to each other — contact us and we'll sort it."
- Card 2 title: "Good to Know"
- Card 2 text: "Tables are reserved for 10 minutes — give us a call if you're running late. Garden seating is first-come, first-served and cannot be reserved."

### Location & Hours

- Label: "Find Us"
- Title: "Location & Hours"
- Address column title: "Where We Are"
- Bar hours column title: "Bar Hours"
- Kitchen hours column title: "Kitchen Hours"
- Address: Salt Horse, 57-61 Blackfriars St, Edinburgh, EH1 1NB
- Phone: +44 7400 653295
- Links: "Google Maps", phone number
- Notice: "We are an 18+ venue."
- Kitchen note: "Walk-in only after the kitchen closes."

### Footer

- Tagline: "Craft Beer & Burgers in Edinburgh's Old Town since 2016."
- Social links: Instagram (https://www.instagram.com/salthorsebar/), Untappd (https://untappd.com/v/salt-horse/4673421)
- Copyright: © Salt Horse. 57-61 Blackfriars St, Edinburgh EH1 1NB.

### Day Names

Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday

---

## Images Required

### Photos (in `/public/images/`)

| Filename | Usage | Description |
|---|---|---|
| `outsidebar.jpeg` | Hero background | Exterior of Salt Horse at night |
| `fridges.jpg` | Drink section | Beer fridges stocked with craft cans and bottles |
| `IMG_3780.jpg` | Food banner | Spread of Salt Horse burgers and beer |
| `IMG_3692.jpg` | Food gallery (top, full-width) | Smash burger close-up |
| `IMG_3721.jpg` | Food gallery (bottom-left) | Fried chicken burger and beer |
| `IMG_3799.jpg` | Food gallery (bottom-right) | Loaded chips |
| `barnight2400x800.jpg` | Interior banner | Salt Horse bar at night |
| `candleswindow.jpg` | Butterbeer quiz background | Candles in window |
| `favicon.ico` | Browser tab icon | Salt Horse favicon |

### Logos (in `/public/logos/`)

| Filename | Usage |
|---|---|
| `salthorse_lesstext_logo_FFF6DA_transparent.png` | Hero (main logo with some text) |
| `salthorse_notext_logo_FFF6DA_transparent.png` | Nav bar, footer (icon only) |
| `salthorse_lesstext_logo_black_transparent.png` | Available for light backgrounds |
| `salthorse_lesstext_logo_white_transparent.png` | Available for dark backgrounds |
| `salthorse_notext_logo_black_transparent.png` | Available for light backgrounds |
| `salthorse_notext_logo_white_transparent.png` | Available for dark backgrounds |

---

## Meta / SEO

### Main Page

- Title: "Salt Horse — Craft Beer & Burgers, Edinburgh"
- Description: editable via CMS
- OG Title: "Salt Horse — Craft Beer & Burgers, Edinburgh"
- OG Description: "14 rotating draught lines. 200+ cans and bottles. Smash burgers. Edinburgh Old Town."
- OG Type: website

### Butterbeer Page

- Title: "WE DO NOT SELL BUTTERBEER — Salt Horse"
- Description: "Salt Horse does not sell butterbeer. But our Sorting Tap can find your perfect craft beer. Take the quiz."
- OG Title: "WE DO NOT SELL BUTTERBEER — Salt Horse"
- OG Description: "No butterbeer here. But the Sorting Tap knows what you should be drinking instead."
- OG URL: https://www.salthorse.beer/butterbeer
- OG Site Name: Salt Horse

---

## Responsive Breakpoints

| Breakpoint | Changes |
|---|---|
| Below 900px | Hamburger menu appears, nav links become slide-in panel. All two/three-column grids collapse to single column. Stats grid stacks. Section padding reduces. |
| Below 600px | Food gallery becomes single column (all images same height). Book details stack to single column. |
