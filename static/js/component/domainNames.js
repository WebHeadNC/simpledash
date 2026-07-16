function getStrippedDomainLabel(domainName) {
  return domainName ? domainName.split(".")[0] : "";
}

function getCustomDomainName(domain) {
  return domain && renamedDomainNames ? renamedDomainNames[domain.id] : undefined;
}

function getDomainDisplayName(domain) {
  return getCustomDomainName(domain) || getStrippedDomainLabel(domain.domain_names?.[0]);
}

function setupCardNameEditing() {
  const cardNameInputs = document.querySelectorAll(".card-name-input");

  cardNameInputs.forEach((input) => {
    async function handleCardRename(event) {
      const domainId = parseInt(event.target.dataset.id, 10);
      const domain = allDomains.find((d) => d.id === domainId);
      if (!domain) return;

      const newName = event.target.value.trim();

      if (newName === getDomainDisplayName(domain)) {
        return;
      }

      if (newName) {
        renamedDomainNames[domain.id] = newName;
      } else {
        delete renamedDomainNames[domain.id];
      }

      await saveRenamedDomainNamesToJSON(renamedDomainNames);

      sortDomains(currentSortCriteria);
      renderDashboard();
      setupDragAndDrop();
    }

    input.addEventListener("blur", handleCardRename);

    input.addEventListener("keypress", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await handleCardRename(event);
        input.blur();
      }
    });
  });
}

async function saveRenamedDomainNamesToJSON(updatedRenamedDomainNames) {
  try {
    await fetch("/save-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ renamedDomainNames: updatedRenamedDomainNames }),
    });
  } catch (error) {
    console.error("Error saving renamed domain names:", error);
  }
}
