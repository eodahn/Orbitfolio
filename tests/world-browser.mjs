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
  const first = await page.evaluate(() => window.world.ship.position.toArray());
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
