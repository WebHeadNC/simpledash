function setupDragAndDrop() {
  const cards = document.querySelectorAll(".card");
  const droppables = document.querySelectorAll(".group-container");

  cards.forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.id);
    });
  });

  droppables.forEach((groupContainer) => {
    groupContainer.addEventListener("dragstart", (event) => {
      if (event.target !== groupContainer) return;
      event.dataTransfer.setData("application/x-simpledash-group", groupContainer.dataset.group);
    });

    groupContainer.addEventListener("dragover", (event) => {
      event.preventDefault();
      groupContainer.classList.add("highlight");
    });

    groupContainer.addEventListener("dragleave", () => {
      groupContainer.classList.remove("highlight");
    });

    groupContainer.addEventListener("drop", async (event) => {
      event.preventDefault();
      groupContainer.classList.remove("highlight");
      const targetGroup = groupContainer.dataset.group;

      if (event.dataTransfer.types.includes("application/x-simpledash-group")) {
        const draggedGroup = event.dataTransfer.getData("application/x-simpledash-group");
        if (!draggedGroup || draggedGroup === targetGroup) return;

        groups = reorderGroups(groups, draggedGroup, targetGroup);
        await saveGroupsToJSON(groups);
        renderDashboard();
        setupDragAndDrop();
        return;
      }

      const domainId = parseInt(event.dataTransfer.getData("text/plain"), 10);

      Object.keys(groups).forEach((group) => {
        const index = groups[group].indexOf(domainId);
        if (index > -1) groups[group].splice(index, 1);
      });

      if (currentSortCriteria === "manual") {
        const insertIndex = computeCardInsertIndex(groupContainer, event.clientY, domainId);
        groups[targetGroup].splice(insertIndex, 0, domainId);
      } else {
        groups[targetGroup].push(domainId);
      }
      await saveGroupsToJSON(groups);

      renderDashboard();
      setupDragAndDrop();
    });
  });
}

// Only meaningful in Manual sort mode - that's the only mode where the DOM's
// card order actually matches groups[groupName]'s raw order, so a position
// computed from where the cards are currently drawn lines up with a position
// in that array. In other sort modes the row order shown is a freshly-sorted
// copy (see getGroupDisplayOrder), so a drop position there wouldn't mean
// anything meaningful in the underlying manual order.
function computeCardInsertIndex(groupContainer, clientY, excludeDomainId) {
  const cards = [...groupContainer.querySelectorAll(".card")].filter(
    (card) => parseInt(card.dataset.id, 10) !== excludeDomainId
  );
  for (let i = 0; i < cards.length; i++) {
    const midpoint = cards[i].getBoundingClientRect().top + cards[i].getBoundingClientRect().height / 2;
    if (clientY < midpoint) return i;
  }
  return cards.length;
}

function reorderGroups(currentGroups, draggedGroup, targetGroup) {
  const keys = Object.keys(currentGroups).filter((key) => key !== draggedGroup);
  const targetIndex = keys.indexOf(targetGroup);
  keys.splice(targetIndex, 0, draggedGroup);

  const reordered = {};
  keys.forEach((key) => {
    reordered[key] = currentGroups[key];
  });
  return reordered;
}

async function saveGroupsToJSON(updatedGroups) {
  try {
    await fetch("/save-groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ groups: updatedGroups }),
    });
  } catch (error) {
    console.error("Error saving groups to JSON:", error);
  }
}