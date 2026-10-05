import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const temp = await mkdtemp(join(tmpdir(), "orbit-world-"));
const server = spawn(process.execPath, ["server.mjs"], {
  env: {
    ...process.env,
    PORT: "3000",
    SEED_DEMO: "true",
    ORBITFOLIO_DATABASE_PATH: join(temp, "db.sqlite"),
  },
  stdio: "ignore",
});
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5173/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  async function initialize() {
    await page.goto("http://127.0.0.1:5173/account");
    await page.getByRole("heading", { name: "Conta", exact: true }).waitFor();
    await page.evaluate(async () => {
      const { Universe } = await import("/src/three/universe.js");
      window.snapshot = (u) => ({
        ship: u.ship.position.toArray(),
        velocity: u.ship.userData.velocity.toArray(),
        rotation: u.ship.quaternion.toArray(),
        camera: u.camera.position.toArray(),
        cameraRotation: u.camera.quaternion.toArray(),
        planets: u.planets.map((p) => ({
          position: p.position.toArray(),
          velocity: p.userData.velocity.toArray(),
          rotation: p.quaternion.toArray(),
        })),
      });
      const start = Universe.prototype.start,
        stop = Universe.prototype.stop;
      Universe.prototype.start = function () {
        window.world = this;
        window.resumed = window.snapshot(this);
        return start.call(this);
      };
      Universe.prototype.stop = function () {
        stop.call(this);
        window.paused = window.snapshot(this);
      };
    });
    await page.getByRole("link", { name: "Início", exact: true }).click();
    await page.waitForFunction(() => window.world?.running);
  }
  await initialize();
  await page.waitForFunction(() => window.world.planets.length > 0 && window.world.ship.userData.loadState === "ready");
  const first = await page.evaluate(() => window.world.ship.position.toArray());
  // Read actual GPU pixels: compilation alone cannot catch zeroed palette uniforms.
  const palettePixels = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { PlanetSystem } = await import('/src/three/planet-system.js');
    const planet = new PlanetSystem({id:'palette-regression', languages:{JavaScript:65,HTML:10,CSS:10,PowerShell:5,PostgreSQL:5,Prolog:5}});
    const renderer = new THREE.WebGLRenderer();
    const target = new THREE.WebGLRenderTarget(512,512);
    try {
      const scene = new THREE.Scene(), radius = planet.userData.radius;
      scene.add(planet.userData.surface, new THREE.AmbientLight(0xffffff, 2));
      const camera = new THREE.OrthographicCamera(-radius,radius,radius,-radius,.1,radius*10);
      camera.position.z = radius*3;
      camera.lookAt(0,0,0);
      renderer.setRenderTarget(target);
      renderer.render(scene,camera);
      let edge = 0;
      const pixels = planet.languages.languages.map(language => {
        const height = edge + language.percentage/200;
        edge += language.percentage/100;
        const pixel = new Uint8Array(4);
        renderer.readRenderTargetPixels(target,256,Math.floor(height*512),1,1,pixel);
        return Array.from(pixel);
      });
      if(renderer.getContext().getError() !== 0) throw new Error('Palette WebGL error');
      return pixels;
    } finally {
      // The surface was moved into the isolated scene above.
      planet.add(planet.userData.surface);
      planet.dispose(); target.dispose(); renderer.dispose(); renderer.forceContextLoss();
    }
  });
  assert.equal(new Set(palettePixels.map(pixel=>pixel.slice(0,3).join(','))).size, 6);
  assert.ok(palettePixels.every(pixel=>pixel[3]===255 && Math.max(...pixel.slice(0,3))>0));

  // Exercise the integrated Home, including GPU resources and custom shaders.
  const procedural = await page.evaluate(async () => {
    const u = window.world;
    u.stop();
    const budget = (u.space.config.activeRadius * 2 + 1) ** 3;
    const project = u.planets[0].userData.project;
    const rock=[...u.space.chunks.values()].flatMap(chunk=>chunk.colliders)[0];
    if(rock) {
      u.origin.globalToLocal(rock.globalPosition,u.ship.position);u.ship.position.x-=rock.radius+2.9;
      u.ship.userData.velocity.set(90,0,0);u.space.collide(u.ship,u.origin.offset);
      u.space.animate(.1,u.camera,u.origin.offset);u.renderer.render(u.scene,u.camera);
      if(!u.space.destroyedAsteroidIds.has(rock.id))throw new Error('High speed impact did not destroy');
      u.space.animate(1.1,u.camera,u.origin.offset);
      if(u.space.fragments.slots.size)throw new Error('Fragments leaked');
    }

    const beforeOrbit = [...project.orbit];
    const geometries = [];
    const { containFlight, containCamera, insideWorld } = await import('/src/three/boundaries.js');
    const { WORLD } = await import('/shared/world-config.js');
    for (let axis of ['x','y','z']) for (let sign of [-1,1]) {
      const global=u.ship.position.clone().set(0,0,0);global[axis]=sign*(WORLD.max-20);
      u.origin.globalToLocal(global,u.ship.position);
      u.ship.userData.velocity.set(0,0,0);u.ship.userData.velocity[axis]=sign*90;
      for(let i=0;i<120;i++) {
        containFlight(u.ship,u.origin.offset,1/120);
        u.ship.position.addScaledVector(u.ship.userData.velocity,1/120);
        containFlight(u.ship,u.origin.offset,0);
      }
      if(!insideWorld(u.origin.localToGlobal(u.ship.position),19))throw new Error('Boundary crossed');
      u.camera.position.copy(u.ship.position);containCamera(u.camera,u.origin.offset);
      const target=u.camera.position.clone();target[axis]+=sign*100;u.camera.lookAt(target);
      u.rebaseWorld();u.space.animate(1,u.camera,u.origin.offset);
      u.renderer.render(u.scene,u.camera);
      geometries.push(u.renderer.info.memory.geometries);
      if(u.space.chunks.size!==budget)throw new Error('Unbounded chunk count');
      if(!u.space.background.position.equals(u.camera.position))throw new Error('Missing distant stars');
    }
    const teleported = u.teleportToPlanet(project.id);
    const localPlanet = u.planets.find(p => p.userData.project.id === project.id);
    localPlanet.update(0, u.camera.position);
    u.renderer.render(u.scene, u.camera);
    const result = { budget, teleported, beforeOrbit, afterOrbit: project.orbit, localDistance: localPlanet.position.distanceTo(u.ship.position), moonCount: localPlanet.moons.length, geometrySpread: Math.max(...geometries) - Math.min(...geometries), localShip: u.ship.position.length() };
    u.start();
    return result;
  });
  assert.ok(procedural.teleported);
  assert.deepEqual(procedural.beforeOrbit, procedural.afterOrbit);
  assert.equal(procedural.localShip, 0);
  assert.ok(procedural.localDistance < 250);
  assert.ok(procedural.moonCount <= 4);
  assert.ok(procedural.geometrySpread <= 3 + 2 * (await page.evaluate(() => window.world.planets.length)), 'GPU geometry count should stabilize during travel');

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyW");
  for (const label of [
    "Abrir Planetas em destaque",
    "Abrir Lua Social",
    "Abrir conta",
  ]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Fechar", exact: true }).waitFor();
    const paused = await page.evaluate(() => window.paused);
    await page.waitForTimeout(60);
    assert.deepEqual(
      await page.evaluate(() => window.snapshot(window.world)),
      paused,
    );
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.waitForFunction(() => window.world.running);
    assert.deepEqual(await page.evaluate(() => window.resumed), paused);
  }
  const moonInteraction = await page.evaluate(async () => {
    const { PlanetSystem } = await import('/src/three/planet-system.js');
    const u = window.world;
    const Vector3 = u.ship.position.constructor;
    u.stop();
    const actual = u.planets[0].userData.project;
    const planet = new PlanetSystem({ ...actual, languages: {HTML:40, Python:25, Go:25, Dockerfile:10}, languageBytes: {}, views: 1500 });
    const originalPlanets = u.planets;
    originalPlanets.forEach(p => p.visible = false);
    planet.userData.globalPosition = u.origin.localToGlobal(new Vector3());
    u.planets = [planet]; u.scene.add(planet);
    const moon = planet.moons[0];
    planet.updateMatrixWorld(true);
    const position = moon.getWorldPosition(new Vector3());
    u.camera.position.copy(position).add(new Vector3(0, 0, moon.userData.radius * 4));
    u.camera.lookAt(position); u.ship.position.copy(u.camera.position);
    u.controls.navigation = true;
    u.updateAim();
    let clicked;
    const callback = u.onLanguageClick;
    u.onLanguageClick = payload => clicked = payload;
    u.activateHit(u.moonAim);
    u.renderer.render(u.scene, u.camera);
    const tooltip = u.moonTooltip.textContent, visible = !u.moonTooltip.hidden;
    planet.update(0, new Vector3(10000,0,0)); u.updateAim();
    const hidden = u.moonTooltip.hidden;
    u.onLanguageClick = callback; u.controls.navigation = false;
    u.planets = originalPlanets; u.scene.remove(planet); planet.dispose();
    u.teleportToPlanet(actual.id); u.start();
    return {clicked, tooltip, visible, hidden};
  });
  assert.ok(moonInteraction.visible && moonInteraction.hidden);
  assert.equal(moonInteraction.clicked.percentage,25);
  assert.match(moonInteraction.tooltip, /25%/);

  // Render a close view, then exercise both collision types in the actual render loop.
  await page.evaluate(() => {
    const u = window.world;
    u.stop();
    const p = u.planets[0];
    u.camera.position
      .copy(p.position)
      .add({ x: 0, y: 0, z: p.userData.radius * 3 });
    u.camera.lookAt(p.position);
    u.renderer.render(u.scene, u.camera);
  });
  if (process.env.WORLD_SCREENSHOT)
    await page.screenshot({ path: process.env.WORLD_SCREENSHOT });
  await page.evaluate(() => {
    const u = window.world,
      p = u.planets[0];
    u.ship.position.copy(p.position);
    u.ship.position.x -= p.userData.radius + 2.95;
    u.ship.userData.velocity.set(20, 0, 0);
    u.ship.rotation.set(0, 0, 0);
    u.start();
  });
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(
      () =>
        window.world.ship.userData.velocity.x < 0 &&
        window.world.planets[0].userData.velocity.x > 0,
    ),
  );
  await page.evaluate(() => {
    const u = window.world;
    u.stop();
    const [a, b] = u.planets;
    a.position.set(0, 0, 0);
    b.position.set(a.userData.radius + b.userData.radius - 0.05, 0, 0);
    a.userData.velocity.set(15, 0, 0);
    b.userData.velocity.set(0, 0, 0);
    u.ship.position.set(-150, 0, 0);
    u.ship.userData.velocity.set(0, 0, 0);
    u.start();
  });
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(() => window.world.planets[1].userData.velocity.x > 0),
  );
  await initialize();
  assert.notDeepEqual(
    await page.evaluate(() => window.world.ship.position.toArray()),
    first,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: exact ship/camera/planet state across three navigation flows, random restart, rendered atmosphere, ship and planet collisions, zero console errors.",
  );
} finally {
  await browser?.close();
  vite.kill();
  server.kill();
  await Promise.all([
    new Promise((r) => vite.once("exit", r)),
    new Promise((r) => server.once("exit", r)),
  ]);
  await rm(temp, { recursive: true, force: true });
}
