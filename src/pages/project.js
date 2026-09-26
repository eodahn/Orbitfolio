import { escapeHtml as e } from "../utils/html.js";
import { api } from "../api/index.js";
import { shell, toast } from "../components/shell.js";
import { confirmDelete } from "../components/dialog.js";
import { mountTimeline } from "../components/commit-timeline.js";
import { previewMarkup } from "../three/preview.js";
import { navigate } from "../router/router.js";
export async function renderProject(root, id) {
  root.innerHTML = shell(
    '<main class="page" data-project-view><p role="status">Carregando projeto...</p></main>',
  );
  await mountProject(root.querySelector("[data-project-view]"), id, {
    onDeleted: () => navigate("/projects"),
  });
}
export async function mountProject(
  container,
  id,
  { home = false, onDeleted = () => navigate("/projects") } = {},
) {
  let project, viewer;
  try {
    [project, viewer] = await Promise.all([
      api.projects.get(id),
      api.auth.session(),
    ]);
  } catch (error) {
    container.innerHTML = `<p role="alert">${e(error.message)}</p><a class="button" data-route href="/projects/new">Gerenciar conexão GitHub</a>`;
    return;
  }
  if (!container.isConnected) return;
  if (!project) {
    container.innerHTML = "<h2>Projeto não encontrado.</h2>";
    return;
  }
  const own = project.owner.id === viewer?.id;
  container.classList.toggle("project-view", !home);
  container.innerHTML = `${home ? "" : `<section class="project-orbit">${previewMarkup(project, true)}</section>`}<section class="project-info"><p class="eyebrow">${e(project.owner.name)}${project.github?.private ? " · PRIVADO" : ""}</p><h1>${e(project.name)}</h1><p class="lead">${e(project.description || "Sem descrição.")}</p><div class="stat-row"><span>♡ ${project.likes}</span><span>◉ ${project.views}</span><span>★ ${project.rating}</span></div><h2>Linguagens</h2><div class="language-bars">${
    Object.entries(project.languages || {})
      .map(
        ([name, value]) =>
          `<div><span>${e(name)}</span><i style="width:${value == null ? 0 : Number(value)}%"></i><b>${value == null ? "—" : Number(value).toFixed(1) + "%"}</b></div>`,
      )
      .join("") || "<p>Linguagens não informadas.</p>"
  }</div><div class="actions">${project.repositoryUrl || project.demoUrl ? `<a class="button button-primary" href="${e(project.demoUrl || project.repositoryUrl)}" target="_blank" rel="noreferrer">Acessar projeto</a>` : ""}${project.githubUrl ? `<a class="button" href="${e(project.githubUrl)}" target="_blank" rel="noreferrer">Acessar GitHub</a>` : ""}<button class="button" data-like>${project.liked ? "Descurtir" : "Curtir"}</button><button class="button" data-favorite>${project.favorited ? "Remover favorito" : "Favoritar planeta"}</button>${own ? '<button class="button button-danger" data-delete>Excluir projeto</button>' : ""}</div><section class="info-block"><h2>Atividade</h2>${project.github?.integrationEnabled ? '<button class="button" data-commits>Ver commits do GitHub</button><div data-timeline></div>' : "<p>Este projeto não possui integração GitHub. Nenhum histórico de commits será simulado.</p>"}</section></section>`;
  for (const [selector, active, on, off] of [
    ["[data-like]", project.liked, api.social.like, api.social.unlike],
    [
      "[data-favorite]",
      project.favorited,
      api.social.favorite,
      api.social.unfavorite,
    ],
  ])
    container.querySelector(selector).onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await (active ? off : on)(id);
        await mountProject(container, id, { home, onDeleted });
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
      }
    };
  container
    .querySelector("[data-delete]")
    ?.addEventListener("click", async (event) => {
      if (!(await confirmDelete(project.name))) return;
      const button = event.target;
      button.disabled = true;
      try {
        await api.projects.delete(id);
        dispatchEvent(
          new CustomEvent("orbitfolio:project-deleted", { detail: id }),
        );
        await onDeleted();
        toast("Projeto excluído.");
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
      }
    });
  container
    .querySelector("[data-commits]")
    ?.addEventListener("click", async (event) => {
      event.target.disabled = true;
      await mountTimeline(container.querySelector("[data-timeline]"), id);
    });
}
