from flask import Flask, jsonify, send_from_directory, request
import json
import os
import sqlite3
import time
import subprocess
import io
import socket
import ipaddress
from urllib.parse import urlparse
import requests
from PIL import Image, UnidentifiedImageError

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
    "domainIcons": {}
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
    settings["allDomains"] = cached_domains_result
    return jsonify(settings)

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

def validate_and_save_icon(image_bytes, domain_id):
    """Verify image_bytes is a genuine image and re-encode it to PNG before saving.

    Re-encoding (rather than trusting the uploaded bytes as-is) strips any embedded
    scripts/metadata and rejects disguised non-image files regardless of claimed
    extension or content-type - Pillow will only successfully re-save real pixel data.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise ValueError("File is not a valid image")

    if img.format not in ALLOWED_ICON_FORMATS:
        raise ValueError("Unsupported image format")

    img = img.convert("RGBA")
    img.thumbnail((256, 256))

    filename = f"{domain_id}.png"
    img.save(os.path.join(ICONS_DIR, filename), format="PNG")
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
    return send_from_directory(ICONS_DIR, filename)

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
    return html_content

@app.route("/<path:path>")
def serve_static_files(path):
    """Serve static files (e.g., CSS, JS)."""
    return send_from_directory(app.static_folder, path)

if __name__ == "__main__":
    from waitress import serve
    serve(app, host="0.0.0.0", port=8080, threads=16)