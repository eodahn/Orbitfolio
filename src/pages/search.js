import { api } from "../api/index.js";
import { shell } from "../components/shell.js";
import { userCard } from "../components/user-card.js";
import { projectCard } from "../components/project-card.js";
import { escapeHtml as e } from "../utils/html.js";
import { navigate } from "../router/router.js";
export async function renderSearch(root) {
  const query = (new URLSearchParams(location.search).get("q") || "").trim();
  root.innerHTML = shell(
    `<main class="page"><p class="eyebrow">EXPLORAR A COMUNIDADE</p><h1>Pesquisar</h1><form class="global-search" role="search"><label for="global-query">Contas e planetas</label><div><input id="global-query" name="q" type="search" maxlength="120" placeholder="Nome, username ou projeto" value="${e(query)}"><button class="button button-primary">Pesquisar</button></div></form><div data-results aria-live="polite">${query ? '<p role="status">Pesquisando contas e planetas...</p>' : "<p>Digite um nome, username ou projeto para começar.</p>"}</div></main>`,
    "/search",
  );
  const results = root.querySelector("[data-results]");
  root.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    navigate(
      "/search?q=" +
        encodeURIComponent(new FormData(event.currentTarget).get("q").trim()),
    );
  };
  if (!query) {
    root.querySelector("input").focus();
    return;
  }
  try {
    const data = await api.search(query);
    if (!results.isConnected) return;
    results.innerHTML = `<section><h2>Contas</h2>${data.users.length ? `<div class="project-grid">${data.users.map(userCard).join("")}</div>` : "<p>Nenhuma conta encontrada.</p>"}</section><section><h2>Planetas/Projetos</h2>${data.projects.length ? `<div class="project-grid">${data.projects.map((p) => `<article>${projectCard(p)}<a class="button" data-route href="/?planet=${encodeURIComponent(p.id)}" aria-label="Ir para o planeta ${e(p.name)}">Ir para o planeta</a></article>`).join("")}</div>` : "<p>Nenhum planeta encontrado.</p>"}</section>`;
  } catch (error) {
    if (results.isConnected) {
      results.innerHTML = `<p role="alert">${e(error.message)}</p><button class="button" data-retry>Tentar novamente</button>`;
      results.querySelector("button").onclick = () => renderSearch(root);
    }
  }
}
