#!/usr/bin/env python3
"""
Pala Pizza - Full Site Scraper
================================
Scrapes all pages of palapizza.co.uk, downloads images,
and extracts content + external links for site rebuild.

Usage:
    pip install requests beautifulsoup4
    python scrape_palapizza.py

Output:
    ./palapizza_scraped/
        images/          - All downloaded images
        content/         - Page content as JSON files
        site_data.json   - Complete structured data
        image_map.json   - Maps original URLs to local filenames
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import json
import os
import re
import hashlib
import time
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────
BASE_URL = "https://www.palapizza.co.uk"
OUTPUT_DIR = Path("./palapizza_scraped")
IMAGES_DIR = OUTPUT_DIR / "images"
CONTENT_DIR = OUTPUT_DIR / "content"

# Known pages (two HTML pages)
PAGES = [
    "/",
    "/menu",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}


# ── Setup ──────────────────────────────────────────────────────
def setup_dirs():
    """Create output directories."""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR.resolve()}")


# ── Page Discovery ─────────────────────────────────────────────
def discover_pages(session):
    """
    Crawl the homepage to find all internal links,
    in case there are pages beyond the known list.
    """
    discovered = set(PAGES)
    try:
        resp = session.get(BASE_URL, timeout=30)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                full_url = urljoin(BASE_URL, href)
                parsed = urlparse(full_url)
                # Only keep internal links
                if parsed.netloc in ("www.palapizza.co.uk", "palapizza.co.uk", ""):
                    path = parsed.path.rstrip("/") or "/"
                    # Skip anchors, mailto, tel, javascript
                    if not any(path.startswith(x) for x in ["mailto:", "tel:", "javascript:"]):
                        if not any(path.endswith(ext) for ext in [".pdf", ".jpg", ".png", ".gif"]):
                            discovered.add(path)
    except Exception as e:
        print(f"  ⚠ Discovery error: {e}")

    return sorted(discovered)


# ── Image Handling ─────────────────────────────────────────────
def extract_image_urls(soup, page_url):
    """Extract all image URLs from a page."""
    image_urls = set()

    # <img> tags - src and data-src (lazy loaded)
    for img in soup.find_all("img"):
        for attr in ["src", "data-src", "data-image", "data-lazy-src", "data-original"]:
            url = img.get(attr)
            if url and not url.startswith("data:"):
                image_urls.add(urljoin(page_url, url))

    # srcset attributes
    for img in soup.find_all(["img", "source"]):
        srcset = img.get("srcset", "")
        for part in srcset.split(","):
            url = part.strip().split(" ")[0]
            if url and not url.startswith("data:"):
                image_urls.add(urljoin(page_url, url))

    # Background images in style attributes
    for el in soup.find_all(style=True):
        urls = re.findall(r'url\(["\']?(.*?)["\']?\)', el["style"])
        for url in urls:
            if not url.startswith("data:"):
                image_urls.add(urljoin(page_url, url))

    # <source> tags (picture elements)
    for source in soup.find_all("source"):
        src = source.get("src")
        if src and not src.startswith("data:"):
            image_urls.add(urljoin(page_url, src))

    # CSS background images in <style> tags
    for style_tag in soup.find_all("style"):
        if style_tag.string:
            urls = re.findall(r'url\(["\']?(.*?)["\']?\)', style_tag.string)
            for url in urls:
                if not url.startswith("data:"):
                    image_urls.add(urljoin(page_url, url))

    # Search raw HTML for any image URLs we might have missed
    raw_html = str(soup)
    # Common CDN patterns
    cdn_patterns = [
        r'https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|gif|svg|webp|avif)(?:\?[^\s"\'<>]*)?',
    ]
    for pattern in cdn_patterns:
        for url in re.findall(pattern, raw_html, re.IGNORECASE):
            image_urls.add(url)

    return image_urls


def get_clean_filename(url):
    """Generate a clean filename from an image URL."""
    parsed = urlparse(url)
    path = parsed.path

    # Get the filename from path
    filename = os.path.basename(path)

    # If no good filename, generate from hash
    if not filename or len(filename) < 3:
        url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
        ext = ".jpg"
        for e in [".png", ".gif", ".svg", ".webp", ".avif"]:
            if e in url.lower():
                ext = e
                break
        filename = f"image_{url_hash}{ext}"

    # Clean the filename
    filename = re.sub(r'[^\w\-_.]', '_', filename)

    # Ensure it has an extension
    if "." not in filename:
        filename += ".jpg"

    return filename


def download_image(url, session):
    """Download a single image. Returns (url, local_path, success)."""
    filename = get_clean_filename(url)
    local_path = IMAGES_DIR / filename

    # Skip if already downloaded
    if local_path.exists():
        return url, str(local_path), True

    try:
        resp = session.get(url, timeout=30, stream=True)
        if resp.status_code == 200:
            content_type = resp.headers.get("content-type", "")
            if "image" in content_type or "svg" in content_type or resp.status_code == 200:
                with open(local_path, "wb") as f:
                    for chunk in resp.iter_content(8192):
                        f.write(chunk)
                size_kb = local_path.stat().st_size / 1024
                print(f"  ✓ {filename} ({size_kb:.1f} KB)")
                return url, str(local_path), True
        print(f"  ✗ {filename} (HTTP {resp.status_code})")
        return url, None, False
    except Exception as e:
        print(f"  ✗ {filename} ({e})")
        return url, None, False


# ── Content Extraction ─────────────────────────────────────────
def extract_page_content(soup, page_url):
    """Extract structured content from a page."""
    content = {
        "url": page_url,
        "title": "",
        "meta_description": "",
        "headings": [],
        "text_blocks": [],
        "links": {"internal": [], "external": []},
        "images": [],
        "raw_html": "",
        "raw_text": "",
    }

    # Title
    title_tag = soup.find("title")
    if title_tag:
        content["title"] = title_tag.get_text(strip=True)

    # Meta description
    meta = soup.find("meta", attrs={"name": "description"})
    if meta:
        content["meta_description"] = meta.get("content", "")

    # OG tags
    og_tags = {}
    for og in soup.find_all("meta", attrs={"property": re.compile(r"^og:")}):
        og_tags[og.get("property", "")] = og.get("content", "")
    if og_tags:
        content["og_tags"] = og_tags

    # Favicon
    favicon = soup.find("link", rel=lambda x: x and "icon" in x)
    if favicon and favicon.get("href"):
        content["favicon"] = urljoin(page_url, favicon["href"])

    # Stylesheets
    stylesheets = []
    for link in soup.find_all("link", rel="stylesheet"):
        href = link.get("href")
        if href:
            stylesheets.append(urljoin(page_url, href))
    if stylesheets:
        content["stylesheets"] = stylesheets

    # Scripts
    scripts = []
    for script in soup.find_all("script", src=True):
        scripts.append(urljoin(page_url, script["src"]))
    if scripts:
        content["scripts"] = scripts

    # Headings
    for level in range(1, 7):
        for h in soup.find_all(f"h{level}"):
            text = h.get_text(strip=True)
            if text:
                content["headings"].append({"level": level, "text": text})

    # Text blocks
    main_content = soup.find("main") or soup.find("article") or soup.find(id="page") or soup.find(id="content") or soup
    for p in main_content.find_all(["p", "blockquote", "li", "span", "div"]):
        text = p.get_text(strip=True)
        if text and len(text) > 5:
            # Avoid duplicating text from child elements
            if text not in content["text_blocks"]:
                content["text_blocks"].append(text)

    # Links
    for a in soup.find_all("a", href=True):
        href = a["href"]
        link_text = a.get_text(strip=True)
        full_url = urljoin(page_url, href)

        link_data = {"text": link_text, "url": full_url, "raw_href": href}

        parsed = urlparse(full_url)
        if parsed.netloc and "palapizza.co.uk" not in parsed.netloc:
            content["links"]["external"].append(link_data)
        elif href.startswith("/") or "palapizza.co.uk" in href:
            content["links"]["internal"].append(link_data)

    # Images with alt text
    for img in soup.find_all("img"):
        img_data = {
            "src": urljoin(page_url, img.get("src", "")),
            "alt": img.get("alt", ""),
        }
        content["images"].append(img_data)

    # Store raw HTML for reference
    content["raw_html"] = str(soup)

    # Full raw text
    if main_content:
        content["raw_text"] = main_content.get_text(separator="\n", strip=True)

    return content


# ── CSS & Asset Download ───────────────────────────────────────
def download_asset(url, session, output_dir):
    """Download a CSS/JS/font asset. Returns (url, local_path, success)."""
    parsed = urlparse(url)
    filename = os.path.basename(parsed.path) or "asset"
    filename = re.sub(r'[^\w\-_.]', '_', filename)
    local_path = output_dir / filename

    if local_path.exists():
        return url, str(local_path), True

    try:
        resp = session.get(url, timeout=30)
        if resp.status_code == 200:
            with open(local_path, "wb") as f:
                f.write(resp.content)
            size_kb = len(resp.content) / 1024
            print(f"  ✓ {filename} ({size_kb:.1f} KB)")
            return url, str(local_path), True
        print(f"  ✗ {filename} (HTTP {resp.status_code})")
        return url, None, False
    except Exception as e:
        print(f"  ✗ {filename} ({e})")
        return url, None, False


# ── Main Scraper ───────────────────────────────────────────────
def scrape_site():
    """Main scraping function."""
    setup_dirs()
    session = requests.Session()
    session.headers.update(HEADERS)

    # Create assets directory for CSS/JS/fonts
    assets_dir = OUTPUT_DIR / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    all_content = {}
    all_images = set()
    all_external_links = []
    all_assets = set()
    image_map = {}
    asset_map = {}

    print("\n" + "=" * 60)
    print("  PALA PIZZA - SITE SCRAPER")
    print("=" * 60)

    # ── Phase 0: Discover Pages ────────────────────────────────
    print("\n🔍 PHASE 0: Discovering pages...\n")
    pages = discover_pages(session)
    print(f"  Found {len(pages)} pages: {pages}")

    # ── Phase 1: Scrape Pages ──────────────────────────────────
    print("\n📄 PHASE 1: Scraping pages...\n")

    for page_path in pages:
        page_url = f"{BASE_URL}{page_path}"
        print(f"  Fetching: {page_url}")

        try:
            resp = session.get(page_url, timeout=30)
            if resp.status_code != 200:
                print(f"    ⚠ Status {resp.status_code}, skipping")
                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract content
            content = extract_page_content(soup, page_url)
            page_name = page_path.strip("/") or "home"
            all_content[page_name] = content

            # Extract images
            page_images = extract_image_urls(soup, page_url)
            all_images.update(page_images)

            # Collect stylesheets and scripts
            if "stylesheets" in content:
                all_assets.update(content["stylesheets"])
            if "scripts" in content:
                all_assets.update(content["scripts"])

            # Collect external links
            for link in content["links"]["external"]:
                link["found_on"] = page_name
                all_external_links.append(link)

            # Save individual page content
            content_file = CONTENT_DIR / f"{page_name.replace('/', '_')}.json"
            with open(content_file, "w", encoding="utf-8") as f:
                json.dump(content, f, indent=2, ensure_ascii=False)

            # Also save the raw HTML file
            html_file = CONTENT_DIR / f"{page_name.replace('/', '_')}.html"
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(resp.text)

            print(f"    ✓ {len(content['text_blocks'])} text blocks, "
                  f"{len(page_images)} images, "
                  f"{len(content['links']['external'])} external links")

            time.sleep(1)  # Be polite

        except Exception as e:
            print(f"    ✗ Error: {e}")

    # ── Phase 2: Download Images ───────────────────────────────
    # Filter to likely real image URLs
    image_urls = set()
    for url in all_images:
        parsed = urlparse(url)
        if any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico']):
            image_urls.add(url)
        elif parsed.netloc and "palapizza" in parsed.netloc:
            image_urls.add(url)

    print(f"\n🖼  PHASE 2: Downloading {len(image_urls)} images...\n")

    success_count = 0
    fail_count = 0
    for url in sorted(image_urls):
        url_clean, local_path, success = download_image(url, session)
        if success:
            image_map[url_clean] = local_path
            success_count += 1
        else:
            fail_count += 1
        time.sleep(0.3)

    # ── Phase 2b: Download CSS/JS Assets ───────────────────────
    print(f"\n📦 PHASE 2b: Downloading {len(all_assets)} assets (CSS/JS)...\n")

    for url in sorted(all_assets):
        url_clean, local_path, success = download_asset(url, session, assets_dir)
        if success:
            asset_map[url_clean] = local_path
        time.sleep(0.3)

    # ── Phase 3: Save Master Data ──────────────────────────────
    print(f"\n💾 PHASE 3: Saving master data...\n")

    # Deduplicate external links
    seen_links = set()
    unique_external_links = []
    for link in all_external_links:
        key = link["url"]
        if key not in seen_links:
            seen_links.add(key)
            unique_external_links.append(link)

    master_data = {
        "scraped_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "base_url": BASE_URL,
        "pages_scraped": list(all_content.keys()),
        "content": all_content,
        "external_links": unique_external_links,
        "image_count": len(image_map),
        "asset_count": len(asset_map),
        "images": list(image_map.keys()),
    }

    with open(OUTPUT_DIR / "site_data.json", "w", encoding="utf-8") as f:
        json.dump(master_data, f, indent=2, ensure_ascii=False)

    with open(OUTPUT_DIR / "image_map.json", "w", encoding="utf-8") as f:
        json.dump(image_map, f, indent=2, ensure_ascii=False)

    with open(OUTPUT_DIR / "asset_map.json", "w", encoding="utf-8") as f:
        json.dump(asset_map, f, indent=2, ensure_ascii=False)

    # Save a human-readable summary
    with open(OUTPUT_DIR / "external_links.txt", "w") as f:
        f.write("PALA PIZZA - External Links\n")
        f.write("=" * 50 + "\n\n")
        for link in unique_external_links:
            f.write(f"Text: {link['text']}\n")
            f.write(f"URL:  {link['url']}\n")
            f.write(f"Page: {link['found_on']}\n")
            f.write("-" * 40 + "\n")

    # ── Summary ────────────────────────────────────────────────
    print("=" * 60)
    print("  SCRAPE COMPLETE")
    print("=" * 60)
    print(f"\n  Pages scraped:     {len(all_content)}")
    print(f"  Images downloaded: {success_count} (failed: {fail_count})")
    print(f"  Assets downloaded: {len(asset_map)}")
    print(f"  External links:   {len(unique_external_links)}")
    print(f"\n  Output: {OUTPUT_DIR.resolve()}/")
    print(f"    ├── site_data.json       (all content)")
    print(f"    ├── image_map.json       (URL → local file)")
    print(f"    ├── asset_map.json       (CSS/JS → local file)")
    print(f"    ├── external_links.txt   (human-readable)")
    print(f"    ├── content/             (per-page JSON + raw HTML)")
    print(f"    ├── images/              (downloaded images)")
    print(f"    └── assets/              (CSS/JS files)")
    print()


if __name__ == "__main__":
    scrape_site()
