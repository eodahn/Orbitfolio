export function bindCharacterCounts(root) {
  for (const field of root.querySelectorAll(
    "input[maxlength],textarea[maxlength]",
  )) {
    if (field.dataset.countBound) continue;
    field.dataset.countBound = "true";
    if (!field.hasAttribute("aria-label") && field.labels?.[0]) {
      const label = [...field.labels[0].childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join("")
        .trim();
      if (label) field.setAttribute("aria-label", label);
    }
    const count = document.createElement("small");
    count.className = "character-count";
    count.setAttribute("aria-hidden", "true");
    field.insertAdjacentElement("afterend", count);
    const update = () => {
      count.textContent = `${field.value.length} / ${field.maxLength}`;
    };
    field.addEventListener("input", update);
    update();
  }
}
