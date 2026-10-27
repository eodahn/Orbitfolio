import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/db.js";
import {
  register,
  publicUser,
  setRelation,
  createProject,
  publicProject,
} from "../server/app.js";
import {
  profileSection,
  updatePrivacy,
  updateProfile,
} from "../server/social.js";
test("mutual follows, privacy for every category, owner access, editing and byte metadata", async () => {
  const db = openDatabase(":memory:");
  const a = await register(db, {
    name: "Alice Teste",
    email: "alice@test.local",
    password: "test-password",
    username: "alice@test.local"
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .padEnd(3, "x"),
  });
  const b = await register(db, {
    name: "Bruno Teste",
    email: "bruno@test.local",
    password: "test-password",
    username: "bruno@test.local"
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .padEnd(3, "x"),
  });
  const c = await register(db, {
    name: "Carla Teste",
    email: "carla@test.local",
    password: "test-password",
    username: "carla@test.local"
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .padEnd(3, "x"),
  });
  const follows = async (from, to, active = true) =>
    await setRelation(
      db,
      "follows",
      ["follower_id", "followed_id"],
      [from.id, to.id],
      active,
    );
  await follows(a, b);
  assert.equal((await publicUser(db, b, a.id)).isFriend, false);
  await follows(b, a);
  await follows(c, a);
  const project = await createProject(db, a, {
    name: "Planeta teste",
    demoUrl: "https://example.com/project",
    description: "Projeto para os testes sociais",
    languages: {
      JavaScript: 100,
    },
    sizeBytes: 2147483648,
  });
  assert.equal((await publicProject(db, project, a.id)).sizeBytes, 2147483648);
  assert.deepEqual((await publicProject(db, { ...project, language_bytes_json: JSON.stringify({HTML:300,CSS:100}) }, a.id)).languageBytes, {HTML:300,CSS:100});
  for (const table of ["project_likes", "favorites"])
    await setRelation(
      db,
      table,
      ["user_id", "project_id"],
      [a.id, project.id],
      true,
    );
  assert.deepEqual(
    (await profileSection(db, a.id, "friends", a.id)).users.map((u) => u.id),
    [b.id],
  );
  assert.equal((await publicUser(db, a, a.id)).followers, 2);
  assert.equal((await publicUser(db, a, a.id)).followingCount, 1);
  assert.equal((await publicUser(db, a, a.id)).friends, 1);
  for (const category of [
    "followers",
    "following",
    "friends",
    "likes",
    "favorites",
  ]) {
    assert.ok(
      Object.values(await profileSection(db, a.id, category, b.id))[0].length,
    );
    await updatePrivacy(db, a, {
      [category]: "private",
    });
    assert.ok(
      Object.values(await profileSection(db, a.id, category, a.id))[0].length,
    );
    for (const viewer of [b.id, null])
      await assert.rejects(
        async () => await profileSection(db, a.id, category, viewer),
        (e) => e.status === 403,
      );
    assert.equal((await publicUser(db, a, b.id)).visibility[category], false);
    assert.equal((await publicUser(db, a, a.id)).visibility[category], true);
  }
  const visitor = await publicUser(db, a, b.id);
  assert.equal(visitor.followers, null);
  assert.equal(visitor.followingCount, null);
  assert.equal(visitor.friends, null);
  assert.equal(visitor.privacy, undefined);
  await assert.rejects(
    async () =>
      await updatePrivacy(db, null, {
        friends: "public",
      }),
    (e) => e.status === 401,
  );
  await assert.rejects(
    async () =>
      await updatePrivacy(db, a, {
        friends: "everyone",
      }),
    (e) => e.status === 422,
  );
  await assert.rejects(
    async () =>
      await updateProfile(db, b, {
        name: "Bruno",
        username: (await publicUser(db, a, a.id)).username,
        bio: "",
      }),
    (e) => e.status === 409,
  );
  const edited = await updateProfile(db, a, {
    name: "Alice Nova",
    username: "alice-nova",
    bio: "Meu perfil",
    avatarUrl: "https://example.com/avatar.png",
  });
  assert.equal(edited.username, "alice-nova");
  await follows(b, a, false);
  assert.equal((await publicUser(db, a, a.id)).friends, 0);
  assert.equal((await publicUser(db, b, a.id)).isFriend, false);
  assert.equal(
    (await profileSection(db, a.id, "friends", a.id)).users.length,
    0,
  );
  db.close();
});
