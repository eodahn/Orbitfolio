import { renderSearch } from "./pages/search.js";
import { renderCreateProject } from "./pages/create-project.js";
import { startPlanetPreviews } from "./three/preview.js";
import "./styles/main.css";
import "./styles/auth.css";
import "./styles/states.css";
import {
  registerRoute,
  renderCurrent,
  setRouterErrorHandler,
  startRouter,
} from "./router/router.js";
import { renderHome, pauseUniverse } from "./pages/home.js";
import {
  renderProjects,
  renderExplore,
  renderProgress,
  renderFavorites,
  renderFeatured,
} from "./pages/collections.js";
import { renderProject } from "./pages/project.js";
import {
  renderAccount,
  renderSocial,
  renderLogin,
  renderProfile,
} from "./pages/account.js";
const root = document.querySelector("#app");
setRouterErrorHandler(() => {
  root.innerHTML = `<main class="fatal-state"><p class="eyebrow">SINAL INTERROMPIDO</p><h1>Não foi possível carregar esta órbita.</h1><p>Verifique a conexão com a API e tente novamente.</p><a class="button button-primary" href="/">Voltar ao início</a></main>`;
});
const route = (render) => async () => {
  pauseUniverse();
  await render(root);
};
registerRoute("/", async () => renderHome(root));
registerRoute("/explore", route(renderExplore));
registerRoute("/projects", route(renderProjects));
registerRoute("/projects/new", route(renderCreateProject));
registerRoute("/progress", route(renderProgress));
registerRoute("/favorites", route(renderFavorites));
registerRoute("/featured", route(renderFeatured));
registerRoute("/account", route(renderAccount));
registerRoute("/social", route(renderSocial));
registerRoute("/search", route(renderSearch));
registerRoute(
  "/login",
  route((r) => renderLogin(r)),
);
registerRoute(
  "/register",
  route((r) => renderLogin(r, true)),
);
registerRoute(
  "/project/:id",
  route((r) =>
    renderProject(r, decodeURIComponent(location.pathname.split("/").pop())),
  ),
);
registerRoute(
  "/user/:id",
  route((r) =>
    renderProfile(r, decodeURIComponent(location.pathname.split("/").pop())),
  ),
);
startPlanetPreviews(root);
startRouter();
renderCurrent();
