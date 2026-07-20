const PENCIL_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13l-2.6.6.6-2.6L11.5 2.5z"/></svg>';
const CHECK_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>';
const ADDR_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v3.6M8 5v.01"/></svg>';

function getIconUrl(domainId, iconFilename) {
  const cacheBust = iconCacheBust[domainId] ? `?v=${iconCacheBust[domainId]}` : "";
  return `/icons/${iconFilename}${cacheBust}`;
}

function createCard(domain, editMode, isEditingCard) {
  const card = document.createElement("div");
  card.className = "card";
  card.draggable = editMode && !isEditingCard;
  card.dataset.id = domain.id;

  const hostPort = `${domain.forward_host}:${domain.forward_port}`;

  let statusClass = "red";
  if (domain.nginx_online && domain.enabled) {
    statusClass = "green";
  } else if (!domain.nginx_online && domain.enabled) {
    statusClass = "yellow";
  }

  const row = document.createElement("div");
  row.className = "card-row";

  const iconFilename = getDomainIcon(domain);
  const isUnhealthy = statusClass !== "green";

  let indicator;
  if (iconFilename) {
    indicator = document.createElement("img");
    indicator.className = `card-icon${isUnhealthy ? " unhealthy" : ""}${
      getDomainIconContrastBg(domain) ? " card-icon-contrast-bg" : ""
    }`;
    indicator.src = getIconUrl(domain.id, iconFilename);
    indicator.alt = "";
  } else {
    indicator = document.createElement("span");
    indicator.className = `status-dot ${statusClass}`;
  }
  row.appendChild(indicator);

  const displayName = getDomainDisplayName(domain);
  const description = getDomainDescription(domain);

  let nameEl;
  if (editMode && isEditingCard) {
    nameEl = document.createElement("input");
    nameEl.className = "card-name-input";
    nameEl.dataset.id = domain.id;
    nameEl.value = displayName;
    nameEl.draggable = false;
  } else {
    nameEl = document.createElement("h3");
    nameEl.textContent = displayName;
  }
  row.appendChild(nameEl);

  const addrEl = document.createElement("span");
  addrEl.className = "card-addr";
  addrEl.textContent = hostPort;
  addrEl.title = hostPort;
  addrEl.dataset.fullAddr = hostPort;
  row.appendChild(addrEl);

  if (editMode) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "card-edit-button";
    editButton.dataset.id = domain.id;
    editButton.setAttribute(
      "aria-label",
      isEditingCard ? "Save name and description" : "Edit name and description"
    );
    editButton.innerHTML = isEditingCard ? CHECK_ICON_SVG : PENCIL_ICON_SVG;
    row.appendChild(editButton);
  }

  card.appendChild(row);

  if (editMode && isEditingCard) {
    card.appendChild(buildIconControls(domain, iconFilename));

    const descInput = document.createElement("input");
    descInput.className = "card-desc-input";
    descInput.dataset.id = domain.id;
    descInput.value = description || "";
    descInput.placeholder = "Add a description";
    descInput.draggable = false;
    card.appendChild(descInput);
  } else if (description) {
    const descEl = document.createElement("p");
    descEl.className = "card-desc";
    descEl.textContent = description;
    card.appendChild(descEl);
  }

  if (!editMode) {
    const linkOverlay = document.createElement("a");
    linkOverlay.href = `http://${domain.domain_names[0]}`;
    linkOverlay.target = "_blank";
    linkOverlay.rel = "noopener noreferrer";
    linkOverlay.className = "card-link";
    linkOverlay.style.position = "absolute";
    linkOverlay.style.top = 0;
    linkOverlay.style.left = 0;
    linkOverlay.style.width = "100%";
    linkOverlay.style.height = "100%";
    linkOverlay.style.zIndex = 1;
    linkOverlay.style.textDecoration = "none";
    linkOverlay.style.color = "inherit";

    card.appendChild(linkOverlay);
  }

  return card;
}

function buildIconControls(domain, iconFilename) {
  const controls = document.createElement("div");
  controls.className = "card-icon-controls";

  const preview = document.createElement("img");
  preview.className = "card-icon-controls-preview";
  if (iconFilename) {
    preview.src = getIconUrl(domain.id, iconFilename);
    if (getDomainIconContrastBg(domain)) {
      preview.classList.add("card-icon-contrast-bg");
    }
  } else {
    preview.classList.add("empty");
  }
  controls.appendChild(preview);

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "card-icon-upload-label";
  uploadLabel.textContent = "Upload";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.className = "card-icon-file-input";
  fileInput.dataset.id = domain.id;
  fileInput.accept = "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon,image/svg+xml";
  fileInput.hidden = true;
  uploadLabel.appendChild(fileInput);
  controls.appendChild(uploadLabel);

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "card-icon-url-input";
  urlInput.dataset.id = domain.id;
  urlInput.placeholder = "or paste an icon URL";
  urlInput.draggable = false;
  controls.appendChild(urlInput);

  const fetchButton = document.createElement("button");
  fetchButton.type = "button";
  fetchButton.className = "card-icon-fetch-button";
  fetchButton.dataset.id = domain.id;
  fetchButton.textContent = "Fetch";
  controls.appendChild(fetchButton);

  if (iconFilename) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "card-icon-remove-button";
    removeButton.dataset.id = domain.id;
    removeButton.textContent = "Remove";
    controls.appendChild(removeButton);

    const contrastLabel = document.createElement("label");
    contrastLabel.className = "card-icon-contrast-toggle";

    const contrastCheckbox = document.createElement("input");
    contrastCheckbox.type = "checkbox";
    contrastCheckbox.className = "card-icon-contrast-checkbox";
    contrastCheckbox.dataset.id = domain.id;
    contrastCheckbox.checked = getDomainIconContrastBg(domain);
    contrastLabel.appendChild(contrastCheckbox);
    contrastLabel.appendChild(document.createTextNode("Contrast bg"));
    controls.appendChild(contrastLabel);
  }

  const statusEl = document.createElement("span");
  statusEl.className = "card-icon-status";
  statusEl.dataset.id = domain.id;
  controls.appendChild(statusEl);

  return controls;
}

// The address only has flex-shrink room after the icon and (never-shrinking) name
// claim theirs, so how much of it fits varies per card, not just per group panel
// width - a pure CSS width breakpoint can't express that. Swap the clipped text
// for a small icon with the full address in its title/tooltip instead, and only
// as a last resort - if the name alone still doesn't fit even next to the
// already-compacted icon - let the name wrap onto a second line.
function compactOverflowingAddrs() {
  document.querySelectorAll(".card-row").forEach((row) => {
    const addr = row.querySelector(".card-addr");
    const nameEl = row.querySelector("h3");
    if (!addr) return;

    const full = addr.dataset.fullAddr;
    if (full) {
      addr.classList.remove("compact");
      addr.textContent = full;
      if (addr.scrollWidth > addr.clientWidth) {
        addr.classList.add("compact");
        addr.innerHTML = ADDR_ICON_SVG;
      }
    }

    if (nameEl) {
      nameEl.classList.remove("card-name-wrap");
      if (row.scrollWidth > row.clientWidth) {
        nameEl.classList.add("card-name-wrap");
      }
    }
  });
}
