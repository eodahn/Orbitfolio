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
  assert.equal(control.fallback, false);
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
test("fallback flight requires canvas capture and ESC/UI releases all modifiers", () => {
  const doc = new EventTarget(), host = new EventTarget(), canvas = new EventTarget();
  doc.querySelector = () => null;
  canvas.focus = () => { doc.activeElement = canvas; };
  const controls = new FlightControls(canvas, { document: doc, host });
  const press = code => {
    const key = new Event('keydown', {cancelable:true});
    Object.assign(key, {code}); host.dispatchEvent(key); return key.defaultPrevented;
  };
  for (const key of ['KeyW','Space','ControlLeft','ShiftLeft']) assert.equal(press(key), false);
  assert.equal(controls.keys.size,0);
  event(canvas,'click');
  for (const key of ['KeyW','Space','ControlLeft','ShiftLeft']) assert.equal(press(key), true);
  assert.equal(controls.keys.size,4);
  press('Escape');
  assert.equal(controls.keys.size,0);
  assert.equal(press('Space'),false);
  event(canvas,'click');press('ControlRight');press('ShiftRight');
  event(doc,'orbitfolio:ui');
  assert.equal(controls.keys.size,0);assert.equal(press('ControlRight'),false);
  event(canvas,'click');
  doc.activeElement={closest:()=>true};event(doc,'focusin');
  assert.equal(press('ShiftRight'),false);
  controls.dispose();
});

test('handled planet/moon click uses the existing listener without capturing pointer lock', () => {
  const doc = new EventTarget(), host = new EventTarget(), canvas = new EventTarget();
  doc.querySelector = () => null;
  canvas.focus = () => {};
  let captures = 0, clicks = 0;
  canvas.requestPointerLock = () => captures++;
  const controls = new FlightControls(canvas, { document: doc, host, onCanvasClick: () => { clicks++; return true; } });
  event(canvas, 'click');
  assert.equal(clicks, 1); assert.equal(captures, 0);
  controls.dispose(); event(canvas, 'click'); assert.equal(clicks, 1);
});

function lockHarness(options = {}) {
  const doc = new EventTarget(), host = new EventTarget(), canvas = new EventTarget();
  let modal = false, allowed = true, captures = 0, exits = 0;
  doc.pointerLockElement = null;
  doc.querySelector = () => modal;
  canvas.focus = () => { doc.activeElement = canvas; };
  canvas.requestPointerLock = () => { captures++; return options.request?.(); };
  doc.exitPointerLock = () => { exits++; };
  const control = new FlightControls(canvas, {document:doc, host, canNavigate:()=>allowed});
  const change = element => { doc.pointerLockElement = element; event(doc,'pointerlockchange'); };
  return {doc, host, canvas, control, change,
    click:()=>event(canvas,'click'),
    escape:(key='Escape')=>event(host,'keydown',{key}),
    modal:value=>modal=value, allowed:value=>allowed=value,
    counts:()=>({captures,exits})};
}

test('repeated lock/Escape/re-lock uses browser state, clears held keys and prevents duplicate requests', () => {
  const h = lockHarness(), c = h.control;
  for (let i=0; i<4; i++) {
    h.click(); h.click();
    assert.equal(h.counts().captures,i+1);
    assert.ok(c.lockPending);
    h.change(h.canvas);
    assert.equal(c.lockPending,null);
    assert.equal(c.navigation,true);
    h.click(); assert.equal(h.counts().captures,i+1);
    const yaw = c.yaw;
    event(h.doc,'mousemove',{movementX:10,movementY:0});
    assert.notEqual(c.yaw,yaw);
    for (const code of ['KeyW','ShiftLeft','ControlLeft']) event(h.host,'keydown',{code});
    assert.equal(c.keys.size,3);
    // Escape must run even when a dialog or blocked focus prevents other input.
    h.modal(true); h.allowed(false);
    h.escape(i%2 ? 'Esc' : 'Escape'); h.escape();
    assert.equal(h.counts().exits,i+1);
    assert.equal(c.keys.size,0);
    assert.equal(c.navigation,true,'Do not fake unlock before the browser releases');
    h.change(null);
    assert.equal(c.navigation,false);
    const releasedYaw = c.yaw;
    event(h.doc,'mousemove',{movementX:10,movementY:0});
    assert.equal(c.yaw,releasedYaw);
    h.modal(false); h.allowed(true);
    assert.equal(h.counts().captures,i+1,'Closing UI does not recapture');
  }
  c.dispose();
});

test('pointerlockerror and promise/synchronous failures permit a fresh user click', async () => {
  let reject, throwing = false;
  const h = lockHarness({request:()=>{
    if (throwing) throw new Error('Denied');
    return new Promise((_, fail)=>{reject=fail;});
  }});
  h.click();
  const oldReject = reject;
  event(h.doc,'pointerlockerror');
  assert.equal(h.control.lockPending,null);
  assert.equal(h.control.navigation,false);
  assert.equal(h.control.fallback,false);
  assert.equal(h.counts().captures,1);
  h.click();
  const nextAttempt = h.control.lockPending;
  oldReject(new Error('Late rejection')); await Promise.resolve();
  assert.equal(h.control.lockPending,nextAttempt,'Old promises cannot cancel a newer attempt');
  reject(new Error('Denied')); await Promise.resolve();
  assert.equal(h.control.lockPending,null);
  throwing = true; h.click();
  assert.equal(h.control.lockPending,null);
  throwing = false; h.click(); h.change(h.canvas);
  assert.equal(h.control.navigation,true);
  h.escape(); h.change(null); h.control.dispose();
});

test('UI release cancels an in-flight capture and permits re-lock after closing', () => {
  const h = lockHarness();
  h.click(); event(h.doc,'orbitfolio:ui');
  h.change(h.canvas);
  assert.equal(h.counts().exits,1,'Late grant after UI release must be released');
  h.change(null);
  h.modal(true); h.click(); assert.equal(h.counts().captures,1);
  h.modal(false); assert.equal(h.counts().captures,1);
  h.click(); h.change(h.canvas);
  event(h.doc,'orbitfolio:ui'); event(h.doc,'orbitfolio:ui');
  assert.equal(h.counts().exits,2);
  h.change(null); h.click(); h.change(h.canvas);
  assert.equal(h.control.navigation,true);
  h.escape(); h.change(null); h.control.dispose();
});

test('dispose removes every listener before remount and clears transient requests', () => {
  const h = lockHarness();
  h.click(); h.control.dispose();
  assert.equal(h.control.listeners.length,0);
  assert.equal(h.control.lockPending,null);
  h.click(); event(h.doc,'pointerlockerror'); h.escape();
  assert.equal(h.counts().captures,1);
  const next = new FlightControls(h.canvas,{document:h.doc,host:h.host});
  h.click(); assert.equal(h.counts().captures,2);
  h.change(h.canvas);
  assert.equal(h.control.navigation,false);
  assert.equal(next.navigation,true);
  h.escape(); h.change(null); next.dispose();
});
