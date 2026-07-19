<p align="center">
  <img src="/static/assets/simpledash.svg" alt="SimpleDash Logo" height="150">
</p>
<h1 align="center">SimpleDash</h1>

## What SimpleDash Is

**SimpleDash** is a lightweight, real-time dashboard for users of **Nginx Proxy Manager**. It simplifies how you monitor and organize your services by automatically syncing with your NPM database. This means you never have to manually edit dashboard configuration files like YAML—it dynamically tracks and displays all your services based on their domain configurations in NPM.

![SimpleDash dashboard](/static/assets/hero.png)

---

## Core Features

- **Dynamic Updates:**
  - **SimpleDash** reads from the **Nginx Proxy Manager database**, automatically updating your dashboard whenever you add, remove, or modify domains.
- **Interactive UI:**
  - Organize services with drag-and-drop groups — drop anywhere on a group panel, not just a small target.
  - Drag groups themselves to reorder the dashboard, with custom order preserved across reloads.
  - Toggle between grid and list views.
  - Search and filter services for quick access.
- **Customizable Appearance:**
  - Multiple themes, including light, dark, midnight, and terminal modes.
  - Visibility toggles for inactive services.
- **Group Management:**
  - Categorize services into customizable groups.
  - Rename and reorder groups for easier navigation.
  - A built-in **Hidden** group — always available (and always sorted last) in edit mode, never shown on the main dashboard — for tucking away services you don't want on display.
- **Per-Service Customization:**
  - Cards show a short label by default (just the first part of the domain).
  - Rename any service's display label independently of its real domain (e.g. "retroassembly" → "Retro Assembly"); search and sort follow the custom name once set.
  - Add a short description that shows under the card's name.
  - Give a service its own icon — upload an image, or fetch one from a URL. Supports PNG/JPEG/GIF/WEBP/BMP/ICO and sanitized SVG. Icons replace the status LED and pick up a red glow if the service goes unhealthy.
  - Optional "contrast background" toggle per icon, for icons that don't stand out against the card in every theme.

---

## Why It's Useful

If you use **Nginx Proxy Manager**, you likely already have domain names set up for your services. **SimpleDash** takes that data and creates a clean, automatically updating dashboard. It eliminates the repetitive task of manually maintaining dashboard YAML files for tools like **Dashy** or **Homepage**. **SimpleDash** is tailored for **NPM** users who value automation and simplicity.

---

## Screenshots

<p align="center">
  <img src="/static/assets/screenshot1.png" alt="SimpleDash Screenshot 1" width="200">
  <img src="/static/assets/screenshot2.png" alt="SimpleDash Screenshot 2" width="200">
  <img src="/static/assets/screenshot3.png" alt="SimpleDash Screenshot 3" width="200">
  <img src="/static/assets/screenshot4.png" alt="SimpleDash Screenshot 4" width="200">
</p>

---

## Tech Stack

- **Backend:** Python, Flask
- **Frontend:** HTML, CSS, JavaScript
- **Web Server:** Waitress
- **Database:** SQLite (via Nginx Proxy Manager)
- **Deployment:** Docker, Docker Compose
- **Version Control:** Git, GitHub

---

## Future Roadmap

- Allow multiple nginx databases.
- Add a "Favorites" group for quick access to preferred services.
- Introduce collapsible groups for better organization.
- Toggle displayed information for a cleaner look.

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/) (or a compose-based manager like [Dockge](https://github.com/louislam/dockge))
- Access to your Nginx Proxy Manager database.

### Deployment Steps

1. **Get the compose file:**

   ```bash
   wget https://raw.githubusercontent.com/WebHeadNC/simpledash/main/docker-compose.yml
   ```

   Or paste [docker-compose.yml](docker-compose.yml)'s contents directly into your compose manager (e.g. Dockge's "Compose" tab for a new stack).

2. **Set the required environment variables** (either in a `.env` file next to the compose file, or in your compose manager's env editor):

   ```bash
   NGINX_DB_PATH=/path/to/your/nginx/database.sqlite
   USER_SETTINGS=/data/          # optional
   PORT=8080                     # optional
   ```

3. **Start the application:**

   ```bash
   docker compose up -d
   ```

4. Access the dashboard at [http://localhost:8080](http://localhost:8080).

To ship an update: `docker compose pull && docker compose up -d` (or use your compose manager's update button) once a new version has been released.

---

## Troubleshooting

If the app isn't running, has database errors, or doesn't show any services:

- Double-check `NGINX_DB_PATH` points at your real Nginx Proxy Manager `database.sqlite`, that the container has read permission on it, and that the directory is actually bind-mounted.
- Check the [Releases](https://github.com/WebHeadNC/simpledash/releases) page or the Actions tab to confirm a build exists for the version you're pulling.

---

## Credits

SimpleDash is a personal fork of [**Dashly**](https://github.com/lklynet/dashly) by [lklynet](https://github.com/lklynet), extended with custom features (service renaming, descriptions, custom icons, group reordering, a hidden-services group, and various fixes). All credit for the original concept and implementation goes to the upstream project.

Screenshot demo icons are from the [selfh.st icon collection](https://selfh.st/icons/), licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
