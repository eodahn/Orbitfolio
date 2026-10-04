import { mountProject } from "./project.js";
import { shell, toast } from "../components/shell.js";
import { api } from "../api/index.js";
import { Universe } from "../three/universe.js";
import { navigate, goHome } from "../router/router.js";
let universe, homeNode, flightHintTimer;
function scheduleFlightHint() {
  clearTimeout(flightHintTimer);
  const hud = homeNode?.querySelector(".flight-hud");
  if (hud) hud.hidden = false;
  flightHintTimer = setTimeout(() => {
    if (hud) hud.hidden = true;
    homeNode?.querySelector("[data-flight-hint]")?.classList.add("is-dismissed");
  }, 15000);
}
function closeHomeProject(immediate = false) {
  homeNode?.querySelector("[data-home-panel]")?.remove();
  homeNode?.classList.remove("has-project");
  universe?.restoreFocus(immediate);
  universe?.resize();
  homeNode?.querySelector("canvas")?.focus();
}
async function openHomeProject(project) {
  closeHomeProject(true);
  homeNode.classList.add("has-project");
  const panel = document.createElement("section");
  panel.className = "home-project-panel";
  panel.dataset.homePanel = "";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Informações do planeta");
  panel.innerHTML =
    '<button class="button home-project-close" data-home-close aria-label="Fechar projeto">×</button><div data-home-details><p role="status">Carregando projeto...</p></div>';
  homeNode.append(panel);
  panel.querySelector("button").onclick = () => {
    closeHomeProject(true);
    goHome();
  };
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHomeProject();
  });
  panel.querySelector("button").focus();
  universe.resize();
  universe.focusPlanet(project.id);
  await mountProject(panel.querySelector("[data-home-details]"), project.id, {
    home: true,
    onDeleted: () => closeHomeProject(),
  });
}
addEventListener("orbitfolio:project-deleted", (event) =>
  universe?.removeProject(event.detail),
);
async function requestedPlanet() {
  const id = new URLSearchParams(location.search).get("planet");
  if (!id) return;
  // Consume once: normal back/forward navigation must preserve subsequent flight.
  history.replaceState(history.state, "", "/");
  if (!universe.teleportToPlanet(id)) {
    toast("Planeta indisponível ou sem espaço seguro para chegar.", "error");
    return;
  }
  const planet = universe.planets.find((p) => p.userData.project.id === id);
  await openHomeProject(planet.userData.project);
}
async function startHome() {
  // Render the canvas and HUD immediately; network/model loading must not hold the loop.
  const world = universe;
  scheduleFlightHint();
  world.start();
  console.info("Orbitfolio: Home 3D iniciada com HUD da Dobra e controles atualizados.");
  await Promise.all([
    api.auth.session()
      .catch(error => {
        console.error("Orbitfolio: não foi possível identificar a sessão; usando nave padrão.", error);
        return null;
      })
      .then(user => world.ship.userData.setUser(user)),
    api.projects.list()
      .then(projects => world.setProjects(projects))
      .catch(error => {
        console.error("Orbitfolio: falha ao carregar os planetas da Home.", error);
        if (homeNode?.isConnected) toast("Não foi possível carregar os planetas.", "error");
      }),
  ]);
  if (world.running && homeNode?.isConnected && location.pathname === "/")
    await requestedPlanet();
}
export async function renderHome(root) {
  if (homeNode) {
    root.replaceChildren(homeNode);
    await startHome();
    return;
  }
  const hasSeenFlightHint =
    sessionStorage.getItem("orbitfolio-flight-hint-dismissed") === "true";
  root.innerHTML = shell(
    `<main class="universe-page"><canvas id="universe-canvas" tabindex="0" aria-label="Universo 3D navegável de projetos"></canvas><section class="home-intro${hasSeenFlightHint ? " is-dismissed" : ""}" data-flight-hint><p class="eyebrow">SEU PORTFÓLIO SOCIAL</p><h1>Explore projetos<br>como <em>planetas.</em></h1><p>Clique na galáxia para pilotar. Mouse gira a câmera; W A S D move a nave. Mire um planeta próximo e pressione E. Esc libera o cursor.</p></section><div class="flight-hud" aria-label="Controles de voo"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>voar · Espaço subir · Ctrl descer · Shift Dobra</span></div></main>`,
    "/",
  );
  const canvas = root.querySelector("#universe-canvas"),
    hint = root.querySelector("[data-flight-hint]");
  homeNode = root.firstElementChild;
  universe = new Universe(
    canvas,
    (project) => openHomeProject(project),
    () => {
      sessionStorage.setItem("orbitfolio-flight-hint-dismissed", "true");
      hint.classList.add("is-dismissed");
    },
    { onLanguageClick: ({ language, percentage, estimated }) => toast(`${language}: ${estimated ? "≈ " : ""}${Number(percentage.toFixed(4))}%`) },
  );
  await startHome();
}
export function pauseUniverse() {
  clearTimeout(flightHintTimer);
  closeHomeProject(true);
  universe?.stop();
  homeNode?.remove();
}
