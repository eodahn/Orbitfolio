import { escapeHtml as e } from "../utils/html.js";
import { api } from "../api/index.js";
import { shell, toast } from "../components/shell.js";
import { planetIdentity } from "../three/planet-factory.js";
export async function renderProject(root, id) {
  const project = await api.projects.get(id);
  if (!project) {
    root.innerHTML = shell(
      `<main class="page"><h1>Projeto não encontrado.</h1></main>`,
    );
    return;
  }
  const commits = await api.commits.list(id);
  const color = `#${planetIdentity(project).color.getHexString()}`;
  root.innerHTML = shell(
    `<main class="page project-view"><section class="project-orbit"><div class="planet-hero" style="--planet:${color}"></div></section><section class="project-info"><p class="eyebrow">${e(project.owner.name)}</p><h1>${e(project.name)}</h1><p class="lead">${e(project.description)}</p><div class="stat-row"><span>♡ ${project.likes}</span><span>◉ ${project.views}</span><span>★ ${project.rating}</span></div><h2>Linguagens</h2><div class="language-bars">${Object.entries(
      project.languages || {},
    )
      .map(
        ([name, value]) =>
          `<div><span>${e(name)}</span><i style="width:${value}%"></i><b>${value}%</b></div>`,
      )
      .join(
        "",
      )}</div><div class="actions"><a class="button button-primary" href="${e(project.demoUrl || project.githubUrl)}" target="_blank" rel="noreferrer">Acessar projeto</a><a class="button" href="${e(project.githubUrl)}" target="_blank" rel="noreferrer">Acessar GitHub</a><button class="button" data-like>${project.liked ? "Descurtir" : "Curtir"}</button><button class="button" data-favorite>${project.favorited ? "Remover favorito" : "Favoritar planeta"}</button></div><section class="info-block"><h2>Atividade</h2>${commits.map((c) => `<p><b>${e(c.message)}</b><br>${e(c.author)} · ${new Date(c.committedAt).toLocaleDateString("pt-BR")}</p>`).join("") || "<p>Sem commits registrados.</p>"}</section></section></main>`,
  );
  root.querySelector("[data-like]").addEventListener("click", async () => {
    try {
      await (project.liked ? api.social.unlike : api.social.like)(id);
      renderProject(root, id);
    } catch (error) {
      toast(error.message, "error");
    }
  });
  root.querySelector("[data-favorite]").addEventListener("click", async () => {
    try {
      await (project.favorited ? api.social.unfavorite : api.social.favorite)(
        id,
      );
      renderProject(root, id);
    } catch (error) {
      toast(error.message, "error");
    }
  });
}
