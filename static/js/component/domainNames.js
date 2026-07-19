function getStrippedDomainLabel(domainName) {
  return domainName ? domainName.split(".")[0] : "";
}

function getCustomDomainName(domain) {
  return domain && renamedDomainNames ? renamedDomainNames[domain.id] : undefined;
}

function getDomainDisplayName(domain) {
  return getCustomDomainName(domain) || getStrippedDomainLabel(domain.domain_names?.[0]);
}

function getDomainDescription(domain) {
  return domain && domainDescriptions ? domainDescriptions[domain.id] : undefined;
}

function getDomainIcon(domain) {
  return domain && domainIcons ? domainIcons[domain.id] : undefined;
}

function getDomainIconContrastBg(domain) {
  return !!(domain && domainIconContrastBg && domainIconContrastBg[domain.id]);
}

function setupCardEditButtons() {
  document.querySelectorAll(".card-edit-button").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      await handleCardEditToggle(button);
    });
  });

  document.querySelectorAll(".card-name-input, .card-desc-input").forEach((input) => {
    input.addEventListener("keypress", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const button = document.querySelector(
          `.card-edit-button[data-id="${input.dataset.id}"]`
        );
        if (button) await handleCardEditToggle(button);
      }
    });
  });
}

async function handleCardEditToggle(button) {
  const domainId = parseInt(button.dataset.id, 10);
  const domain = allDomains.find((d) => d.id === domainId);
  if (!domain) return;

  if (editingCardIds.has(domainId)) {
    const nameInput = document.querySelector(`.card-name-input[data-id="${domainId}"]`);
    const descInput = document.querySelector(`.card-desc-input[data-id="${domainId}"]`);

    const newName = nameInput ? nameInput.value.trim() : "";
    const newDesc = descInput ? descInput.value.trim() : "";

    if (newName && newName !== getStrippedDomainLabel(domain.domain_names?.[0])) {
      renamedDomainNames[domainId] = newName;
    } else {
      delete renamedDomainNames[domainId];
    }

    if (newDesc) {
      domainDescriptions[domainId] = newDesc;
    } else {
      delete domainDescriptions[domainId];
    }

    editingCardIds.delete(domainId);
    await saveCardEditsToJSON(renamedDomainNames, domainDescriptions);
    sortDomains(currentSortCriteria);
  } else {
    editingCardIds.add(domainId);
  }

  renderDashboard();
  setupDragAndDrop();
}

async function saveCardEditsToJSON(updatedRenamedDomainNames, updatedDomainDescriptions) {
  try {
    await fetch("/save-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        renamedDomainNames: updatedRenamedDomainNames,
        domainDescriptions: updatedDomainDescriptions,
      }),
    });
  } catch (error) {
    console.error("Error saving card edits:", error);
  }
}

function setupCardIconControls() {
  document.querySelectorAll(".card-icon-file-input").forEach((input) => {
    input.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (file) await uploadCardIcon(input.dataset.id, file);
    });
  });

  document.querySelectorAll(".card-icon-fetch-button").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const domainId = button.dataset.id;
      const urlInput = document.querySelector(`.card-icon-url-input[data-id="${domainId}"]`);
      const url = urlInput ? urlInput.value.trim() : "";
      if (url) await fetchCardIconFromUrl(domainId, url);
    });
  });

  document.querySelectorAll(".card-icon-remove-button").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      await removeCardIcon(button.dataset.id);
    });
  });

  document.querySelectorAll(".card-icon-contrast-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", async (event) => {
      await toggleCardIconContrastBg(checkbox.dataset.id, event.target.checked);
    });
  });
}

function setCardIconStatus(domainId, message, isError) {
  const statusEl = document.querySelector(`.card-icon-status[data-id="${domainId}"]`);
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", !!isError);
}

async function uploadCardIcon(domainId, file) {
  setCardIconStatus(domainId, "Uploading…", false);
  try {
    const formData = new FormData();
    formData.append("domain_id", domainId);
    formData.append("icon", file);

    const response = await fetch("/upload-icon", { method: "POST", body: formData });
    const result = await response.json();

    if (!response.ok) {
      setCardIconStatus(domainId, result.error || "Upload failed", true);
      return;
    }

    domainIcons[domainId] = result.icon;
    iconCacheBust[domainId] = Date.now();
    renderDashboard();
    setupDragAndDrop();
  } catch (error) {
    console.error("Error uploading icon:", error);
    setCardIconStatus(domainId, "Upload failed", true);
  }
}

async function fetchCardIconFromUrl(domainId, url) {
  setCardIconStatus(domainId, "Fetching…", false);
  try {
    const response = await fetch("/fetch-icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_id: domainId, url }),
    });
    const result = await response.json();

    if (!response.ok) {
      setCardIconStatus(domainId, result.error || "Fetch failed", true);
      return;
    }

    domainIcons[domainId] = result.icon;
    iconCacheBust[domainId] = Date.now();
    renderDashboard();
    setupDragAndDrop();
  } catch (error) {
    console.error("Error fetching icon:", error);
    setCardIconStatus(domainId, "Fetch failed", true);
  }
}

async function removeCardIcon(domainId) {
  try {
    await fetch("/remove-icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain_id: domainId }),
    });
    delete domainIcons[domainId];
    renderDashboard();
    setupDragAndDrop();
  } catch (error) {
    console.error("Error removing icon:", error);
  }
}

async function toggleCardIconContrastBg(domainId, enabled) {
  const numericId = parseInt(domainId, 10);
  if (enabled) {
    domainIconContrastBg[numericId] = true;
  } else {
    delete domainIconContrastBg[numericId];
  }

  try {
    await fetch("/save-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainIconContrastBg }),
    });
  } catch (error) {
    console.error("Error saving icon contrast background setting:", error);
  }

  renderDashboard();
  setupDragAndDrop();
}
