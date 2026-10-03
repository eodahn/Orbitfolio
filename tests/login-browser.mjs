import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const directory = await mkdtemp(join(tmpdir(), "orbit-login-"));
const base = "http://127.0.0.1:3094";
let server, browser;
async function start() {
  server = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      PORT: "3094",
      APP_ORIGIN: base,
      SEED_DEMO: "false",
      GITHUB_CLIENT_ID: "test-client",
      GITHUB_CLIENT_SECRET: "test-secret",
      GITHUB_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
      GITHUB_CALLBACK_URL: base + "/api/github/callback",
      ORBITFOLIO_DATABASE_PATH: join(directory, "persist", "accounts.sqlite"),
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Server did not start");
}
async function stop() {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
}
try {
  await start();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/register");
  await page
    .getByLabel("Nome de exibição", {
      exact: true,
    })
    .fill("Conta Persistente");
  await page
    .getByLabel("E-mail", {
      exact: true,
    })
    .fill("persistent@test.local");
  await page.getByLabel("Username", { exact: true }).fill("conta-persistente");
  await page
    .getByLabel("Senha", {
      exact: true,
    })
    .fill("test-password");
  await page
    .getByRole("button", {
      name: "Criar conta",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", {
      name: "Conta Persistente",
      exact: true,
    })
    .waitFor();
  await stop();
  await start();
  await page.reload();
  await page
    .getByRole("heading", {
      name: "Conta Persistente",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Sair",
      exact: true,
    })
    .click();
  await page.goto(base + "/login");
  await page
    .getByLabel("E-mail", {
      exact: true,
    })
    .fill("persistent@test.local");
  await page
    .getByLabel("Senha", {
      exact: true,
    })
    .fill("wrong-password");
  const invalid = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/login"),
  );
  await page
    .getByRole("button", {
      name: "Entrar",
      exact: true,
    })
    .click();
  assert.equal((await invalid).status(), 401);
  await page
    .getByRole("alert")
    .filter({
      hasText: "Use os dados cadastrados no Orbitfolio",
    })
    .waitFor();
  await page
    .getByLabel("Senha", {
      exact: true,
    })
    .fill("test-password");
  const valid = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/login"),
  );
  await page
    .getByRole("button", {
      name: "Entrar",
      exact: true,
    })
    .click();
  assert.equal((await valid).status(), 200);
  await page
    .getByRole("heading", {
      name: "Conta Persistente",
      exact: true,
    })
    .waitFor();
  const session = await page.request.get(base + "/api/auth/session");
  const user = (await session.json()).user;
  const created = await page.request.post(base + "/api/projects", {
    data: {
      name: "Planeta de navegação",
      demoUrl: "https://example.com",
    },
  });
  const project = (await created.json()).project;
  for (const route of [
    "/favorites",
    "/account",
    "/projects",
    "/progress",
    "/user/" + user.id,
    "/project/" + project.id,
    "/social",
    "/search",
  ]) {
    await page.goto(base + "/account");
    await page.goto(base + route);
    await page
      .getByRole("button", {
        name: "Fechar",
        exact: true,
      })
      .click();
    await page.locator("#universe-canvas").waitFor();
    assert.equal(new URL(page.url()).pathname, "/");
  }
  await page.goto(base + "/projects/new");
  await page
    .getByRole("button", {
      name: "Integrar com GitHub",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Conectar com GitHub",
      exact: true,
    })
    .waitFor();
  // Inspect the real redirect without following it: this environment cannot reach
  // GitHub, and Playwright routing only intercepts the first request in a redirect chain.
  let destination;
  await page.route(base + "/api/github/auth", async (route) => {
    const redirect = await route.fetch({
      maxRedirects: 0,
    });
    assert.equal(redirect.status(), 303);
    destination = new URL(redirect.headers().location);
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "OAuth redirect verified by test.",
    });
  });
  await page
    .getByRole("button", {
      name: "Conectar com GitHub",
      exact: true,
    })
    .click();
  await page
    .getByText("OAuth redirect verified by test.", {
      exact: true,
    })
    .waitFor();
  assert.equal(destination.hostname, "github.com");
  assert.equal(
    destination.searchParams.get("redirect_uri"),
    base + "/api/github/callback",
  );
  assert.ok(destination.searchParams.get("state"));
  assert.equal(destination.searchParams.has("client_secret"), false);
  const denied = await page.request.get(
    base +
      "/api/github/callback?error=access_denied&state=" +
      encodeURIComponent(destination.searchParams.get("state")),
    {
      maxRedirects: 0,
    },
  );
  assert.equal(denied.status(), 303);
  assert.match(denied.headers().location, /reason=cancelled/);
  await page.goto(base + denied.headers().location);
  await page
    .getByRole("alert")
    .filter({
      hasText: "Você cancelou",
    })
    .waitFor();
  const unknown = await page.request.get(
    base + "/api/github/callback?code=bad&state=wrong",
    {
      maxRedirects: 0,
    },
  );
  assert.match(unknown.headers().location, /reason=invalid_state/);
  const status = await (
    await page.request.get(base + "/api/github/status")
  ).json();
  assert.equal(status.connected, false);
  assert.equal(JSON.stringify(status).includes("test-secret"), false);
  const anon = await browser.newContext();
  assert.equal(
    (
      await anon.request.get(base + "/api/github/auth", {
        maxRedirects: 0,
      })
    ).status(),
    401,
  );
  await anon.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: persisted account/session after restart, logout, login 401/200, X to Home, official OAuth redirect, cancellation, invalid state and anonymous denial.",
  );
} finally {
  await browser?.close();
  await stop();
  await rm(directory, {
    recursive: true,
    force: true,
  });
}
