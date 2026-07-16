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
      event.dataTransfer.setData("application/x-dashly-group", groupContainer.dataset.group);
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

      if (event.dataTransfer.types.includes("application/x-dashly-group")) {
        const draggedGroup = event.dataTransfer.getData("application/x-dashly-group");
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

      if (!groups[targetGroup].includes(domainId)) {
        groups[targetGroup].push(domainId);
        await saveGroupsToJSON(groups);
      }

      renderDashboard();
      setupDragAndDrop();
    });
  });
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