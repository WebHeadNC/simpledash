let showInactive, showSearch, allDomains, editMode, groups, allServicesGroupName, maxColumns, currentSortCriteria, renamedDomainNames, renamedGroupNames, domainDescriptions, domainIcons;
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
    currentSettings = settings;
    currentSortCriteria = settings.sortBy || DEFAULT_SETTINGS.sortBy;

    if (!groups[allServicesGroupName]) {
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

  const visibleGroupNames = Object.keys(groups).filter(
    (groupName) => editMode || groupName !== HIDDEN_GROUP_NAME
  );
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

fetchAndRender();