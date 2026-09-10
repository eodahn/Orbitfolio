const routes = new Map();
export function registerRoute(path, render) { routes.set(path, render); }
export async function navigate(path, state = {}) { history.pushState(state, "", path); await renderCurrent(); }
export async function renderCurrent() { const route = routes.get(location.pathname) || routes.get("/"); await route?.(); }
export function startRouter() { addEventListener("popstate", renderCurrent); document.addEventListener("click", (event) => { const link = event.target.closest("a[data-route]"); if (!link || event.metaKey || event.ctrlKey) return; event.preventDefault(); navigate(link.getAttribute("href")); }); }
