function toggleSortCriteria() {
  const sortOptions = ["domain", "status", "ip", "manual"];
  const currentIndex = sortOptions.indexOf(currentSettings.sortBy || "domain");
  const newSortCriteria = sortOptions[(currentIndex + 1) % sortOptions.length];

  currentSortCriteria = newSortCriteria;
  updateSortButton(newSortCriteria);
  renderDashboard();
  saveSettingsToJson({ sortBy: newSortCriteria });
}

function updateSortButton(criteria) {
  const sortButton = document.getElementById("sort-toggle");
  sortButton.textContent = `Sort: ${formatSortOption(criteria)}`;
}

function formatSortOption(option) {
  switch (option) {
    case "domain":
      return "Domain Name";
    case "status":
      return "Status";
    case "ip":
      return "IP Address";
    case "manual":
      return "Manual";
    default:
      return option;
  }
}

async function saveSettingsToJson() {
  try {
    await fetch("/save-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentSettings),
    });
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await settingsReady;

    const sortButton = document.getElementById("sort-toggle");
    sortButton.textContent = `Sort: ${formatSortOption(currentSortCriteria)}`;
  } catch (error) {
    console.error("Error loading sort settings:", error);
  }
});

document.getElementById("sort-toggle").addEventListener("click", toggleSortCriteria);

async function updateSortSetting(criteria) {
  try {
    const updatedSettings = { sortBy: criteria };

    await fetch("/save-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedSettings),
    });
  } catch (error) {
    console.error("Error updating sort settings:", error);
  }
}

// "Manual" order lives directly in groups[groupName] - that array is the thing
// drag-and-drop reorders and saves. The other criteria are computed fresh at
// render time into a separate copy instead of sorting groups[groupName] in
// place, so switching sort modes and back to Manual doesn't lose the order you
// dragged things into.
function getGroupDisplayOrder(groupName) {
  const ids = groups[groupName] || [];
  if (currentSortCriteria === "manual" || !currentSortCriteria) {
    return ids;
  }

  const sorted = [...ids];
  sorted.sort((a, b) => {
    const domA = allDomains.find((d) => d.id === a);
    const domB = allDomains.find((d) => d.id === b);

    if (!domA || !domB) return 0;

    switch (currentSortCriteria) {
      case "domain":
        return getDomainDisplayName(domA).localeCompare(getDomainDisplayName(domB));
      case "status":
        return getStatusRank(domA) - getStatusRank(domB);
      case "ip":
        return domA.forward_host.localeCompare(domB.forward_host);
      default:
        return 0;
    }
  });
  return sorted;
}

function getStatusRank(domain) {
  if (domain.nginx_online && domain.enabled) return 0;
  if (!domain.nginx_online && domain.enabled) return 1;
  return 2;
}