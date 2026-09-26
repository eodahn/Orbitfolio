import { escapeHtml as e } from "../utils/html.js";
import { planetIdentity } from "../three/planet-factory.js";
export function projectCard(project, meta = "") {
  const color = `#${planetIdentity(project).color.getHexString()}`;
  return `<a data-route href="/project/${encodeURIComponent(project.id)}" class="project-card"><i class="planet-dot" style="--planet:${color}"></i><div><p class="eyebrow">${e(meta || project.owner.name)}</p><h3>${e(project.name)}</h3><p>${e(project.description)}</p><div class="tag-row">${Object.keys(
    project.languages || {},
  )
    .slice(0, 3)
    .map((language) => `<span>${e(language)}</span>`)
    .join("")}</div></div></a>`;
}
