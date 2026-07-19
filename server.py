from flask import Flask, jsonify, send_from_directory, request
import json
import os
import sqlite3
import time
import subprocess
import io
import socket
import ipaddress
from urllib.parse import urlparse, quote
import requests
from PIL import Image, UnidentifiedImageError
import re
import xml.etree.ElementTree as ET
import defusedxml.ElementTree as SafeET

app = Flask(__name__, static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024  # 4MB hard cap on any request body

def get_version_from_git():
    try:
        # Get the most recent Git tag (e.g., v2.0.0)
        version = subprocess.check_output(["git", "describe", "--tags"]).strip().decode("utf-8")
        return version
    except Exception as e:
        print(f"Error fetching version: {e}")
        return "Unknown"

APP_VERSION = get_version_from_git()

@app.route("/version")
def get_version():
    return jsonify({"version": APP_VERSION})

SETTINGS_FILE = os.getenv("USER_SETTINGS_FILE", "/app/data/settings.json")
READ_ONLY_DB_PATH = os.getenv("NGINX_DB_PATH", "/nginx/database.sqlite")
ICONS_DIR = os.path.join(os.path.dirname(SETTINGS_FILE), "icons")

os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
os.makedirs(ICONS_DIR, exist_ok=True)

print(f"Settings File: {SETTINGS_FILE}")
print(f"Read-Only DB Path: {READ_ONLY_DB_PATH}")
print(f"Icons Dir: {ICONS_DIR}")

ALLOWED_THEMES = {"light", "dark", "midnight", "terminal"}
ALLOWED_ICON_FORMATS = {"PNG", "JPEG", "GIF", "WEBP", "BMP", "ICO"}
MAX_ICON_BYTES = 2 * 1024 * 1024  # 2MB

ALLOWED_SVG_TAGS = {
    "svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon",
    "rect", "text", "tspan", "defs", "clipPath", "mask", "symbol", "use",
    "linearGradient", "radialGradient", "stop", "title", "desc",
}
ALLOWED_SVG_ATTRS = {
    "id", "class", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
    "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "fill", "fill-rule",
    "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
    "stroke-dasharray", "stroke-opacity", "opacity", "offset", "stop-color",
    "stop-opacity", "gradientUnits", "gradientTransform", "clip-path", "mask",
    "version", "preserveAspectRatio", "font-size", "font-family", "text-anchor",
}
SVG_CURRENTCOLOR_FALLBACK = "#6b7280"  # neutral gray, legible on both light and dark card surfaces
# Presentation properties we allow through an inline style="" attribute (mirrors the
# style-able subset of ALLOWED_SVG_ATTRS, plus clip-rule which has no attribute form).
ALLOWED_SVG_STYLE_PROPS = {
    "fill", "fill-rule", "fill-opacity", "clip-rule", "stroke", "stroke-width",
    "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-opacity",
    "opacity", "stop-color", "stop-opacity", "clip-path", "mask",
    "font-size", "font-family", "text-anchor",
}

DEFAULT_SETTINGS = {
    "theme": "light",
    "hideInactive": False,
    "hideSearch": False,
    "layoutView": "list",
    "sortBy": "domain",
    "maxColumns": 3,
    "groups": {},
    "renamedGroupNames": {},
    "renamedDomainNames": {},
    "domainDescriptions": {},
    "domainIcons": {},
    "domainIconContrastBg": {}
}

cached_domains = {
    "domains": [],
    "last_updated": None
}
CACHE_EXPIRY_SECONDS = 15

def load_settings():
    """Load settings from the JSON file or initialize with defaults."""
    if not os.path.exists(SETTINGS_FILE):
        save_settings(DEFAULT_SETTINGS)
    try:
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    except json.JSONDecodeError:
        save_settings(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS

def save_settings(settings):
    """Save settings to the JSON file."""
    settings.pop("domains", None)
    settings.pop("allDomains", None)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=4)

def refresh_cached_domains():
    """Refresh the cached domains from the database."""
    if not os.path.exists(READ_ONLY_DB_PATH):
        return {"error": "Database not found"}

    try:
        with sqlite3.connect(READ_ONLY_DB_PATH) as conn:
            cursor = conn.cursor()
            query = """
                SELECT id, domain_names, forward_host, forward_port, meta, enabled 
                FROM proxy_host
                WHERE is_deleted = 0
            """
            cursor.execute(query)
            rows = cursor.fetchall()

        cached_domains["domains"] = [
            {
                "id": row[0],
                "domain_names": json.loads(row[1]),
                "forward_host": row[2],
                "forward_port": row[3],
                "nginx_online": json.loads(row[4]).get("nginx_online", False) if row[4] else False,
                "enabled": bool(row[5])
            }
            for row in rows
        ]
        cached_domains["last_updated"] = time.time()
        return cached_domains["domains"]
    except Exception as e:
        return {"error": "Failed to refresh domains", "details": str(e)}

def get_cached_domains():
    """Return cached domains, refreshing if expired."""
    if (
        not cached_domains["domains"] or
        not cached_domains["last_updated"] or
        (time.time() - cached_domains["last_updated"] > CACHE_EXPIRY_SECONDS)
    ):
        result = refresh_cached_domains()
        if isinstance(result, dict) and "error" in result:
            return result
    return cached_domains["domains"]

settings = load_settings()

@app.route("/domains")
def get_domains_endpoint():
    """Return cached domain data as a standalone endpoint."""
    cached_domains_result = get_cached_domains()
    if isinstance(cached_domains_result, dict) and "error" in cached_domains_result:
        return jsonify(cached_domains_result), 500
    return jsonify({"allDomains": cached_domains_result})

@app.route("/settings", methods=["GET"])
def get_settings():
    """Return the user settings as JSON."""
    cached_domains_result = get_cached_domains()
    if isinstance(cached_domains_result, dict) and "error" in cached_domains_result:
        return jsonify(cached_domains_result), 500
    # Build the response as a copy rather than mutating the shared `settings` dict -
    # that dict is written back to settings.json verbatim by every other save route, so
    # assigning into it here was leaking a stale allDomains snapshot into persisted state.
    response_settings = dict(settings)
    response_settings["allDomains"] = cached_domains_result
    return jsonify(response_settings)

@app.route("/save-settings", methods=["POST"])
def update_settings():
    """Update settings in the JSON file."""
    try:
        new_settings = request.json
        if not isinstance(new_settings, dict):
            raise ValueError("Invalid data format")
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid JSON data"}), 400

    if "theme" in new_settings and new_settings["theme"] not in ALLOWED_THEMES:
        return jsonify({"error": "Invalid theme"}), 400

    settings.update(new_settings)
    save_settings(settings)
    return jsonify({"message": "Settings updated successfully"}), 200

@app.route("/save-groups", methods=["POST"])
def save_groups():
    """Save groups and optionally renamedGroupNames."""
    try:
        data = request.json
        if not isinstance(data, dict):
            raise ValueError("Invalid data format")
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid JSON data"}), 400

    settings["groups"] = data.get("groups", settings["groups"])
    settings["renamedGroupNames"] = data.get("renamedGroupNames", settings["renamedGroupNames"])
    save_settings(settings)
    return jsonify({"message": "Groups updated successfully"}), 200

@app.route("/refresh-domains", methods=["POST"])
def refresh_domains():
    """Manually refresh the domain cache."""
    refresh_result = refresh_cached_domains()
    if isinstance(refresh_result, dict) and "error" in refresh_result:
        return jsonify(refresh_result), 500
    return jsonify({"message": "Domains refreshed successfully", "allDomains": refresh_result})

def _svg_local_name(tag):
    return tag.split("}")[-1] if "}" in tag else tag

def _sanitize_svg_style(style_value):
    """Many real-world SVG exports (Illustrator, selfhst icon set, etc.) put presentation
    properties like fill in a style="" attribute instead of a fill="" attribute. Dropping
    style entirely (as an unrecognized attribute) silently loses that color info, so parse
    it and keep only known-safe declarations rather than allowlisting the whole attribute."""
    declarations = []
    for decl in style_value.split(";"):
        if ":" not in decl:
            continue
        prop, _, value = decl.partition(":")
        prop = prop.strip().lower()
        value = value.strip()
        if prop not in ALLOWED_SVG_STYLE_PROPS or not value:
            continue
        if "javascript:" in value.lower():
            continue
        if "url(" in value.lower() and not re.match(r"^url\(\s*#", value, re.IGNORECASE):
            continue
        if prop in ("fill", "stroke") and value.lower() == "currentcolor":
            value = SVG_CURRENTCOLOR_FALLBACK
        declarations.append(f"{prop}:{value}")
    return ";".join(declarations)

def sanitize_svg(svg_bytes):
    """Safely parse untrusted SVG (defusedxml blocks XXE/entity-expansion attacks
    during parsing itself) and rebuild it from an allowlist of known-safe elements
    and attributes. Drops <script>, event handler attributes (onload, onclick, ...),
    <style>, and any href/xlink:href that isn't an internal "#fragment" reference -
    external references and inline script are the two things that make SVG riskier
    than raster formats to accept from users."""
    try:
        root = SafeET.fromstring(svg_bytes)
    except Exception:
        raise ValueError("File is not valid SVG")

    if _svg_local_name(root.tag) != "svg":
        raise ValueError("File is not an SVG image")

    def clean(el, is_root=False):
        tag = _svg_local_name(el.tag)
        if tag not in ALLOWED_SVG_TAGS:
            return None

        new_el = ET.Element(tag)
        for key, value in el.attrib.items():
            attr_name = _svg_local_name(key)
            lname = attr_name.lower()
            if lname.startswith("on"):
                continue
            if lname == "href":
                if value.startswith("#"):
                    new_el.set("href", value)
                continue
            if lname == "style":
                sanitized_style = _sanitize_svg_style(value)
                if sanitized_style:
                    new_el.set("style", sanitized_style)
                continue
            if attr_name in ALLOWED_SVG_ATTRS and "javascript:" not in value.lower():
                if lname in ("fill", "stroke") and value.strip().lower() == "currentcolor":
                    # currentColor is meaningless for an SVG loaded standalone via
                    # <img src> (no external CSS context to inherit from) - it would
                    # otherwise silently resolve to black, which is how most icon
                    # sets built around currentColor (Heroicons, Feather, etc.) end
                    # up rendering as solid black squares.
                    value = SVG_CURRENTCOLOR_FALLBACK
                new_el.set(attr_name, value)

        if is_root:
            new_el.set("xmlns", "http://www.w3.org/2000/svg")

        if el.text and el.text.strip():
            new_el.text = el.text

        for child in el:
            cleaned_child = clean(child)
            if cleaned_child is not None:
                new_el.append(cleaned_child)

        return new_el

    cleaned_root = clean(root, is_root=True)
    if cleaned_root is None:
        raise ValueError("SVG has no safe content")

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(cleaned_root, encoding="unicode")

def remove_existing_icon_file(domain_id):
    """Delete any previously stored icon for this domain, regardless of its
    extension - needed because switching between a raster icon and an SVG icon
    changes the filename, which would otherwise orphan the old file."""
    existing = settings.get("domainIcons", {}).get(str(domain_id))
    if existing:
        existing_path = os.path.join(ICONS_DIR, existing)
        if os.path.exists(existing_path):
            os.remove(existing_path)

def validate_and_save_icon(image_bytes, domain_id):
    """Validate and store an icon. Raster images are re-encoded to PNG via Pillow
    (which strips any embedded scripts/metadata and rejects disguised non-image
    files, regardless of claimed extension or content-type - Pillow will only
    successfully re-save real pixel data). SVG is handled separately by sanitize_svg
    since Pillow can't decode vector formats."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
        is_raster = True
    except (UnidentifiedImageError, OSError):
        is_raster = False

    remove_existing_icon_file(domain_id)

    if is_raster:
        if img.format not in ALLOWED_ICON_FORMATS:
            raise ValueError("Unsupported image format")
        img = img.convert("RGBA")
        # Many real-world icon files have significant transparent padding around
        # the actual graphic (e.g. a 100x100 logo centered in a 512x512 canvas).
        # object-fit: cover scales the *whole* canvas to fill the small icon slot,
        # so uncropped padding makes the visible logo render as a tiny speck. Crop
        # to the bounding box of non-transparent content first so it actually fills
        # the icon.
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
        img.thumbnail((256, 256))
        filename = f"{domain_id}.png"
        img.save(os.path.join(ICONS_DIR, filename), format="PNG")
        return filename

    sanitized_svg = sanitize_svg(image_bytes)
    filename = f"{domain_id}.svg"
    with open(os.path.join(ICONS_DIR, filename), "w", encoding="utf-8") as f:
        f.write(sanitized_svg)
    return filename

def is_safe_icon_url(url):
    """Basic SSRF guard: http(s) only, and every resolved address must be public."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False

    try:
        addrinfo = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        return False

    for _, _, _, _, sockaddr in addrinfo:
        try:
            ip_obj = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            return False
        if (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_reserved
            or ip_obj.is_multicast
            or ip_obj.is_unspecified
        ):
            return False

    return True

@app.route("/upload-icon", methods=["POST"])
def upload_icon():
    """Upload a custom icon for a domain card."""
    try:
        domain_id = int(request.form.get("domain_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid domain_id"}), 400

    if "icon" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file_bytes = request.files["icon"].read(MAX_ICON_BYTES + 1)
    if not file_bytes:
        return jsonify({"error": "Empty file"}), 400
    if len(file_bytes) > MAX_ICON_BYTES:
        return jsonify({"error": "File too large (max 2MB)"}), 400

    try:
        filename = validate_and_save_icon(file_bytes, domain_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    settings.setdefault("domainIcons", {})[str(domain_id)] = filename
    save_settings(settings)
    return jsonify({"message": "Icon uploaded successfully", "icon": filename}), 200

@app.route("/fetch-icon", methods=["POST"])
def fetch_icon():
    """Download an icon from a URL once and store it locally."""
    data = request.json or {}

    try:
        domain_id = int(data.get("domain_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid domain_id"}), 400

    url = data.get("url")
    if not url or not is_safe_icon_url(url):
        return jsonify({"error": "Invalid or disallowed URL"}), 400

    try:
        response = requests.get(
            url,
            timeout=5,
            stream=True,
            allow_redirects=False,
            headers={"User-Agent": "SimpleDash-IconFetch/1.0"},
        )
    except requests.RequestException:
        return jsonify({"error": "Failed to fetch URL"}), 400

    if response.status_code >= 300:
        return jsonify({"error": f"URL returned status {response.status_code}"}), 400

    content = bytearray()
    for chunk in response.iter_content(8192):
        content.extend(chunk)
        if len(content) > MAX_ICON_BYTES:
            return jsonify({"error": "File too large (max 2MB)"}), 400

    if not content:
        return jsonify({"error": "URL returned no data"}), 400

    try:
        filename = validate_and_save_icon(bytes(content), domain_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    settings.setdefault("domainIcons", {})[str(domain_id)] = filename
    save_settings(settings)
    return jsonify({"message": "Icon fetched successfully", "icon": filename}), 200

@app.route("/remove-icon", methods=["POST"])
def remove_icon():
    """Remove a domain's custom icon."""
    data = request.json or {}
    try:
        domain_id = int(data.get("domain_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid domain_id"}), 400

    domain_icons = settings.get("domainIcons", {})
    filename = domain_icons.pop(str(domain_id), None)
    save_settings(settings)

    if filename:
        icon_path = os.path.join(ICONS_DIR, filename)
        if os.path.exists(icon_path):
            os.remove(icon_path)

    return jsonify({"message": "Icon removed successfully"}), 200

@app.route("/icons/<path:filename>")
def serve_icon(filename):
    """Serve a stored per-domain icon."""
    response = send_from_directory(ICONS_DIR, filename)
    response.headers["X-Content-Type-Options"] = "nosniff"
    if filename.lower().endswith(".svg"):
        # Belt-and-suspenders on top of sanitize_svg(): even if a browser is
        # navigated to this URL directly (not via <img>, where SVG scripts
        # already can't execute), this blocks script execution outright.
        response.headers["Content-Security-Policy"] = "script-src 'none'; sandbox"
    return response

@app.route("/")
def serve_frontend():
    """Serve the main frontend HTML with theme injected."""
    saved_theme = settings.get("theme", "light")
    if saved_theme not in ALLOWED_THEMES:
        saved_theme = "light"
    index_path = os.path.join(app.static_folder, "index.html")

    if not os.path.exists(index_path):
        return jsonify({"error": "index.html not found"}), 500

    with open(index_path) as f:
        html_content = f.read()

    html_content = html_content.replace("{{theme}}", saved_theme)
    # Cache-bust static JS/CSS with the running image's version so a browser tab
    # left open across a docker update can't end up executing a stale-cached JS
    # file (e.g. main.js) alongside a freshly-fetched one (e.g. card.js) - that
    # kind of mismatched-version combo is what silently corrupted saved groups.
    html_content = html_content.replace("{{v}}", quote(APP_VERSION or "dev", safe=""))
    return html_content

@app.route("/<path:path>")
def serve_static_files(path):
    """Serve static files (e.g., CSS, JS)."""
    return send_from_directory(app.static_folder, path)

if __name__ == "__main__":
    from waitress import serve
    serve(app, host="0.0.0.0", port=8080, threads=16)