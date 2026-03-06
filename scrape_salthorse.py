#!/usr/bin/env python3
"""
Salt Horse Beer - Full Site Scraper
====================================
Scrapes all pages of salthorse.beer, downloads images,
and extracts content + external links for site rebuild.

Usage:
    pip install requests beautifulsoup4
    python scrape_salthorse.py

Output:
    ./salthorse_scraped/
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
BASE_URL = "https://www.salthorse.beer"
OUTPUT_DIR = Path("./salthorse_scraped")
IMAGES_DIR = OUTPUT_DIR / "images"
CONTENT_DIR = OUTPUT_DIR / "content"

# Known pages from sitemap / search indexing
PAGES = [
    "/",
    "/drink",
    "/food",
    "/book",
    "/opening-times-and-location",
    "/game",
    "/gift-cards",
    "/butterbeer",
    "/reviews",
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


# ── Image Handling ─────────────────────────────────────────────
def extract_image_urls(soup, page_url):
    """Extract all image URLs from a page, including Squarespace CDN images."""
    image_urls = set()

    # <img> tags - src and data-src (lazy loaded)
    for img in soup.find_all("img"):
        for attr in ["src", "data-src", "data-image", "data-lazy-src"]:
            url = img.get(attr)
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
        srcset = source.get("srcset", "")
        for part in srcset.split(","):
            url = part.strip().split(" ")[0]
            if url and not url.startswith("data:"):
                image_urls.add(urljoin(page_url, url))

    # Squarespace-specific: data-image-id, data-src attributes on divs
    for el in soup.find_all(attrs={"data-image-id": True}):
        img_id = el.get("data-image-id")
        if img_id:
            # Try to find the actual URL in nested img
            nested_img = el.find("img")
            if nested_img and nested_img.get("src"):
                image_urls.add(urljoin(page_url, nested_img["src"]))

    # Squarespace image blocks
    for el in soup.find_all(class_=re.compile(r"sqs-image|image-block|thumb-image")):
        data_src = el.get("data-src") or el.get("data-image")
        if data_src:
            image_urls.add(urljoin(page_url, data_src))

    # Search for any squarespace-cdn.com URLs in the raw HTML
    raw_html = str(soup)
    cdn_urls = re.findall(r'https?://images\.squarespace-cdn\.com/content/v1/[^\s"\'<>]+', raw_html)
    for url in cdn_urls:
        # Clean up any trailing format params but keep the base URL
        clean = url.split("?")[0] if "?" in url else url
        image_urls.add(url)  # Keep full URL with params for quality
        image_urls.add(clean)  # Also keep clean version

    # Also look for static1.squarespace.com URLs
    static_urls = re.findall(r'https?://static1\.squarespace\.com/static/[^\s"\'<>]+', raw_html)
    for url in static_urls:
        if any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif']):
            image_urls.add(url)

    return image_urls


def get_clean_filename(url):
    """Generate a clean filename from an image URL."""
    parsed = urlparse(url)
    path = parsed.path

    # Get the filename from path
    filename = os.path.basename(path)

    # If no good filename, generate from hash
    if not filename or filename == "v1" or len(filename) < 3:
        url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
        # Try to guess extension from URL
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
        og_tags[og["property"]] = og.get("content", "")
    if og_tags:
        content["og_tags"] = og_tags

    # Headings
    for level in range(1, 7):
        for h in soup.find_all(f"h{level}"):
            text = h.get_text(strip=True)
            if text:
                content["headings"].append({"level": level, "text": text})

    # Text blocks - paragraphs and divs with substantial text
    main_content = soup.find("main") or soup.find("article") or soup.find(id="page") or soup
    for p in main_content.find_all(["p", "blockquote", "li"]):
        text = p.get_text(strip=True)
        if text and len(text) > 5:
            content["text_blocks"].append(text)

    # Also get text from Squarespace content blocks
    for block in main_content.find_all(class_=re.compile(r"sqs-block-content|html-block|markdown-block")):
        text = block.get_text(strip=True)
        if text and len(text) > 5 and text not in content["text_blocks"]:
            content["text_blocks"].append(text)

    # Links
    for a in soup.find_all("a", href=True):
        href = a["href"]
        link_text = a.get_text(strip=True)
        full_url = urljoin(page_url, href)

        link_data = {"text": link_text, "url": full_url, "raw_href": href}

        parsed = urlparse(full_url)
        if parsed.netloc and "salthorse.beer" not in parsed.netloc:
            content["links"]["external"].append(link_data)
        elif href.startswith("/") or "salthorse.beer" in href:
            content["links"]["internal"].append(link_data)

    # Full raw text
    if main_content:
        content["raw_text"] = main_content.get_text(separator="\n", strip=True)

    return content


# ── Squarespace-Specific Extras ────────────────────────────────
def try_squarespace_json(session, page_path):
    """
    Squarespace sites often expose JSON at ?format=json.
    This can give us structured data including image assets.
    """
    url = f"{BASE_URL}{page_path}?format=json"
    try:
        resp = session.get(url, timeout=15)
        if resp.status_code == 200:
            try:
                return resp.json()
            except json.JSONDecodeError:
                pass
    except Exception:
        pass
    return None


def extract_squarespace_images_from_json(data, images=None):
    """Recursively extract image URLs from Squarespace JSON data."""
    if images is None:
        images = set()

    if isinstance(data, dict):
        for key, value in data.items():
            if key in ("assetUrl", "imageUrl", "originalSize", "mediaUrl", "url") and isinstance(value, str):
                if any(ext in value.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']):
                    images.add(value)
                elif "squarespace-cdn.com" in value or "squarespace.com" in value:
                    images.add(value)
            else:
                extract_squarespace_images_from_json(value, images)
    elif isinstance(data, list):
        for item in data:
            extract_squarespace_images_from_json(item, images)

    return images


# ── Main Scraper ───────────────────────────────────────────────
def scrape_site():
    """Main scraping function."""
    setup_dirs()
    session = requests.Session()
    session.headers.update(HEADERS)

    all_content = {}
    all_images = set()
    all_external_links = []
    image_map = {}

    print("\n" + "=" * 60)
    print("  SALT HORSE BEER - SITE SCRAPER")
    print("=" * 60)

    # ── Phase 1: Scrape Pages ──────────────────────────────────
    print("\n📄 PHASE 1: Scraping pages...\n")

    for page_path in PAGES:
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

            # Collect external links
            for link in content["links"]["external"]:
                link["found_on"] = page_name
                all_external_links.append(link)

            # Save individual page content
            content_file = CONTENT_DIR / f"{page_name.replace('/', '_')}.json"
            with open(content_file, "w", encoding="utf-8") as f:
                json.dump(content, f, indent=2, ensure_ascii=False)

            print(f"    ✓ {len(content['text_blocks'])} text blocks, "
                  f"{len(page_images)} images, "
                  f"{len(content['links']['external'])} external links")

            # Try Squarespace JSON endpoint
            sq_data = try_squarespace_json(session, page_path)
            if sq_data:
                sq_images = extract_squarespace_images_from_json(sq_data)
                all_images.update(sq_images)
                # Save raw Squarespace JSON too
                sq_file = CONTENT_DIR / f"{page_name.replace('/', '_')}_squarespace.json"
                with open(sq_file, "w", encoding="utf-8") as f:
                    json.dump(sq_data, f, indent=2, ensure_ascii=False)
                print(f"    ✓ Squarespace JSON: {len(sq_images)} additional images")

            time.sleep(1)  # Be polite

        except Exception as e:
            print(f"    ✗ Error: {e}")

    # ── Phase 2: Download Images ───────────────────────────────
    # Filter to real image URLs
    image_urls = set()
    for url in all_images:
        parsed = urlparse(url)
        if any(x in parsed.netloc for x in ["squarespace-cdn.com", "squarespace.com", "salthorse.beer"]):
            if any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico']):
                image_urls.add(url)
            elif "squarespace-cdn.com" in url:
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
        "images": list(image_map.keys()),
    }

    with open(OUTPUT_DIR / "site_data.json", "w", encoding="utf-8") as f:
        json.dump(master_data, f, indent=2, ensure_ascii=False)

    with open(OUTPUT_DIR / "image_map.json", "w", encoding="utf-8") as f:
        json.dump(image_map, f, indent=2, ensure_ascii=False)

    # Save a human-readable summary
    with open(OUTPUT_DIR / "external_links.txt", "w") as f:
        f.write("SALT HORSE BEER - External Links\n")
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
    print(f"\n  Pages scraped:    {len(all_content)}")
    print(f"  Images downloaded: {success_count} (failed: {fail_count})")
    print(f"  External links:   {len(unique_external_links)}")
    print(f"\n  Output: {OUTPUT_DIR.resolve()}/")
    print(f"    ├── site_data.json      (all content)")
    print(f"    ├── image_map.json      (URL → local file)")
    print(f"    ├── external_links.txt  (human-readable)")
    print(f"    ├── content/            (per-page JSON)")
    print(f"    └── images/             (downloaded images)")
    print()


if __name__ == "__main__":
    scrape_site()
