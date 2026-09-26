import test from "node:test";
import assert from "node:assert/strict";
import { Vector3, Group } from "three";
import {
  WORLD,
  projectRadius,
  planetMass,
  availablePosition,
} from "../src/three/world.js";
import {
  resolveCollision,
  stepPhysics,
  collisionPairs,
} from "../src/three/physics.js";
import { createShip } from "../src/three/ship.js";
import { Box3 } from "three";
const body = (x, radius, mass, velocity = 0) => ({
  position: new Vector3(x, 0, 0),
  userData: { radius, mass, velocity: new Vector3(velocity, 0, 0) },
});
test("ship and planets exchange momentum, separate and retain inertia", () => {
  const a = body(0, 3, 10, 20),
    b = body(8, 6, 30),
    momentum = 200;
  assert.equal(resolveCollision(a, b), true);
  assert.ok(a.userData.velocity.x < 0);
  assert.ok(b.userData.velocity.x > 0);
  assert.ok(
    Math.abs(
      a.userData.velocity.x * 10 + b.userData.velocity.x * 30 - momentum,
    ) < 1e-8,
  );
  const velocity = b.userData.velocity.x,
    position = b.position.x;
  stepPhysics([a, b], 0.5);
  assert.ok(b.position.x > position);
  assert.equal(b.userData.velocity.x, velocity);
  assert.ok(a.position.distanceTo(b.position) > 8.99);
});
test("planet collisions and world containment remain finite", () => {
  const a = body(0, 6, 30, 10),
    b = body(11, 12, 240);
  resolveCollision(a, b);
  assert.ok(b.userData.velocity.x > 0);
  assert.ok(a.userData.velocity.x < 0);
  const overlap = body(0, 6, 30);
  resolveCollision(a, overlap);
  assert.ok(Number.isFinite(a.position.x));
  const edge = body(WORLD.max - 3, 3, 10, 20);
  stepPhysics([edge], 1);
  assert.ok(edge.position.x <= WORLD.max - 3);
  assert.ok(edge.userData.velocity.x < 0);
});
test("size grows logarithmically, minimum exceeds twice ship length, and mass scales with volume", () => {
  const size = new Box3().setFromObject(createShip()).getSize(new Vector3());
  assert.ok(2 * projectRadius(0) > 2 * Math.max(size.x, size.y, size.z));
  assert.ok(projectRadius(10e6) < projectRadius(1e9));
  assert.equal(projectRadius(1e15), WORLD.maxRadius);
  assert.equal(planetMass(12) / planetMass(6), 8);
});
test("placement fills XYZ without overlaps; spatial hash retains all overlapping pairs", () => {
  const bodies = [];
  for (let i = 0; i < 100; i++) {
    const b = body(0, 6 + (i % 20), 30);
    b.position = availablePosition(b.userData.radius, bodies);
    assert.ok(b.position);
    for (const other of bodies)
      assert.ok(
        b.position.distanceTo(other.position) >
          b.userData.radius + other.userData.radius + WORLD.margin,
      );
    bodies.push(b);
  }
  for (const axis of ["x", "y", "z"]) {
    assert.ok(bodies.some((b) => b.position[axis] < -100));
    assert.ok(bodies.some((b) => b.position[axis] > 100));
  }
  const pair = [body(0, 6, 30), body(11, 6, 30)];
  assert.equal(collisionPairs(pair).length, 1);
});
