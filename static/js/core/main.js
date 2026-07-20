let showInactive, showSearch, allDomains, editMode, groups, allServicesGroupName, maxColumns, currentSortCriteria, renamedDomainNames, renamedGroupNames, domainDescriptions, domainIcons, domainIconContrastBg;
let editingCardIds = new Set();
// Ephemeral, per-session only: bumped whenever an icon is uploaded/fetched so the
// <img> src changes even though the filename (always <domain_id>.<ext>) doesn't -
// otherwise the browser can keep serving the old cached image after a remove+re-add.
let iconCacheBust = {};

// Resolved once with the single initial /settings fetch, so every other module
// can read the same response instead of each firing its own fetch on load.
let settingsReadyResolve;
const settingsReady = new Promise((resolve) => {
  settingsReadyResolve = resolve;
});

const HIDDEN_GROUP_NAME = "Hidden";

const DEFAULT_SETTINGS = {
  groups: { "New Services": [] },
  domains: [],
  maxColumns: 3,
  hideInactive: false,
  sortBy: "domain",
  renamedGroupNames: { allServices: "New Services" },
  renamedDomainNames: {},
  domainDescriptions: {},
  domainIcons: {},
  domainIconContrastBg: {},
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const localVersionResponse = await fetch("/version");
    if (!localVersionResponse.ok) throw new Error("Failed to fetch local version");

    const { version: localVersion } = await localVersionResponse.json();

    const latestVersionResponse = await fetch("https://api.github.com/repos/WebHeadNC/simpledash/tags");
    if (!latestVersionResponse.ok) throw new Error("Failed to fetch latest version");

    const tags = await latestVersionResponse.json();
    const latestVersion = tags[0]?.name; // Assume the first tag is the latest

    const versionElement = document.getElementById("version-info");

    // Check and update the display based on the version comparison
    if (localVersion === latestVersion) {
      versionElement.textContent = `Version: ${localVersion} (Up to date)`;
    } else {
      versionElement.textContent = `Version: ${localVersion}`;
      const updateNotification = document.createElement("span");
      updateNotification.style.color = "red";
      updateNotification.style.marginLeft = "10px";
      updateNotification.textContent = ` (Update available: ${latestVersion})`;
      versionElement.appendChild(updateNotification);
    }
  } catch (error) {
    console.error("Error checking version:", error);
    const versionElement = document.getElementById("version-info");
    versionElement.textContent = "Version: Unknown";
  }
});

async function fetchAndRender() {
  let settings = {};
  try {
    settings = await fetchSettings();

    groups = settings.groups || DEFAULT_SETTINGS.groups;
    allDomains = settings.allDomains || DEFAULT_SETTINGS.domains;
    maxColumns = settings.maxColumns || DEFAULT_SETTINGS.maxColumns;
    showInactive = !settings.hideInactive;
    renamedGroupNames = settings.renamedGroupNames || DEFAULT_SETTINGS.renamedGroupNames;
    allServicesGroupName = renamedGroupNames.allServices || DEFAULT_SETTINGS.renamedGroupNames.allServices;
    renamedDomainNames = settings.renamedDomainNames || DEFAULT_SETTINGS.renamedDomainNames;
    domainDescriptions = settings.domainDescriptions || DEFAULT_SETTINGS.domainDescriptions;
    domainIcons = settings.domainIcons || DEFAULT_SETTINGS.domainIcons;
    domainIconContrastBg = settings.domainIconContrastBg || DEFAULT_SETTINGS.domainIconContrastBg;
    currentSettings = settings;
    currentSortCriteria = settings.sortBy || DEFAULT_SETTINGS.sortBy;

    // Only for a genuinely fresh install with no groups at all yet. Checking just
    // "is this specific group missing" instead was wrong: if a user later emptied and
    // deleted their default group (fully valid, since delete only allows empty groups)
    // while renamedGroupNames.allServices still pointed at its old name, this would
    // resurrect it filled with every domain - duplicating ones already organized
    // elsewhere. The ungrouped-domain check below already covers genuinely new domains.
    if (Object.keys(groups).length === 0) {
      groups[allServicesGroupName] = allDomains.map((domain) => domain.id);
    }

    if (!groups[HIDDEN_GROUP_NAME]) {
      groups[HIDDEN_GROUP_NAME] = [];
      await saveGroupsToJSON(groups);
    }

    // Catch truly-new domains (added in NPM since the last save) that aren't in any
    // group yet. Evaluated once here, right after a fresh settings fetch - not on every
    // renderDashboard() call - so a stale/mismatched in-memory render never gets a chance
    // to misjudge an already-grouped domain as "ungrouped" and silently persist a dupe.
    const ungroupedDomains = allDomains.filter((domain) => {
      return !Object.values(groups).some((group) => group.includes(domain.id));
    });

    if (ungroupedDomains.length > 0) {
      const defaultGroup = "New Services";
      if (!groups[defaultGroup]) {
        groups[defaultGroup] = [];
      }

      ungroupedDomains.forEach((domain) => {
        if (!groups[defaultGroup].includes(domain.id)) {
          groups[defaultGroup].push(domain.id);
        }
      });

      await saveGroupsToJSON(groups);
    }

    document.getElementById("max-columns-toggle").textContent = `Columns: ${maxColumns}`;
    document.getElementById("toggle-inactive").textContent = showInactive
      ? "Hide Inactive Domains"
      : "Show Inactive Domains";

    const sortButton = document.getElementById("sort-toggle");
    sortButton.textContent = `Sort: ${formatSortOption(currentSortCriteria)}`;

    sortDomains(currentSortCriteria);
    renderDashboard();
    setupEventListeners();
    setupDragAndDrop();
  } catch (error) {
    console.error("Error fetching and rendering settings:", error);
  } finally {
    settingsReadyResolve(settings);
  }
}

function toggleMaxColumns() {
  maxColumns = maxColumns === 3 ? 1 : maxColumns + 1;

  document.getElementById("max-columns-toggle").textContent = `Columns: ${maxColumns}`;
  saveSettingsToJson();
  renderDashboard();
}

function updateGridTemplate(groupCount) {
  const dashboard = document.getElementById("dashboard");
  dashboard.style.display = "grid";
  dashboard.style.gridGap = "1rem";

  const columns = window.innerWidth < 640 ? 1 : Math.min(groupCount, maxColumns);
  dashboard.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  dashboard.style.gridAutoRows = "auto";
}

function renderDashboard() {
  const dashboard = document.getElementById("dashboard");
  dashboard.innerHTML = "";

  const visibleGroupNames = Object.keys(groups)
    .filter((groupName) => editMode || groupName !== HIDDEN_GROUP_NAME)
    .sort((a, b) => (a === HIDDEN_GROUP_NAME) - (b === HIDDEN_GROUP_NAME));
  updateGridTemplate(visibleGroupNames.length);

  visibleGroupNames.forEach((groupName) => {
    const groupContainer = document.createElement("div");
    groupContainer.className = "group-container";
    groupContainer.dataset.group = groupName;
    groupContainer.draggable = editMode && editingCardIds.size === 0;

    const groupHeader = document.createElement("div");
    groupHeader.className = "group-header";

    if (editMode && groupName !== HIDDEN_GROUP_NAME) {
      const nameInput = document.createElement("input");
      nameInput.className = "group-name-input";
      nameInput.dataset.group = groupName;
      nameInput.value = groupName;

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-group-button";
      deleteButton.dataset.group = groupName;
      deleteButton.textContent = "×";

      groupHeader.appendChild(nameInput);
      groupHeader.appendChild(deleteButton);
    } else {
      const heading = document.createElement("h2");
      heading.textContent = groupName;
      groupHeader.appendChild(heading);
    }

    groupContainer.appendChild(groupHeader);

    const groupServices = document.createElement("div");
    groupServices.className = "group-services droppable";
    groupServices.dataset.group = groupName;

    if (editMode) {
      const dropZone = document.createElement("div");
      dropZone.className = "drop-zone";
      dropZone.dataset.group = groupName;
      dropZone.textContent = "Drop here to add to group";
      groupServices.appendChild(dropZone);
    }

    const domainIds = groups[groupName];
    domainIds.forEach((domainId) => {
      const domain = allDomains.find((d) => d.id === domainId);
      if (domain && (showInactive || domain.enabled)) {
        const card = createCard(domain, editMode, editingCardIds.has(domainId));
        groupServices.appendChild(card);
      }
    });

    groupContainer.appendChild(groupServices);
    dashboard.appendChild(groupContainer);
  });

  if (editMode) {
    setupGroupNameEditing();
    setupDeleteGroupButtons();
    setupCardEditButtons();
    setupCardIconControls();
  }

  setupDragAndDrop();
  compactOverflowingAddrs();
}

// Catches panel-width changes renderDashboard() itself doesn't run for, e.g. the
// user just resizing the browser window without touching any dashboard control.
let addrResizeObserver;
function setupAddrResizeObserver() {
  if (addrResizeObserver) return;
  addrResizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(compactOverflowingAddrs);
  });
  addrResizeObserver.observe(document.getElementById("dashboard"));
}

async function saveSettingsToJson() {
  const settings = {
    groups,
    domains: allDomains,
    maxColumns,
    hideInactive: !showInactive,
    sortBy: currentSortCriteria,
    renamedGroupNames: { allServices: allServicesGroupName },
    renamedDomainNames,
    domainDescriptions,
    domainIcons,
  };

  try {
    const response = await fetch("/save-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      console.error("Failed to save settings:", await response.text());
    }
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

// Deferred to DOMContentLoaded rather than called inline: this script tag runs
// before the later ones (sorting.js, card.js, ...) have loaded, and normally the
// /settings network round-trip takes long enough that they finish loading before
// this resolves - but a fast enough response can win that race and crash
// fetchAndRender partway through with a ReferenceError, leaving a blank dashboard.
// By DOMContentLoaded every script tag in the document has already run.
document.addEventListener("DOMContentLoaded", () => {
  fetchAndRender();
  setupAddrResizeObserver();
  // Custom webfonts (Inter, Source Code Pro) can still be loading at first render,
  // so the very first name/address width measurement can be taken against
  // fallback-font metrics and land on the wrong compact/wrap decision. Re-check
  // once the real fonts are in and the resulting reflow has settled.
  document.fonts?.ready?.then(() => compactOverflowingAddrs());
});