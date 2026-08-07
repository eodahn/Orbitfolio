import * as THREE from "three";
import { createScene } from "./scene.js";
import { createCamera, updateCameraFollow } from "./camera.js";
import { createLights } from "./lights.js";
import { createStars } from "./stars.js";
import { createSpaceship } from "./spaceship.js";
import { createControls, getInputState } from "./controls.js";
import { updateShipPhysics } from "./physics.js";
import { createPlanets, updatePlanets } from "./planets.js";
import { getProjects } from "./api.js";
import {
  setupUI,
  openProjectPanel,
  showInteractionIndicator,
  hideInteractionIndicator,
} from "./ui.js";
import { setupRouter } from "./router.js";
import { renderRanking } from "./ranking.js";
import { setupCommitsPage } from "./commits.js";
import { setupSocialPage } from "./social.js";

const canvas = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = createScene();
const camera = createCamera();

createLights(scene);
createStars(scene);
const ship = createSpaceship(scene);

createControls();
setupUI();
setupRouter();

let planets = [];

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

canvas.addEventListener("click", (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const meshes = planets.map((planet) => planet.mesh);
  const intersections = raycaster.intersectObjects(meshes);

  if (intersections.length > 0) {
    const hitMesh = intersections[0].object;
    const planet = planets.find((p) => p.mesh === hitMesh);
    if (planet) openProjectPanel(planet.data);
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);

  const input = getInputState();
  updateShipPhysics(ship, input);
  updateCameraFollow(camera, ship);

  const nearestPlanet = updatePlanets(planets, ship.position);
  if (nearestPlanet) {
    showInteractionIndicator();
  } else {
    hideInteractionIndicator();
  }

  renderer.render(scene, camera);
}

async function init() {
  const projects = await getProjects();
  planets = createPlanets(scene, projects);

  renderRanking();
  setupCommitsPage();
  setupSocialPage();

  animate();
}

init();
