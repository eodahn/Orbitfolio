// Run after npm run build: verifies the actual production HTTP responses without a browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temporary = await mkdtemp(join(tmpdir(), "orbit-assets-"));
const server = spawn(process.execPath, ["server.mjs"], {
  env: { ...process.env, PORT: "0", DATABASE_URL: "", NODE_ENV: "development", RENDER: "", SEED_DEMO: "false", SEED_SHOWCASE: "false", ORBITFOLIO_DATABASE_PATH: join(temporary, "test.sqlite") },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", chunk => { output += chunk; });
server.stderr.on("data", chunk => { output += chunk; });
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server startup timed out: " + output)), 10000);
    const poll = chunk => {
      const match = output.match(/Orbitfolio disponível em 0\.0\.0\.0:(\d+)/);
      if (match) { clearTimeout(timer); server.stdout.off("data", poll); resolve(match[1]); }
    };
    server.stdout.on("data", poll);
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${output}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const response = await fetch(base + "/");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  const js = html.match(/src="([^"]+\.js)"/)[1], css = html.match(/href="([^"]+\.css)"/)[1];
  assert.match(await (await fetch(base + js)).text(), /Home 3D iniciada com HUD da Dobra/);
  assert.match(await (await fetch(base + css)).text(), /\.warp-hud\{z-index:6/);
  for (const name of ["nave_orbt", "navedamulher"]) {
    const asset = await fetch(`${base}/models/${name}.glb`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get("content-type"), "model/gltf-binary");
    const data = Buffer.from(await asset.arrayBuffer());
    assert.equal(data.toString("ascii", 0, 4), "glTF");
    assert.deepEqual(data, await readFile(`public/models/${name}.glb`));
  }
  for (const path of ["/models/missing.glb", "/assets/missing.js"]) {
    const missing = await fetch(base + path);
    assert.equal(missing.status, 404);
    assert.match((await missing.json()).error, /Asset não encontrado/);
  }
  const route = await fetch(base + "/account");
  assert.equal(route.status, 200);
  assert.match(await route.text(), /<html/);
  console.log("PASS: production HTML/JS/CSS, both binary GLBs, missing-asset 404s and SPA routing.");
} finally {
  const exited = new Promise(resolve => server.once("exit", resolve));
  if (server.exitCode === null) { server.kill("SIGTERM"); await exited; }
  await rm(temporary, { recursive: true, force: true });
}
