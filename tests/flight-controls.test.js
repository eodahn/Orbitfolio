import test from "node:test";
import assert from "node:assert/strict";
import { FlightControls, MAX_PITCH } from "../src/three/flight-controls.js";
import { aimedPlanet } from "../src/three/planet-interaction.js";
import {
  PerspectiveCamera,
  Raycaster,
  Vector3,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Group,
} from "three";
function event(target, type, props = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, props);
  target.dispatchEvent(e);
}
test("Pointer Lock modes, mouse clamp, UI release, typed WASD/E and listener disposal", () => {
  const doc = new EventTarget(),
    host = new EventTarget(),
    canvas = new EventTarget();
  let modal = false,
    captures = 0,
    interactions = 0,
    moves = 0;
  doc.querySelector = () => modal;
  canvas.focus = () => {
    doc.activeElement = canvas;
  };
  canvas.requestPointerLock = () => {
    captures++;
  };
  doc.exitPointerLock = () => {
    doc.pointerLockElement = null;
    event(doc, "pointerlockchange");
  };
  const control = new FlightControls(canvas, {
    document: doc,
    host,
    onInteract: () => interactions++,
    onMove: () => moves++,
  });
  event(doc, "mousemove", { movementX: 100, movementY: 100 });
  assert.equal(control.yaw, 0);
  event(canvas, "click");
  assert.equal(captures, 1);
  assert.equal(control.navigation, false);
  doc.pointerLockElement = canvas;
  event(doc, "pointerlockchange");
  assert.equal(control.navigation, true);
  event(doc, "mousemove", { movementX: 100, movementY: 1e6 });
  assert.notEqual(control.yaw, 0);
  assert.equal(control.pitch, -MAX_PITCH);
  event(host, "keydown", { code: "KeyW" });
  assert.ok(control.keys.has("KeyW"));
  assert.equal(moves, 1);
  event(host, "keydown", { code: "KeyE" });
  assert.equal(interactions, 1);
  doc.activeElement = { closest: () => true };
  event(doc, "focusin");
  event(host, "keydown", { code: "KeyE" });
  event(host, "keydown", { code: "KeyW" });
  assert.equal(interactions, 1);
  assert.equal(control.keys.size, 0);
  assert.equal(control.navigation, false);
  doc.activeElement = canvas;
  doc.pointerLockElement = canvas;
  event(doc, "pointerlockchange");
  event(host, "keydown", { code: "Escape" });
  assert.equal(control.navigation, false);
  doc.pointerLockElement = canvas;
  event(doc, "pointerlockchange");
  event(doc, "orbitfolio:ui");
  assert.equal(doc.pointerLockElement, null);
  modal = true;
  event(canvas, "click");
  assert.equal(captures, 1);
  modal = false;
  event(doc, "pointerlockerror");
  assert.equal(control.navigation, false);
  assert.equal(control.fallback, true);
  control.dispose();
  event(canvas, "click");
  assert.equal(captures, 1);
});
test("center raycast considers planet surfaces, rejects distant planets and off-center targets", () => {
  const camera = new PerspectiveCamera(58, 1, 0.1, 1600),
    raycaster = new Raycaster(),
    ship = new Vector3();
  camera.lookAt(0, 0, -1);
  const planet = new Group(),
    surface = new Mesh(new SphereGeometry(6, 16, 16), new MeshBasicMaterial());
  planet.add(surface);
  planet.userData = { surface, radius: 6 };
  planet.position.set(0, 0, -40);
  assert.equal(aimedPlanet(camera, [planet], ship, raycaster), planet);
  planet.position.z = -150;
  assert.equal(aimedPlanet(camera, [planet], ship, raycaster), null);
  planet.position.set(30, 0, -40);
  assert.equal(aimedPlanet(camera, [planet], ship, raycaster), null);
  surface.geometry.dispose();
  surface.material.dispose();
});
