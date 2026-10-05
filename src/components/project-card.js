import { previewMarkup } from "../three/preview.js";
import { escapeHtml as e } from "../utils/html.js";
import { languageColor } from "../../shared/technology-visuals.js";
export function projectCard(project, meta = "") {
  return `<a data-route href="/project/${encodeURIComponent(project.id)}" class="project-card">${previewMarkup(project)}<div><p class="eyebrow">${e(meta || project.owner.name)}</p><h3>${e(project.name)}</h3><p>${e(project.description)}</p><div class="tag-row">${Object.keys(
    project.languages || {},
  )
    .slice(0, 3)
    .map((language) => `<span style="border-bottom:2px solid ${languageColor(language)}">${e(language)}</span>`)
    .join("")}</div></div></a>`;
}
