export function shell(content, active = "") {
  return `<div class="app-shell"><header class="topbar"><a class="logo" data-route href="/">Orbitfolio<span>◌</span></a><nav aria-label="Navegação principal">${[
    ["/", "Início"],
    ["/explore", "Explorar"],
    ["/projects", "Projetos"],
    ["/progress", "Progresso"],
    ["/favorites", "Favoritos"],
    ["/account", "Conta"],
  ]
    .map(
      ([href, label]) =>
        `<a data-route href="${href}" class="${active === href ? "is-active" : ""}">${label}</a>`,
    )
    .join(
      "",
    )}</nav><a data-route class="search-nav" href="/search" aria-label="Pesquisar contas e planetas"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg></a><a data-route class="account-orb" href="/account" aria-label="Abrir conta">◒</a></header><a data-route class="social-moon" href="/social" aria-label="Abrir Lua Social">☾ <span>Lua Social</span></a>${active !== "/" ? '<button class="panel-close" data-close aria-label="Fechar">×</button>' : ""}${content}<a data-route class="featured-fab" href="/featured" aria-label="Abrir Planetas em destaque">▤<span>Em destaque</span></a><div id="toast-region" class="toast-region" aria-live="polite"></div></div>`;
}
export function toast(message, type = "info") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const note = document.createElement("div");
  note.className = `toast ${type}`;
  note.textContent = message;
  region.append(note);
  setTimeout(() => note.remove(), 3800);
}
export function unavailable(feature) {
  return `<section class="state-card"><p class="eyebrow">Integração pendente</p><h2>${feature} ainda aguarda a API.</h2><p>A interface está preparada; ela será ativada assim que o backend expuser um contrato JSON documentado.</p></section>`;
}
