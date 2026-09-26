import { shell } from "../components/shell.js";
import { api } from "../api/index.js";
import { Universe } from "../three/universe.js";
import { navigate } from "../router/router.js";
let universe, homeNode;
export async function renderHome(root) {
  if (homeNode) {
    root.replaceChildren(homeNode);
    universe.setProjects(await api.projects.list());
    universe.start();
    return;
  }
  const hasSeenFlightHint =
    sessionStorage.getItem("orbitfolio-flight-hint-dismissed") === "true";
  root.innerHTML = shell(
    `<main class="universe-page"><canvas id="universe-canvas" tabindex="0" aria-label="Universo 3D navegável de projetos"></canvas><section class="home-intro${hasSeenFlightHint ? " is-dismissed" : ""}" data-flight-hint><p class="eyebrow">SEU PORTFÓLIO SOCIAL</p><h1>Explore projetos<br>como <em>planetas.</em></h1><p>Navegue com W A S D, Espaço e Shift. Aproxime-se ou clique em um planeta para conhecê-lo.</p></section><div class="flight-hud" aria-label="Controles de voo"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>voar</span></div></main>`,
    "/",
  );
  const canvas = root.querySelector("#universe-canvas"),
    hint = root.querySelector("[data-flight-hint]");
  homeNode = root.firstElementChild;
  universe = new Universe(
    canvas,
    (project) => navigate(`/project/${project.id}`),
    () => {
      sessionStorage.setItem("orbitfolio-flight-hint-dismissed", "true");
      hint.classList.add("is-dismissed");
    },
  );
  universe.setProjects(await api.projects.list());
  universe.start();
}
export function pauseUniverse() {
  universe?.stop();
  homeNode?.remove();
}
