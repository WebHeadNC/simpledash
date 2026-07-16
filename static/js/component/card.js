function createCard(domain, editMode) {
    const card = document.createElement("div");
    card.className = "card";
    card.draggable = editMode;
    card.dataset.id = domain.id;
  
    const hostPort = `${domain.forward_host}:${domain.forward_port}`;
  
    let statusClass = "red";
    if (domain.nginx_online && domain.enabled) {
      statusClass = "green";
    } else if (!domain.nginx_online && domain.enabled) {
      statusClass = "yellow";
    }
  
    const statusDot = document.createElement("div");
    statusDot.className = `status-dot ${statusClass}`;

    const displayName = getDomainDisplayName(domain);

    let title;
    if (editMode) {
      title = document.createElement("input");
      title.className = "card-name-input";
      title.dataset.id = domain.id;
      title.value = displayName;
    } else {
      title = document.createElement("h3");
      title.textContent = displayName;
    }

    const hostPortEl = document.createElement("p");
    hostPortEl.textContent = hostPort;

    card.appendChild(statusDot);
    card.appendChild(title);
    card.appendChild(hostPortEl);
  
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