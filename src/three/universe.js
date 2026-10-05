import { containFlight, containCamera, clampWorld } from "./boundaries.js";
import { findSafeApproach } from "./approach.js";
import { FlightControls } from "./flight-controls.js";
import { pickPlanetSystem } from "./planet-interaction.js";
import { escapeHtml as e } from "../utils/html.js";
import * as THREE from "three";
import { framingDistance } from "./preview.js";
import { createPlanet, disposePlanet } from "./planet-factory.js";
import { WORLD, availablePosition } from "./world.js";
import { stepPhysics } from "./physics.js";
import { Warp } from "./warp.js";
import { createShip } from "./ship.js";
import { ringEligible } from "./planet-system.js";

import { SpaceChunks, FloatingOrigin } from "./space-chunks.js";
import { updateFlightVelocity } from "./flight-motion.js";

export class Universe {
  constructor(canvas, onFocus, onFirstMovement = () => {}, { onLanguageClick } = {}) {
    this.canvas = canvas;
    this.onFocus = onFocus;
    this.onLanguageClick = onLanguageClick || (detail => canvas.dispatchEvent(new CustomEvent("language-select", { detail, bubbles: true })));
    this.origin = new FloatingOrigin();
    this.globalPosition = new THREE.Vector3();
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
    this.scene.fog = new THREE.Fog("#05050a", this.lowPower ? 120 : 280, this.lowPower ? 245 : 490);
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
    const sun = new THREE.DirectionalLight("#fff4e5", 1.7);
    sun.position.set(-90, 110, 50);
    this.scene.add(sun);
    this.space = new SpaceChunks(this.scene, { activeRadius: this.lowPower ? 1 : 2 });
    this.bind();
    this.resize();
  }
  syncWorld() {
    this.origin.localToGlobal(this.ship.position, this.globalPosition);
    for (const planet of this.planets) {
      const active = planet.userData.globalPosition.distanceTo(this.globalPosition) < 1200 || this.focus?.planet === planet;
      planet.visible = active;
      if (active) {
        this.origin.globalToLocal(planet.userData.globalPosition, planet.position);
        if (!planet.parent) this.scene.add(planet);
      } else {
        this.scene.remove(planet);
        planet.position.set(0, 0, 0);
      }
    }
    this.space.update(this.globalPosition, this.origin.offset);
  }
  rebaseWorld() {
    this.origin.rebase(this.ship, [this.camera, ...this.planets.filter(p => p.visible)], this.focus);
    this.syncWorld();
  }
  removeProject(id) {
    const removed = this.planets.find((p) => p.userData.project.id === id);
    if (!removed) return;
    if (this.aim === removed) this.setAim(null);
    if (this.moonAim?.planet === removed) this.setMoonAim(null);
    if (this.focus?.planet === removed) this.restoreFocus(true);
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
      const previous = existing.get(project.id);
      const signature = JSON.stringify([project.languages, project.languageBytes, project.sizeBytes, ringEligible(project)]);
      if (previous?.userData.signature === signature) {
        previous.userData.project = project;
        continue;
      }
      const previousPosition = previous?.userData.globalPosition.clone();
      const previousVelocity = previous?.userData.velocity.clone();
      if (previous) this.removeProject(project.id);
      const planet = createPlanet(project, this.lowPower ? 20 : 32);
      const position = previousPosition || (Array.isArray(project.orbit)
        ? new THREE.Vector3(...project.orbit)
        : availablePosition(
            planet.userData.radius,
            this.planets.map(p => ({ position: p.userData.globalPosition, userData: p.userData })),
          ));
      if (!position) {
        disposePlanet(planet);
        console.warn("Universo cheio: planeta não posicionado", project.id);
        continue;
      }
      planet.userData.globalPosition = clampWorld(position.clone(),planet.userData.visualRadius);
      planet.userData.signature = signature;
      if (previousVelocity) planet.userData.velocity.copy(previousVelocity);
      this.origin.globalToLocal(planet.userData.globalPosition, planet.position);
      this.planets.push(planet);
      this.scene.add(planet);
    }
    if (!this.spawned) {
      const spawn = availablePosition(WORLD.shipRadius+WORLD.cameraMargin, this.planets.map(p=>({position:p.position,userData:{radius:p.userData.visualRadius}})));
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
    this.syncWorld();
  }
  bind() {
    this.hud = document.createElement("div");
    this.hud.className = "navigation-hud";
    this.hud.hidden = true;
    this.hud.innerHTML =
      '<span class="flight-crosshair" aria-hidden="true">+</span><small class="pointer-hint">ESC — Liberar cursor</small><div class="aim-info" hidden></div>';
    this.canvas.parentElement.append(this.hud);
    this.moonTooltip = document.createElement("div");
    this.moonTooltip.className = "language-tooltip";
    this.moonTooltip.hidden = true;
    this.canvas.parentElement.append(this.moonTooltip);
    this.controls = new FlightControls(this.canvas, {
      canNavigate: () => this.running && !this.focus,
      onCanvasClick: event => this.fallbackClick(event),
      onMode: (active) => {
        this.hud.hidden = !active;
        this.hovering = false;
        if (!active) { this.setAim(null); this.setMoonAim(null); }
      },
      onInteract: () => {
        this.updateAim();
        if (this.moonAim) { this.activateHit(this.moonAim); return; }
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
    this.pointerEvent = event => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    };
    this.fallbackClick = event => {
      if (this.focus || !this.running) return;
      this.pointerEvent(event);
      const pointer = this.controls.navigation && !this.controls.fallback ? new THREE.Vector2() : this.pointer;
      const hit = pickPlanetSystem(this.camera, this.planets, this.ship.position, this.raycaster, pointer, false);
      this.activateHit(hit);
      return !!hit;
    };
    this.hoverListener = event => {
      if (this.controls.navigation || this.focus || !this.running) return;
      this.pointerEvent(event);
      this.hovering = true;
      const hit = pickPlanetSystem(this.camera, this.planets, this.ship.position, this.raycaster, this.pointer, false);
      this.setMoonAim(hit?.type === 'languageMoon' ? hit : null);
    };
    this.leaveListener = () => { this.hovering = false; this.setMoonAim(null); this.setAim(null); };
    this.canvas.addEventListener("pointermove", this.hoverListener);
    this.canvas.addEventListener("pointerleave", this.leaveListener);
  }
  activateHit(hit) {
    if (!hit) return;
    if (hit.type === 'languageMoon') {
      const { projectId, language, percentage, estimated } = hit.object.userData;
      this.onLanguageClick({ projectId, language, percentage, estimated });
    } else {
      this.controls.release();
      this.onFocus(hit.planet.userData.project);
    }
  }
  setMoonAim(hit) {
    this.moonAim = hit;
    this.moonTooltip.hidden = !hit;
    if (hit) {
      const { language, percentage, estimated, members } = hit.object.userData;
      this.moonTooltip.textContent = `${language} · ${estimated ? "≈ " : ""}${Number(percentage.toFixed(4))}%${members ? " · " + members.map(item=>item.name).join(", ") : ""}`;
    }
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
      info.innerHTML = `<strong>${e(p.name)}</strong><span>${e(p.owner?.name || "")} · @${e(p.owner?.username || "")}</span><small>${Object.keys(
        p.languages || {},
      )
        .slice(0, 3)
        .map(e)
        .join(" · ")}</small><b>[E] Explorar</b>`;
    }
  }
  updateAim() {
    if (this.focus || (!this.controls.navigation && !this.hovering)) { this.setAim(null); this.setMoonAim(null); return; }
    const hit = pickPlanetSystem(this.camera, this.planets, this.ship.position, this.raycaster, this.controls.navigation ? new THREE.Vector2() : this.pointer, this.controls.navigation);
    this.setAim(hit?.type === 'projectPlanet' ? hit.planet : null);
    this.setMoonAim(hit?.type === 'languageMoon' ? hit : null);
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
    const approach=findSafeApproach(planet,this.planets,this.space);
    if (!approach) return false;
    const target=approach.position;
    this.controls.release?.();
    this.hovering=false;
    this.restoreFocus(true);
    this.keys.clear();
    this.origin.offset.copy(target);
    this.ship.position.set(0, 0, 0);
    this.syncWorld();
    this.ship.userData.velocity.set(0, 0, 0);
    this.ship.rotation.copy(approach.rotation);
    this.controls.yaw = this.ship.rotation.y;
    this.controls.pitch = this.ship.rotation.x;
    this.origin.globalToLocal(approach.camera,this.camera.position);
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
          p.userData.visualRadius,
          this.camera.fov,
          this.camera.aspect,
        ),
      );
    clampWorld(f.target.add(this.origin.offset),1).sub(this.origin.offset);
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
    if (!planet.visible && !this.teleportToPlanet(id)) return;
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
  updateFlight(delta, effects = true) {
    if (this.controls.blocked()) this.keys.clear();
    if (this.controls.navigation)
      this.ship.rotation.set(this.controls.pitch, this.controls.yaw, 0, "YXZ");
    const active = this.warp.update(this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"), delta);
    updateFlightVelocity(this.ship.userData.velocity, this.ship.quaternion, this.keys, active, delta);
    if (effects) { this.ship.userData.updateWarp?.(active, delta); this.updateWarpHud(); }
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
    // Preserve elapsed flight time down to 4 FPS; cap long stalls/tab suspension.
    const delta = Math.min(this.clock.getDelta(), 0.25);
    if (this.focus) {
      this.warp.update(false, delta);
      this.ship.userData.updateWarp?.(false, delta);
      this.updateWarpHud();
      this.updateFocus(delta);
      containCamera(this.camera,this.origin.offset);
      this.space.animate(delta,this.camera,this.origin.offset);
      for (const planet of this.planets) if (planet.visible) planet.update(delta, this.camera.position);
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(this.frame);
      return;
    }
    // Fixed-size upper bound keeps displacement and collisions stable at low FPS.
    const steps = Math.max(1, Math.ceil(delta * 120)), dt = delta / steps;
    const activePlanets = this.planets.filter(p => p.visible);
    for (let i = 0; i < steps; i++) {
      this.updateFlight(dt, false);
      containFlight(this.ship,this.origin.offset,dt);
      stepPhysics([this.ship, ...activePlanets], dt, { bounded: false });
      this.space.collide(this.ship,this.origin.offset);
      containFlight(this.ship,this.origin.offset,0);
      for(const planet of activePlanets) {
        const global=this.origin.localToGlobal(planet.position);
        const clamped=clampWorld(global.clone(),planet.userData.visualRadius);
        for(const axis of ['x','y','z'])if(clamped[axis]!==global[axis])planet.userData.velocity[axis]=0;
        this.origin.globalToLocal(clamped,planet.position);
      }
    }
    this.ship.userData.updateWarp?.(this.warp.active, delta);
    this.updateWarpHud();
    for (const planet of activePlanets) this.origin.localToGlobal(planet.position, planet.userData.globalPosition);
    this.rebaseWorld();
    const desired = this.ship.position
      .clone()
      .add(new THREE.Vector3(0, 4.3, 12).applyQuaternion(this.ship.quaternion));
    this.camera.position.lerp(desired, 1 - Math.exp(-12 * delta));
    containCamera(this.camera,this.origin.offset);
    this.space.animate(delta,this.camera,this.origin.offset);
    this.camera.lookAt(
      this.ship.position
        .clone()
        .add(
          new THREE.Vector3(0, 0.25, -8).applyQuaternion(this.ship.quaternion),
        ),
    );
    for (const planet of this.planets) if (planet.visible) planet.update(delta, this.camera.position);
    this.updateAim();
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
    this.canvas.removeEventListener("pointermove", this.hoverListener);
    this.canvas.removeEventListener("pointerleave", this.leaveListener);
    this.moonTooltip.remove();
    this.space.dispose();
    this.hud.remove();
    this.warpHud.remove();
    this.ship.userData.dispose?.();
    for (const planet of this.planets) disposePlanet(planet);
    this.renderer.dispose();
  }
}
