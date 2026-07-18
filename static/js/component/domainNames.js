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
