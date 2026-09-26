import { mountTimeline } from "../components/commit-timeline.js";
import { escapeHtml as e } from "../utils/html.js";
import { api } from "../api/index.js";
import { shell, toast } from "../components/shell.js";
import { projectCard } from "../components/project-card.js";
import { navigate } from "../router/router.js";
const cards = (projects, meta) =>
  projects.length
    ? `<div class="project-grid">${projects.map((p, i) => projectCard(p, meta?.(p, i))).join("")}</div>`
    : "<p>Nenhum projeto nesta órbita.</p>";
export async function renderProjects(root) {
  if (!(await api.auth.session())) return navigate("/login");
  const projects = await api.projects.mine();
  root.innerHTML = shell(
    `<main class="page"><div class="page-heading"><div><p class="eyebrow">MINHA CARTOGRAFIA</p><h1>Projetos</h1><p>Gerencie seus projetos e planetas.</p></div><a class="button button-primary" data-route href="/projects/new">Adicionar projeto</a></div>${cards(projects)}</main>`,
    "/projects",
  );
}
export async function renderProgress(root) {
  if (!(await api.auth.session())) return navigate("/login");
  const progress = await api.progress();
  const selected = new URLSearchParams(location.search).get("project");
  root.innerHTML = shell(
    `<main class="page"><p class="eyebrow">TRAJETÓRIA</p><h1>Progresso</h1><p>Histórico real dos seus projetos integrados ao GitHub.</p><div class="progress-layout"><nav aria-label="Projetos integrados">${progress.projects.map((p) => `<a class="button" data-route href="/progress?project=${encodeURIComponent(p.id)}">${e(p.name)}</a>`).join("") || '<p>Nenhum projeto integrado.</p><a class="button" data-route href="/projects/new">Integrar um projeto</a>'}</nav><section data-timeline aria-label="Histórico de commits"><p>Selecione um projeto para acompanhar sua trajetória.</p></section></div></main>`,
    "/progress",
  );
  if (selected) {
    if (progress.projects.some((p) => p.id === selected))
      await mountTimeline(root.querySelector("[data-timeline]"), selected);
    else
      root.querySelector("[data-timeline]").textContent =
        "Escolha um dos seus projetos integrados.";
  }
}
export async function renderFavorites(root) {
  const projects = await api.social.favorites();
  root.innerHTML = shell(
    `<main class="page"><div class="page-heading"><div><p class="eyebrow">ÓRBITAS SALVAS</p><h1>Favoritos</h1></div></div>${cards(projects, () => "Favorito")}</main>`,
    "/favorites",
  );
}
export async function renderFeatured(root, period = "week") {
  const projects = await api.rankings.featured(period);
  root.innerHTML = shell(
    `<main class="page"><div class="page-heading"><div><p class="eyebrow">SINAL DA COMUNIDADE</p><h1>Planetas em destaque</h1></div><div class="period-tabs" role="tablist">${[
      ["week", "Semana"],
      ["month", "Mês"],
      ["all", "Todos"],
    ]
      .map(
        ([id, label]) =>
          `<button data-period="${id}" class="${id === period ? "is-active" : ""}">${label}</button>`,
      )
      .join(
        "",
      )}</div></div>${cards(projects, (p, i) => `#${i + 1} · ${p.likes} curtidas`)}</main>`,
  );
  root.querySelector(".period-tabs").addEventListener("click", (event) => {
    const target = event.target.dataset.period;
    if (target) renderFeatured(root, target);
  });
}
