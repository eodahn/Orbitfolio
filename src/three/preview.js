import * as THREE from "three";
import { createPlanet, disposePlanet } from "./planet-factory.js";
import { escapeHtml as e } from "../utils/html.js";
export function previewMarkup(project, large = false) {
  const data = encodeURIComponent(
    JSON.stringify({
      id: project.id,
      languages: project.languages,
      languageBytes: project.languageBytes,
      frameworksOrTools: project.frameworksOrTools,
      views: project.views,
      sizeBytes: project.sizeBytes,
    }),
  );
  return `<canvas class="planet-preview ${large ? "planet-preview-large" : ""}" width="${large ? 480 : 160}" height="${large ? 480 : 160}" data-planet="${data}" role="img" aria-label="Planeta 3D de ${e(project.name)}"></canvas>`;
}
export function framingDistance(radius, fov, aspect, margin = 1.18) {
  const vertical = THREE.MathUtils.degToRad(fov) / 2,
    horizontal = Math.atan(Math.tan(vertical) * aspect);
  return (radius * margin) / Math.sin(Math.min(vertical, horizontal));
}
export function startPlanetPreviews(root) {
  let renderer, frame;
  const waiting = new Set(),
    observed = new Set(),
    cache = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          waiting.add(entry.target);
          observer.unobserve(entry.target);
          observed.delete(entry.target);
        }
      schedule();
    },
    { rootMargin: "150px" },
  );
  const schedule = () => {
    if (!frame && waiting.size) frame = requestAnimationFrame(draw);
  };
  function draw() {
    frame = null;
    const canvas = waiting.values().next().value;
    waiting.delete(canvas);
    if (canvas?.isConnected) {
      try {
        const key = canvas.dataset.planet + canvas.width;
        let snapshot = cache.get(key);
        if (!snapshot) {
          renderer ??= new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: true,
          });
          renderer.setPixelRatio(1);
          renderer.setSize(canvas.width, canvas.height, false);
          const scene = new THREE.Scene(),
            camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
          const project = JSON.parse(decodeURIComponent(canvas.dataset.planet)),
            planet = createPlanet(project, 32);
          scene.add(
            planet,
            new THREE.HemisphereLight("#b7b4ff", "#080814", 1.25),
          );
          const sun = new THREE.DirectionalLight("#fff4e5", 2);
          sun.position.set(-30, 35, 40);
          scene.add(sun);
          camera.position.set(
            0,
            0,
            framingDistance(planet.userData.visualRadius, 42, 1),
          );
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
          snapshot = document.createElement("canvas");
          snapshot.width = canvas.width;
          snapshot.height = canvas.height;
          snapshot.getContext("2d").drawImage(renderer.domElement, 0, 0);
          disposePlanet(planet);
          cache.set(key, snapshot);
          if (cache.size > 60) cache.delete(cache.keys().next().value);
        }
        canvas.getContext("2d").drawImage(snapshot, 0, 0);
        canvas.dataset.rendered = "true";
      } catch {
        canvas.setAttribute(
          "aria-label",
          "Prévia 3D indisponível neste navegador",
        );
        canvas.dataset.rendered = "unavailable";
      }
    }
    schedule();
  }
  function scan() {
    for (const node of observed)
      if (!node.isConnected) {
        observer.unobserve(node);
        observed.delete(node);
      }
    for (const node of waiting) if (!node.isConnected) waiting.delete(node);
    for (const canvas of root.querySelectorAll(
      "[data-planet]:not([data-preview-ready])",
    )) {
      canvas.dataset.previewReady = "true";
      observer.observe(canvas);
      observed.add(canvas);
    }
  }
  const mutations = new MutationObserver(scan);
  mutations.observe(root, { childList: true, subtree: true });
  scan();
  const dispose = () => {
    mutations.disconnect();
    observer.disconnect();
    cancelAnimationFrame(frame);
    renderer?.dispose();
    renderer?.forceContextLoss();
    waiting.clear();
    cache.clear();
    observed.clear();
  };
  addEventListener("pagehide", dispose, { once: true });
  return dispose;
}
