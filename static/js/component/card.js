const PENCIL_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13l-2.6.6.6-2.6L11.5 2.5z"/></svg>';
const CHECK_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>';

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

  const led = document.createElement("span");
  led.className = `status-dot ${statusClass}`;
  row.appendChild(led);

  const displayName = getDomainDisplayName(domain);
  const description = getDomainDescription(domain);

  let nameEl;
  if (editMode && isEditingCard) {
    nameEl = document.createElement("input");
    nameEl.className = "card-name-input";
    nameEl.dataset.id = domain.id;
    nameEl.value = displayName;
  } else {
    nameEl = document.createElement("h3");
    nameEl.textContent = displayName;
  }
  row.appendChild(nameEl);

  const addrEl = document.createElement("span");
  addrEl.className = "card-addr";
  addrEl.textContent = hostPort;
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
    const descInput = document.createElement("input");
    descInput.className = "card-desc-input";
    descInput.dataset.id = domain.id;
    descInput.value = description || "";
    descInput.placeholder = "Add a description";
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
