import * as THREE from "three";
import { createPlanet } from "./planet-factory.js";
import { WORLD, availablePosition, randomPosition } from "./world.js";
import { stepPhysics } from "./physics.js";
import { createShip } from "./ship.js";

export class Universe {
  constructor(canvas, onFocus, onFirstMovement = () => {}) {
    this.canvas = canvas;
    this.onFocus = onFocus;
    this.onFirstMovement = onFirstMovement;
    this.hasMoved = false;
    this.lowPower =
      matchMedia("(max-width: 700px)").matches ||
      navigator.hardwareConcurrency <= 4;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.lowPower,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.lowPower ? 1.35 : 2),
    );
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#05050a");
    this.scene.fog = new THREE.FogExp2("#05050a", 0.0022);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1600);
    this.camera.position.set(0, 5.5, 18);
    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.planets = [];
    this.running = false;
    this.ship = createShip();
    Object.assign(this.ship.userData, {
      radius: WORLD.shipRadius,
      mass: WORLD.shipMass,
    });
    this.scene.add(
      this.ship,
      new THREE.HemisphereLight("#b7b4ff", "#080814", 1.25),
    );
    const sun = new THREE.PointLight("#fff4e5", 1000, 700);
    sun.position.set(-90, 110, 50);
    this.scene.add(sun);
    this.addStars();
    this.bind();
    this.resize();
  }
  addStars() {
    const count = this.lowPower ? 1800 : 5000,
      positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const p = randomPosition(0);
      positions.set(p.toArray(), i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: "#e7e9ff",
          size: 1,
          transparent: true,
          opacity: 0.8,
        }),
      ),
    );
  }
  setProjects(projects) {
    const existing = new Map(
      this.planets.map((p) => [p.userData.project.id, p]),
    );
    for (const project of projects) {
      if (existing.has(project.id)) {
        existing.get(project.id).userData.project = project;
        continue;
      }
      const planet = createPlanet(project, this.lowPower ? 20 : 32);
      const position = availablePosition(
        planet.userData.radius,
        this.spawned ? [...this.planets, this.ship] : this.planets,
      );
      if (!position) {
        console.warn("Universo cheio: planeta não posicionado", project.id);
        continue;
      }
      planet.position.copy(position);
      this.planets.push(planet);
      this.scene.add(planet);
    }
    if (!this.spawned) {
      const spawn = availablePosition(WORLD.shipRadius, this.planets);
      if (!spawn) throw new Error("Não há posição segura para a nave.");
      this.ship.position.copy(spawn);
      // Face the nearest project on first spawn so a random edge position never
      // leaves the initial view pointing away from the populated universe.
      const nearest = [...this.planets].sort(
        (a, b) =>
          a.position.distanceToSquared(spawn) -
          b.position.distanceToSquared(spawn),
      )[0];
      if (nearest) {
        const direction = nearest.position.clone().sub(spawn);
        this.ship.rotation.y = Math.atan2(-direction.x, -direction.z);
      }
      this.camera.position
        .copy(spawn)
        .add(
          new THREE.Vector3(0, 4.3, 12).applyQuaternion(this.ship.quaternion),
        );
      this.camera.lookAt(
        spawn
          .clone()
          .add(
            new THREE.Vector3(0, 0.25, -8).applyQuaternion(
              this.ship.quaternion,
            ),
          ),
      );
      this.spawned = true;
    }
  }
  bind() {
    addEventListener("keydown", (event) => {
      if (
        !this.running ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      )
        return;
      if (
        ["Space", "ShiftLeft", "KeyW", "KeyA", "KeyS", "KeyD"].includes(
          event.code,
        )
      )
        event.preventDefault();
      this.keys.add(event.code);
      if (
        !this.hasMoved &&
        ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft"].includes(
          event.code,
        )
      ) {
        this.hasMoved = true;
        this.onFirstMovement();
      }
    });
    addEventListener("blur", () => this.keys.clear());
    addEventListener("keyup", (event) => this.keys.delete(event.code));
    addEventListener("resize", () => this.resize());
    this.canvas.addEventListener("pointerdown", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.planets, true);
      if (hits[0]) {
        let object = hits[0].object;
        while (object.parent && !this.planets.includes(object))
          object = object.parent;
        this.onFocus(object.userData.project);
      }
    });
  }
  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  updateFlight(delta) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.ship.quaternion,
    );
    const acceleration =
      (this.keys.has("KeyW") ? 22 : 0) - (this.keys.has("KeyS") ? 15 : 0);
    this.ship.userData.velocity.addScaledVector(forward, acceleration * delta);
    if (this.keys.has("KeyA")) this.ship.rotation.y += 1.45 * delta;
    if (this.keys.has("KeyD")) this.ship.rotation.y -= 1.45 * delta;
    if (this.keys.has("Space")) this.ship.userData.velocity.y += 13 * delta;
    if (this.keys.has("ShiftLeft")) this.ship.userData.velocity.y -= 13 * delta;
    this.ship.userData.velocity.multiplyScalar(Math.pow(0.985, delta));
    this.ship.userData.velocity.clampLength(0, 30);
  }
  frame = () => {
    if (!this.running) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.updateFlight(delta);
    stepPhysics([this.ship, ...this.planets], delta);
    const desired = this.ship.position
      .clone()
      .add(new THREE.Vector3(0, 4.3, 12).applyQuaternion(this.ship.quaternion));
    this.camera.position.lerp(desired, 1 - Math.pow(0.0004, delta));
    this.camera.lookAt(
      this.ship.position
        .clone()
        .add(
          new THREE.Vector3(0, 0.25, -8).applyQuaternion(this.ship.quaternion),
        ),
    );
    this.planets.forEach((planet) => {
      planet.rotation.y += planet.userData.spin * delta * 60;
      planet.userData.atmosphere.rotation.y += 0.025 * delta;
    });
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  };
  start() {
    if (!this.running) {
      this.running = true;
      this.resize();
      this.clock.start();
      this.frameId = requestAnimationFrame(this.frame);
    }
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.keys.clear();
    this.clock.stop();
  }
  dispose() {
    this.stop();
    this.renderer.dispose();
  }
}
