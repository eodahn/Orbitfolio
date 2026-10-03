import { FlightControls } from "./flight-controls.js";
import { aimedPlanet } from "./planet-interaction.js";
import { escapeHtml as e } from "../utils/html.js";
import * as THREE from "three";
import { framingDistance } from "./preview.js";
import { createPlanet, disposePlanet } from "./planet-factory.js";
import { WORLD, availablePosition, randomPosition } from "./world.js";
import { stepPhysics } from "./physics.js";
import { Warp, NORMAL_SPEED, WARP_SPEED_MULTIPLIER } from "./warp.js";
import { createShip } from "./ship.js";

export class Universe {
  constructor(canvas, onFocus, onFirstMovement = () => {}) {
    this.canvas = canvas;
    this.onFocus = onFocus;
    this.onFirstMovement = onFirstMovement;
    this.hasMoved = false;
    this.lowPower = navigator.hardwareConcurrency <= 4;
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
    this.warp = new Warp();
    this.warpHud = document.createElement("aside");
    this.warpHud.className = "warp-hud";
    this.warpHud.innerHTML = `<span>DOBRA</span><div class="warp-track" role="progressbar" aria-label="Energia de Dobra" aria-valuemin="0" aria-valuemax="100"><i></i></div><output>100%</output>`;
    canvas.parentElement.append(this.warpHud);
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
  removeProject(id) {
    const removed = this.planets.find((p) => p.userData.project.id === id);
    if (!removed) return;
    if (this.aim === removed) this.setAim(null);
    this.scene.remove(removed);
    disposePlanet(removed);
    this.planets = this.planets.filter((p) => p !== removed);
  }
  setProjects(projects) {
    const ids = new Set(projects.map((p) => p.id));
    for (const planet of [...this.planets])
      if (!ids.has(planet.userData.project.id))
        this.removeProject(planet.userData.project.id);
    const existing = new Map(
      this.planets.map((p) => [p.userData.project.id, p]),
    );
    for (const project of projects) {
      if (existing.has(project.id)) {
        existing.get(project.id).userData.project = project;
        continue;
      }
      const planet = createPlanet(project, this.lowPower ? 20 : 32);
      const position = Array.isArray(project.orbit)
        ? new THREE.Vector3(...project.orbit)
        : availablePosition(
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
      this.controls.yaw = this.ship.rotation.y;
      this.controls.pitch = 0;
      this.spawned = true;
    }
  }
  bind() {
    this.hud = document.createElement("div");
    this.hud.className = "navigation-hud";
    this.hud.hidden = true;
    this.hud.innerHTML =
      '<span class="flight-crosshair" aria-hidden="true">+</span><small class="pointer-hint">ESC — Liberar cursor</small><div class="aim-info" hidden></div>';
    this.canvas.parentElement.append(this.hud);
    this.controls = new FlightControls(this.canvas, {
      canNavigate: () => this.running && !this.focus,
      onMode: (active) => {
        this.hud.hidden = !active;
        if (!active) this.setAim(null);
      },
      onInteract: () => {
        this.updateAim();
        if (this.aim) {
          const project = this.aim.userData.project;
          this.controls.release();
          this.onFocus(project);
        }
      },
      onMove: () => {
        if (!this.hasMoved) {
          this.hasMoved = true;
          this.onFirstMovement();
        }
      },
    });
    this.keys = this.controls.keys;
    this.resizeListener = () => this.resize();
    addEventListener("resize", this.resizeListener);
    this.fallbackClick = (event) => {
      if (!this.controls.fallback || this.focus || !this.running) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(
        this.planets.map((p) => p.userData.surface),
        false,
      )[0];
      const planet = this.planets.find(
        (p) => p.userData.surface === hit?.object,
      );
      if (planet) this.onFocus(planet.userData.project);
    };
    this.canvas.addEventListener("click", this.fallbackClick);
  }
  setAim(planet) {
    if (planet === this.aim) return;
    if (this.aim)
      this.aim.userData.surface.material.emissiveIntensity = this.aimIntensity;
    this.aim = planet;
    const info = this.hud.querySelector(".aim-info");
    info.hidden = !planet;
    if (planet) {
      this.aimIntensity = planet.userData.surface.material.emissiveIntensity;
      planet.userData.surface.material.emissiveIntensity = 2.4;
      const p = planet.userData.project;
      info.innerHTML = `<strong>${e(p.name)}</strong><span>${e(p.owner.name)} · @${e(p.owner.username)}</span><small>${Object.keys(
        p.languages || {},
      )
        .slice(0, 3)
        .map(e)
        .join(" · ")}</small><b>[E] Explorar</b>`;
    }
  }
  updateAim() {
    this.setAim(
      this.controls.navigation && !this.focus
        ? aimedPlanet(
            this.camera,
            this.planets,
            this.ship.position,
            this.raycaster,
          )
        : null,
    );
  }
  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.focus && !this.focus.returning) this.focusTarget();
  }
  teleportToPlanet(id) {
    const planet = this.planets.find((p) => p.userData.project.id === id);
    if (!planet) return false;
    const clearance =
      planet.userData.radius * 1.025 + WORLD.shipRadius + WORLD.margin;
    // Search rings around the current planet position, including camera clearance.
    let target;
    for (const extra of [0, 12, 24, 40]) {
      for (let i = 0; i < 64; i++) {
        const angle = (i * Math.PI * 2) / 64;
        const candidate = planet.position
          .clone()
          .add(
            new THREE.Vector3(
              Math.sin(angle),
              0,
              Math.cos(angle),
            ).multiplyScalar(clearance + extra),
          );
        const camera = candidate
          .clone()
          .add(
            candidate
              .clone()
              .sub(planet.position)
              .normalize()
              .multiplyScalar(12),
          )
          .add(new THREE.Vector3(0, 4.3, 0));
        const valid = (point, radius) =>
          [point.x, point.y, point.z].every(
            (v) => v >= WORLD.min + radius && v <= WORLD.max - radius,
          ) &&
          this.planets.every(
            (p) =>
              point.distanceTo(p.position) >
              p.userData.radius * 1.025 + radius + 2,
          );
        if (valid(candidate, WORLD.shipRadius) && valid(camera, 1)) {
          target = candidate;
          break;
        }
      }
      if (target) break;
    }
    if (!target) return false;
    this.restoreFocus(true);
    this.keys.clear();
    this.ship.position.copy(target);
    this.ship.userData.velocity.set(0, 0, 0);
    const direction = planet.position.clone().sub(target);
    this.ship.rotation.set(0, Math.atan2(-direction.x, -direction.z), 0);
    this.controls.yaw = this.ship.rotation.y;
    this.controls.pitch = 0;
    this.camera.position
      .copy(target)
      .add(new THREE.Vector3(0, 4.3, 12).applyQuaternion(this.ship.quaternion));
    this.camera.lookAt(planet.position);
    this.hasMoved = true;
    this.onFirstMovement();
    this.canvas.focus();
    return true;
  }
  focusTarget() {
    const f = this.focus;
    if (!f) return;
    const p = f.planet;
    const direction = this.camera.position.clone().sub(p.position).normalize();
    if (direction.lengthSq() < 0.01) direction.set(0, 0, 1);
    f.target = p.position
      .clone()
      .addScaledVector(
        direction,
        framingDistance(
          p.userData.radius * 1.025,
          this.camera.fov,
          this.camera.aspect,
        ),
      );
    const camera = this.camera.clone();
    camera.position.copy(f.target);
    camera.lookAt(p.position);
    f.targetQuaternion = camera.quaternion.clone();
    f.start = this.camera.position.clone();
    f.startQuaternion = this.camera.quaternion.clone();
    f.elapsed = 0;
  }
  focusPlanet(id) {
    this.controls.release();
    const planet = this.planets.find((p) => p.userData.project.id === id);
    if (!planet) return;
    this.keys.clear();
    this.focus = {
      planet,
      savedPosition: this.camera.position.clone(),
      savedQuaternion: this.camera.quaternion.clone(),
      returning: false,
    };
    this.focusTarget();
  }
  restoreFocus(immediate = false) {
    if (!this.focus) return;
    const f = this.focus;
    this.keys.clear();
    if (immediate) {
      this.camera.position.copy(f.savedPosition);
      this.camera.quaternion.copy(f.savedQuaternion);
      this.focus = null;
      return;
    }
    Object.assign(f, {
      returning: true,
      start: this.camera.position.clone(),
      startQuaternion: this.camera.quaternion.clone(),
      target: f.savedPosition,
      targetQuaternion: f.savedQuaternion,
      elapsed: 0,
    });
  }
  updateFocus(delta) {
    const f = this.focus;
    f.elapsed = Math.min(0.8, f.elapsed + delta);
    const t = f.elapsed / 0.8,
      s = t * t * (3 - 2 * t);
    this.camera.position.lerpVectors(f.start, f.target, s);
    this.camera.quaternion.slerpQuaternions(
      f.startQuaternion,
      f.targetQuaternion,
      s,
    );
    if (t === 1 && f.returning) this.focus = null;
  }
  updateFlight(delta) {
    if (this.controls.blocked()) this.keys.clear();
    if (this.controls.navigation)
      this.ship.rotation.set(this.controls.pitch, this.controls.yaw, 0, "YXZ");
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.ship.quaternion,
    );
    const active = this.warp.update(this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"), delta);
    const multiplier = active ? WARP_SPEED_MULTIPLIER : 1;
    this.ship.userData.updateWarp?.(active, delta);
    this.updateWarpHud();
    const acceleration =
      (this.keys.has("KeyW") ? 22 : 0) - (this.keys.has("KeyS") ? 15 : 0);
    this.ship.userData.velocity.addScaledVector(forward, acceleration * multiplier * delta);
    {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
        this.ship.quaternion,
      );
      this.ship.userData.velocity.addScaledVector(
        right,
        ((this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0)) *
          18 * multiplier *
          delta,
      );
    }
    if (this.keys.has("Space")) this.ship.userData.velocity.y += 13 * multiplier * delta;
    if (this.keys.has("ControlLeft") || this.keys.has("ControlRight"))
      this.ship.userData.velocity.y -= 13 * multiplier * delta;
    this.ship.userData.velocity.multiplyScalar(Math.pow(0.985, delta));
    this.ship.userData.velocity.clampLength(0, NORMAL_SPEED * multiplier);
  }
  updateWarpHud() {
    const energy = Math.round(this.warp.energy);
    this.warpHud.querySelector("i").style.height = `${this.warp.energy}%`;
    this.warpHud.querySelector("output").textContent = `${energy}%`;
    this.warpHud.querySelector("[role=progressbar]").setAttribute("aria-valuenow", energy);
    this.warpHud.classList.toggle("is-active", this.warp.active);
    this.warpHud.classList.toggle("is-empty", this.warp.exhausted);
  }
  frame = () => {
    if (!this.running) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (this.focus) {
      this.warp.update(false, delta);
      this.ship.userData.updateWarp?.(false, delta);
      this.updateWarpHud();
      this.updateFocus(delta);
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(this.frame);
      return;
    }
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
    this.updateAim();
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
    this.controls.release();
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.keys.clear();
    this.clock.stop();
    this.warp.active = false;
    this.ship.userData.updateWarp?.(false, 1);
    this.updateWarpHud();
  }
  dispose() {
    this.stop();
    this.controls.dispose();
    removeEventListener("resize", this.resizeListener);
    this.canvas.removeEventListener("click", this.fallbackClick);
    this.hud.remove();
    this.warpHud.remove();
    this.ship.userData.dispose?.();
    for (const planet of this.planets) disposePlanet(planet);
    this.renderer.dispose();
  }
}
