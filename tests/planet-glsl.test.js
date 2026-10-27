import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderLib, ShaderChunk } from 'three';
import { PlanetSystem } from '../src/three/planet-system.js';

// Source-level regression only: this does not compile or validate WebGL.
function assertDirectiveLines(source) {
  for (const line of source.split('\n')) {
    if (line.includes('#')) assert.match(line, /^\s*#/, `GLSL directive glued to code: ${line}`);
  }
}

function expandIncludes(source) {
  return source.replace(/^[ \t]*#include +<([\w\d_]+)>/gm, (_, name) => {
    assert.equal(typeof ShaderChunk[name], 'string', `Missing Three.js chunk: ${name}`);
    return expandIncludes(ShaderChunk[name]);
  });
}

test('PlanetSystem keeps directives on separate lines in actual Three.js shader sources', () => {
  for (const languages of [null, {JavaScript:100}, {Python:100},
    {JavaScript:65, HTML:10, CSS:10, PowerShell:5, PostgreSQL:5, Prolog:5}]) {
    const planet = new PlanetSystem({id:'glsl-newlines', languages});
    try {
      const shaders = [planet.userData.atmosphere.material];
      for (const mesh of [planet.userData.surface, ...planet.moons]) {
        const shader = {
          uniforms: {},
          vertexShader: ShaderLib.standard.vertexShader,
          fragmentShader: ShaderLib.standard.fragmentShader,
        };
        mesh.material.onBeforeCompile(shader);
        shaders.push(shader);
      }
      for (const shader of shaders) {
        for (const source of [shader.vertexShader, shader.fragmentShader]) {
          assertDirectiveLines(source);
          assertDirectiveLines(expandIncludes(source));
        }
      }
    } finally { planet.dispose(); }
  }
});

test('directive regression rejects glued preprocessor directives', () => {
  for (const directive of ['define STANDARD', 'include <common>', 'ifdef USE_FOG', 'endif']) {
    assert.throws(() => assertDirectiveLines(`return x;}#${directive}\n`));
    assertDirectiveLines(`return x;}\n#${directive}\n`);
  }
});
