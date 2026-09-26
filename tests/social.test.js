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

test("mutual follows, privacy for every category, owner access, editing and byte metadata", () => {
  const db = openDatabase(":memory:");
  const a = register(db, {
    name: "Alice Teste",
    email: "alice@test.local",
    password: "test-password",
  });
  const b = register(db, {
    name: "Bruno Teste",
    email: "bruno@test.local",
    password: "test-password",
  });
  const c = register(db, {
    name: "Carla Teste",
    email: "carla@test.local",
    password: "test-password",
  });
  const follows = (from, to, active = true) =>
    setRelation(
      db,
      "follows",
      ["follower_id", "followed_id"],
      [from.id, to.id],
      active,
    );
  follows(a, b);
  assert.equal(publicUser(db, b, a.id).isFriend, false);
  follows(b, a);
  follows(c, a);
  const project = createProject(db, a, {
    name: "Planeta teste",
    description: "Projeto para os testes sociais",
    languages: { JavaScript: 100 },
    sizeBytes: 2147483648,
  });
  assert.equal(publicProject(db, project, a.id).sizeBytes, 2147483648);
  for (const table of ["project_likes", "favorites"])
    setRelation(db, table, ["user_id", "project_id"], [a.id, project.id], true);
  assert.deepEqual(
    profileSection(db, a.id, "friends", a.id).users.map((u) => u.id),
    [b.id],
  );
  assert.equal(publicUser(db, a, a.id).followers, 2);
  assert.equal(publicUser(db, a, a.id).followingCount, 1);
  assert.equal(publicUser(db, a, a.id).friends, 1);
  for (const category of [
    "followers",
    "following",
    "friends",
    "likes",
    "favorites",
  ]) {
    assert.ok(
      Object.values(profileSection(db, a.id, category, b.id))[0].length,
    );
    updatePrivacy(db, a, { [category]: "private" });
    assert.ok(
      Object.values(profileSection(db, a.id, category, a.id))[0].length,
    );
    for (const viewer of [b.id, null])
      assert.throws(
        () => profileSection(db, a.id, category, viewer),
        (e) => e.status === 403,
      );
    assert.equal(publicUser(db, a, b.id).visibility[category], false);
    assert.equal(publicUser(db, a, a.id).visibility[category], true);
  }
  const visitor = publicUser(db, a, b.id);
  assert.equal(visitor.followers, null);
  assert.equal(visitor.followingCount, null);
  assert.equal(visitor.friends, null);
  assert.equal(visitor.privacy, undefined);
  assert.throws(
    () => updatePrivacy(db, null, { friends: "public" }),
    (e) => e.status === 401,
  );
  assert.throws(
    () => updatePrivacy(db, a, { friends: "everyone" }),
    (e) => e.status === 422,
  );
  assert.throws(
    () =>
      updateProfile(db, b, {
        name: "Bruno",
        username: publicUser(db, a, a.id).username,
        bio: "",
      }),
    (e) => e.status === 409,
  );
  const edited = updateProfile(db, a, {
    name: "Alice Nova",
    username: "alice-nova",
    bio: "Meu perfil",
    avatarUrl: "https://example.com/avatar.png",
  });
  assert.equal(edited.username, "alice-nova");
  follows(b, a, false);
  assert.equal(publicUser(db, a, a.id).friends, 0);
  assert.equal(publicUser(db, b, a.id).isFriend, false);
  assert.equal(profileSection(db, a.id, "friends", a.id).users.length, 0);
  db.close();
});
