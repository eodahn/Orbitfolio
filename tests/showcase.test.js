import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { SHOWCASE,seedShowcase } from '../server/showcase.js';
import { publicProject, publicUser } from '../server/app.js';
import { projectLinks, safeHttpUrl } from '../shared/project-links.js';
import { searchAll } from '../server/search.js';
import { insideWorld } from '../src/three/boundaries.js';
import { PlanetSystem } from '../src/three/planet-system.js';
import { Vector3 } from 'three';
test('showcase seed is idempotent: exactly 3 demo users/projects, verified bytes, valid links, no password or fake OAuth',async()=>{
  const db=openDatabase(':memory:');
  try {
    await seedShowcase(db);await seedShowcase(db);
    const users=await db.prepare('SELECT * FROM users').all(),projects=await db.prepare('SELECT * FROM projects').all();
    assert.equal(users.length,3);assert.equal(projects.length,3);
    for(const record of SHOWCASE) {
      const user=users.find(u=>u.id===record.id);assert.ok(user.is_demo);assert.equal(user.password_hash,null);
      const owned=projects.filter(p=>p.owner_id===user.id);assert.equal(owned.length,1);
      const p=await publicProject(db,owned[0]);assert.equal(p.github.integrationEnabled,false);assert.equal(p.owner.isDemo,true);
      assert.ok(safeHttpUrl(p.externalUrl));assert.equal(projectLinks(p).primary,p.externalUrl);assert.match(p.repositoryUrl,/^https:\/\/github.com\//);
      assert.ok(Object.keys(p.languages).length>0);assert.deepEqual(p.languageBytes,record.languageBytes);
      assert.ok(Math.abs(Object.values(p.languages).reduce((a,b)=>a+b,0)-100)<1e-10);
      for(const [name,bytes] of Object.entries(record.languageBytes))assert.equal(p.languages[name],bytes/Object.values(record.languageBytes).reduce((a,b)=>a+b,0)*100);
      const planet=new PlanetSystem(p);assert.ok(insideWorld(new Vector3(...p.orbit),planet.userData.visualRadius));planet.dispose();
      assert.equal((await publicUser(db,user)).projects,1);
      const found=await searchAll(db,record.name,null);assert.ok(found.users.some(u=>u.id===record.id));
    }
  } finally {db.close();}
});
test('seed never attaches projects to an existing non-demo username',async()=>{
  const db=openDatabase(':memory:');try {
    await db.prepare('INSERT INTO users(id,name,username,email) VALUES(?,?,?,?)').run('real-user','Real User',SHOWCASE[0].username,'real@example.com');
    const result=await seedShowcase(db);assert.ok(result.skipped.includes(SHOWCASE[0].id));
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM projects WHERE owner_id=?').get('real-user')).count,0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM projects').get()).count,2);
  } finally {db.close();}
});
