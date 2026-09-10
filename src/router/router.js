const routes = new Map();
let errorHandler = null;
export function registerRoute(path, render) { routes.set(path, render); }
export async function navigate(path, state = {}) { history.pushState(state, "", path); await renderCurrent(); }
export async function renderCurrent() { try { const route = routes.get(location.pathname) || routes.get("/"); await route?.(); } catch (error) { console.error(error); errorHandler?.(error); } }
export function setRouterErrorHandler(handler) { errorHandler = handler; }
export function startRouter() { addEventListener("popstate", renderCurrent); document.addEventListener("click", (event) => { const link = event.target.closest("a[data-route]"); if (!link || event.metaKey || event.ctrlKey) return; event.preventDefault(); navigate(link.getAttribute("href")); }); }
