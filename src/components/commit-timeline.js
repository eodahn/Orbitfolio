import { api } from "../api/index.js";
import { escapeHtml as e } from "../utils/html.js";
export function commitItem(c) {
  const date = new Date(c.committedAt).toLocaleString("pt-BR");
  return `<li class="commit-node"><a href="${e(c.url)}" target="_blank" rel="noreferrer" class="commit-link"><strong>${e(c.message.split("\n")[0])}</strong><span>${e(c.author)} · ${e(date)} · ${e(c.shortSha)}</span><span role="tooltip" class="commit-tooltip">Autor: ${e(c.author)}<br>Versão: ${e(c.version)}<br>Data: ${e(date)}</span></a>${c.avatarUrl ? `<img class="commit-avatar" src="${e(c.avatarUrl)}" alt="Avatar de ${e(c.author)}" loading="lazy" referrerpolicy="no-referrer">` : ""}</li>`;
}
export async function mountTimeline(container, id) {
  let page = 1;
  container.innerHTML = '<p role="status">Carregando commits...</p>';
  async function load() {
    try {
      const data = await api.commits.page(id, page);
      if (!container.isConnected) return;
      if (page === 1) container.innerHTML = '<ol class="commit-timeline"></ol>';
      container
        .querySelector(".commit-timeline")
        .insertAdjacentHTML("beforeend", data.commits.map(commitItem).join(""));
      container.querySelector("[data-more]")?.remove();
      container.querySelector("[data-retry]")?.remove();
      if (!data.commits.length && page === 1)
        container.innerHTML = "<p>Nenhum commit neste repositório.</p>";
      if (data.hasNext) {
        const button = document.createElement("button");
        button.className = "button";
        button.dataset.more = "";
        button.textContent = "Carregar mais commits";
        button.onclick = () => {
          button.disabled = true;
          button.textContent = "Carregando commits...";
          page++;
          load();
        };
        container.append(button);
      }
    } catch (error) {
      if (!container.isConnected) return;
      container.querySelector("[data-more]")?.remove();
      const block = document.createElement("div");
      block.dataset.retry = "";
      block.innerHTML = `<p role="alert">${e(error.message)}</p><button class="button">Tentar novamente</button><a class="button" data-route href="/projects/new">Gerenciar conexão GitHub</a>`;
      if (page === 1) container.replaceChildren(block);
      else container.append(block);
      block.querySelector("button").onclick = () => {
        block.remove();
        load();
      };
    }
  }
  await load();
}
