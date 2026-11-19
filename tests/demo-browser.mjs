import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const password = await readFile(new URL("../data/school-demo.key", import.meta.url), "utf8");
const baseURL = "http://127.0.0.1:5173";
const health = await (await fetch(baseURL + "/api/health")).json();
assert.equal(
  health.schoolDemo,
  true,
  "Inicie a demonstração com npm run demo.",
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage({
    baseURL,
    viewport: { width: 1920, height: 1080 },
    locale: "pt-BR",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(baseURL) && r.status() >= 400)
      errors.push(r.status() + " " + r.url());
  });
  await mkdir("artifacts/screenshots", { recursive: true });
  async function capture(name, selector) {
    await page.locator(selector).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images].every((i) => i.complete && i.naturalWidth),
    );
    assert.equal(
      await page
        .locator(".fatal-state,dialog[open],[role=alert]:not(:empty)")
        .count(),
      0,
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll("canvas[data-planet]")]
        .filter((c) => {
          const r = c.getBoundingClientRect();
          return r.bottom > 0 && r.top < innerHeight;
        })
        .every((c) => c.dataset.rendered === "true"),
    );
    await page.screenshot({
      path: "artifacts/screenshots/" + name + ".png",
      timeout: 60000,
    });
  }
  await page.goto("/register");
  await page.locator("[name=name]").fill("Luna Silva");
  await page.locator("[name=username]").fill("luna-silva");
  await page.locator("[name=email]").fill("luna@demo.local");
  await page.locator("[name=password]").fill(password);
  await capture("cadastro", "[data-auth]");
  await page.goto("/login");
  await page.locator("[name=email]").fill("eodahn@demo.local");
  await page.locator("[name=password]").fill(password);
  await capture("login", "[data-auth]");
  await page
    .locator("form button[type=submit],form button:not([type])")
    .first()
    .click();
  await page.waitForURL("**/account");
  for (const [name, path, selector] of [
    ["universo", "/?planet=orbitfolio", "#universe-canvas"],
    ["explorar", "/explore", ".project-card"],
    ["projetos", "/projects", ".project-card"],
    ["progresso", "/progress?project=orbitfolio", ".commit-node"],
    ["favoritos", "/favorites", ".project-card"],
    ["conta", "/account", ".project-card"],
    ...[
      "followers",
      "following",
      "friends",
      "likes",
      "favorites",
      "privacy",
      "edit",
    ].map((tab) => [
      "conta-" + tab,
      "/account?tab=" + tab,
      ["edit", "privacy"].includes(tab) ? "form" : ".project-card",
    ]),
    ["pesquisa", "/search?q=orbit", "[data-results] .project-card"],
    ["destaque", "/featured", ".project-card"],
    ["lua-social", "/social", ".user-card"],
    ["perfil", "/user/u1", ".project-card"],
    ["detalhes", "/project/orbitfolio", ".language-bars"],
    ["privado", "/project/laboratorio", ".language-bars"],
    ["criar", "/projects/new", "[data-manual]"],
  ]) {
    await page.goto(path);
    if (name === "universo") {
      await page.waitForURL(baseURL + "/");
      await page.waitForFunction(
        () => !!document.querySelector("canvas")?.getContext("webgl2"),
      );
    }
    await capture(name, selector);
  }
  await page.locator("[data-github]").click();
  await capture("repositorios", "[data-repository]");
  await page.locator('[data-repository="eodahn/Orbitfolio"]').click();
  await page.locator("[data-project-form]").waitFor();
  assert.equal(
    await page.locator("[name=githubUrl]").inputValue(),
    "https://github.com/eodahn/Orbitfolio",
  );
  await page.locator("[name=name]").fill("Importação de ensaio");
  await page.locator("[data-project-form] button[type=submit]").click();
  await page.waitForURL("**/project/*");
  await page.locator("[data-commits]").click();
  await page.locator(".commit-node").first().waitFor();
  await page.locator("[data-delete]").click();
  await page.locator('dialog button[value="delete"]').click();
  await page.waitForURL("**/projects");
  await page.goto("/projects/new");
  await page.locator("[data-manual]").click();
  await page.locator("[data-custom]").click();
  const title = "Ensaio de apresentação";
  await page.locator("[name=name]").fill(title);
  await page
    .locator("[name=description]")
    .fill("Projeto temporário criado pelo roteiro de apresentação.");
  await page.locator("[name=demoUrl]").fill(baseURL);
  await capture("criar-preenchido", "[data-project-form]");
  await page.locator("[data-project-form] button[type=submit]").click();
  await page.waitForURL("**/project/*");
  const detail = page.url();
  for (const attr of ["like", "favorite"]) {
    await page.locator("[data-" + attr + "]").click();
    await page
      .getByRole("button", {
        name: attr === "like" ? "Descurtir" : "Remover favorito",
        exact: true,
      })
      .waitFor();
  }
  await page.goto("/favorites");
  await page.getByText(title, { exact: true }).first().waitFor();
  await page.goto(detail);
  await page.locator("[data-delete]").click();
  await page
    .locator("dialog button,[role=dialog] button")
    .filter({ hasText: /Excluir|Confirmar/ })
    .last()
    .click();
  await page.waitForURL("**/projects");
  await page.goto("/user/u1");
  const follow = page.locator("[data-follow]");
  await follow.click();
  await page.getByRole("button", { name: "Seguir", exact: true }).click();
  await page
    .getByRole("button", { name: "Deixar de seguir", exact: true })
    .waitFor();
  await page.goto("/account?tab=privacy");
  await page.locator("select[name=friends]").selectOption("private");
  await page.getByRole("button", { name: "Salvar privacidade" }).click();
  await page.waitForFunction(() =>
    document.querySelector("#toast-region")?.textContent.trim(),
  );
  await page.reload();
  assert.equal(
    await page.locator("select[name=friends]").inputValue(),
    "private",
  );
  await page.locator("select[name=friends]").selectOption("public");
  await page.getByRole("button", { name: "Salvar privacidade" }).click();
  await page.waitForFunction(() =>
    document.querySelector("#toast-region")?.textContent.trim(),
  );
  const guest = await browser.newContext({ baseURL });
  const publicList = await (await guest.request.get("/api/projects")).json();
  assert.ok(!publicList.projects.some((p) => p.id === "laboratorio"));
  await guest.close();
  assert.deepEqual(errors, []);
  console.log("Capturas e interações verificadas em artifacts/screenshots/");
} finally {
  await browser.close();
}
