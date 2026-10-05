import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlanetSystem } from '../src/three/planet-system.js';
import { LANGUAGE_COLORS, languageColor } from '../src/three/project-languages.js';

const composition = { JavaScript:65, HTML:10, CSS:10, PowerShell:5, PostgreSQL:5, Prolog:5 };
function compile(planet) {
  const shader = { uniforms:{}, vertexShader:'#include <begin_vertex>', fragmentShader:'#include <color_fragment>' };
  planet.userData.surface.material.onBeforeCompile(shader);
  return shader;
}

test('all six languages reach the surface shader with proportional spherical area', () => {
  const planet = new PlanetSystem({ id:'six-languages', languages:composition });
  try {
    const shader = compile(planet), edges = shader.uniforms.biomeEdges.value;
    assert.equal(shader.uniforms.biomeColors.value.length, 6);
    assert.equal(edges.length, 5);
    assert.match(shader.fragmentShader, /uniform float biomeEdges\[5\]/);
    assert.doesNotMatch(shader.fragmentShader, /biomeEdges\[6\]/);
    assert.match(shader.fragmentShader, /normalize\(planetPosition\)\.y\*\.5\+\.5/);
    // Equally spaced heights sample equal areas on a sphere, independent of seed.
    const counts = Array(6).fill(0);
    for (let i=0; i<10000; i++) {
      const height = (i+.5)/10000;
      const index = edges.filter(edge => height >= edge).length;
      counts[index]++;
    }
    planet.languages.languages.forEach((language, index) => {
      assert.equal(counts[index]/100, composition[language.name === 'prolog' ? 'Prolog' : language.name]);
      assert.equal(shader.uniforms.biomeColors.value[index].getHexString(), new THREE.Color(languageColor(language.name)).getHexString());
    });
    assert.equal(planet.rings[0].userData.technology, 'PowerShell');
    assert.ok(Math.abs(planet.rings[0].userData.percentage - 5) < 1e-10);
  } finally { planet.dispose(); }
});

test('only empty compositions use the generic material; named languages get colors', () => {
  for (const languages of [null, [], {}, undefined, ['Prolog'], {NewLanguage:100}, {JavaScript:0, CSS:0}]) {
    const planet = new PlanetSystem({ id:'fallback', languages });
    try {
      const shader = compile(planet);
      if (!planet.languages.languages.length) {
        assert.equal(planet.userData.surface.material.color.getHexString(), new THREE.Color(LANGUAGE_COLORS.Unknown).getHexString());
        assert.doesNotMatch(shader.fragmentShader, /uniform vec3 biomeColors/);
      } else {
        assert.equal(shader.uniforms.biomeColors.value.length, planet.languages.languages.length);
        assert.match(shader.fragmentShader, /diffuseColor.rgb= pigment/);
        assert.notEqual(shader.uniforms.biomeColors.value[0].getHexString(), new THREE.Color(LANGUAGE_COLORS.Unknown).getHexString());
      }
      assert.doesNotMatch(shader.fragmentShader, /uniform float biomeEdges\[0\]/);
    } finally { planet.dispose(); }
  }
});

test('configuration ring areas follow their relative percentages', () => {
  const planet = new PlanetSystem({id:'rings', languages:{JavaScript:60,PowerShell:10,Shell:30}});
  try {
    const areas = planet.rings.map(ring => {
      const {innerRadius,outerRadius} = ring.geometry.parameters;
      return { name:ring.userData.technology, area:outerRadius**2-innerRadius**2 };
    });
    const ratio = areas.find(r=>r.name==='Shell').area / areas.find(r=>r.name==='PowerShell').area;
    assert.ok(Math.abs(ratio-3)<1e-10);
  } finally { planet.dispose(); }
});
