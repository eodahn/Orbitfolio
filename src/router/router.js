const routes = new Map();
let errorHandler = null;
export function registerRoute(path, render) {
  routes.set(path, render);
}
export async function navigate(path, state = {}) {
  history.pushState(
    { ...state, orbitPrevious: location.pathname + location.search },
    "",
    path,
  );
  await renderCurrent();
}
export function goHome() {
  return navigate("/");
}
export async function renderCurrent() {
  document.dispatchEvent(new Event("orbitfolio:ui"));
  try {
    const route =
      routes.get(location.pathname) ||
      (location.pathname.startsWith("/project/") &&
        routes.get("/project/:id")) ||
      (location.pathname.startsWith("/user/") && routes.get("/user/:id")) ||
      routes.get("/");
    await route?.();
  } catch (error) {
    console.error(error);
    errorHandler?.(error);
  }
}
export function setRouterErrorHandler(handler) {
  errorHandler = handler;
}
export function startRouter() {
  addEventListener("popstate", renderCurrent);
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) {
      event.preventDefault();
      goHome();
      return;
    }
    const link = event.target.closest("a[data-route]");
    if (!link || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
}
