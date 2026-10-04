import assert from "node:assert/strict";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { register, login, createProject, publicUser } from "../server/app.js";
import { updateProfile } from "../server/social.js";
import { searchAll } from "../server/search.js";
import {
  validateAvatar,
  saveAvatar,
  AVATAR_MAX_BYTES,
} from "../server/avatars.js";
import { seedShowcase } from "../server/showcase.js";
export async function featureContracts(db) {
  const input = {
    name: "Nome repetido",
    username: "new-account",
    email: "new@test.local",
    password: "test-password",
  };
  const user = await register(db, input);
  await register(db, {
    ...input,
    username: "another-account",
    email: "another@test.local",
  });
  await assert.rejects(
    () =>
      register(db, {
        ...input,
        username: "NEW-ACCOUNT",
        email: "uppercase@test.local",
      }),
    (e) => e.status === 409,
  );
  const races = await Promise.allSettled(
    ["one", "two"].map((n) =>
      register(db, {
        ...input,
        username: "race-account",
        email: `race-${n}@test.local`,
      }),
    ),
  );
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(races.find((r) => r.status === "rejected").reason.status, 409);
  for (const change of [
    { name: "x".repeat(51) },
    { username: "x".repeat(51) },
  ]) {
    await assert.rejects(
      () => register(db, { ...input, ...change, email: "limit@test.local" }),
      (e) => e.status === 422,
    );
    await assert.rejects(
      () => updateProfile(db, user, { ...input, ...change }),
      (e) => e.status === 422,
    );
  }
  await assert.rejects(
    () => updateProfile(db, user, { ...input, username: "ANOTHER-ACCOUNT" }),
    (e) => e.status === 409,
  );
  assert.ok(
    (await searchAll(db, "nome repetido")).users.some((u) => u.id === user.id),
  );
  assert.ok(
    (await searchAll(db, "new-account")).users.some((u) => u.id === user.id),
  );
  for (const change of [
    { name: "x".repeat(51) },
    { description: "x".repeat(351) },
    { languages: { ["x".repeat(51)]: null } },
  ])
    await assert.rejects(
      () =>
        createProject(db, user, {
          name: "Limites",
          demoUrl: "https://example.com",
          ...change,
        }),
      (e) => e.status === 422,
    );
  for (const [format, mime] of [
    ["png", "image/png"],
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
  ]) {
    const file = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#7836fa" },
    })
      [format]()
      .toBuffer();
    assert.equal(await validateAvatar(file, mime), mime);
    await assert.rejects(
      () => validateAvatar(file, "image/gif"),
      (e) => e.status === 422,
    );
  }
  await assert.rejects(
    () => validateAvatar(Buffer.from("fake PNG renamed .png"), "image/png"),
    (e) => e.status === 422,
  );
  await assert.rejects(
    () => validateAvatar(Buffer.alloc(AVATAR_MAX_BYTES + 1), "image/png"),
    (e) => e.status === 413,
  );
  await assert.rejects(
    () => validateAvatar(Buffer.from("svg"), "image/svg+xml"),
    (e) => e.status === 422,
  );
  const gif = readFileSync(
    new URL("./fixtures/avatar-animated.gif", import.meta.url),
  );
  assert.equal((await sharp(gif, { animated: true }).metadata()).pages, 2);
  await saveAvatar(db, user, {
    file: gif,
    mime: "image/gif",
    fields: { zoom: 2, offsetX: 20, offsetY: 80 },
  });
  const row = await db
    .prepare("SELECT * FROM user_avatars WHERE user_id=?")
    .get(user.id);
  assert.deepEqual(Buffer.from(row.data), gif);
  assert.equal(row.mime_type, "image/gif");
  const profile = await publicUser(db, user, user.id);
  assert.equal(profile.avatarZoom, 2);
  assert.equal(profile.avatarOffsetX, 20);
  assert.equal(profile.avatarOffsetY, 80);
  await seedShowcase(db);
  await seedShowcase(db);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE username='bruno-simon'",
        )
        .get()
    ).count,
    1,
  );
  const demo = await db
    .prepare("SELECT * FROM projects WHERE id='demo-folio-2019'")
    .get();
  assert.equal(demo.demo_url, "https://2019.bruno-simon.com");
  assert.equal(demo.github_url, "https://github.com/brunosimon/folio-2019");
  assert.equal(demo.github_private, 0);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM projects WHERE id='demo-folio-2019'",
        )
        .get()
    ).count,
    1,
  );
  await assert.rejects(
    () =>
      login(db, {
        email: "bruno-simon@demo.orbitfolio.invalid",
        password: "12345678",
      }),
    (e) => e.status === 401,
  );
  console.log(
    "PASS feature contracts: usernames/races/display names, limits, search, PNG/JPEG/WebP/GIF, forged/oversized files, animated bytes/framing, idempotent demo with correct links and disabled login.",
  );
  return { user, gif };
}
