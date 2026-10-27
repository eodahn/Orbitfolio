import assert from 'node:assert/strict';

// Real browser input against the existing Home; no replacement Pointer Lock API.
export async function testPointerLock(page) {
  async function clickGalaxy() {
    const point = await page.evaluate(async () => {
      const { pickPlanetSystem } = await import('/src/three/planet-interaction.js');
      const u = window.world, rect = u.canvas.getBoundingClientRect();
      for (const y of [.8,.6,.4,.2]) for (const x of [.8,.6,.4,.2]) {
        const clientX = rect.left + rect.width*x, clientY = rect.top + rect.height*y;
        if (document.elementFromPoint(clientX,clientY) !== u.canvas) continue;
        const pointer = u.pointer.clone().set(x*2-1,1-y*2);
        if (!pickPlanetSystem(u.camera,u.planets,u.ship.position,u.raycaster,pointer,false))
          return {x:clientX,y:clientY};
      }
      throw new Error('No unobstructed galaxy point available for Pointer Lock test');
    });
    await page.mouse.click(point.x,point.y);
    await page.waitForFunction(() => document.pointerLockElement === window.world.canvas && window.world.controls.navigation);
    return point;
  }
  for (let i=0; i<3; i++) {
    const point = await clickGalaxy();
    const yaw = await page.evaluate(() => window.world.controls.yaw);
    await page.mouse.move(point.x+12,point.y+5);
    await page.waitForFunction(previous => window.world.controls.yaw !== previous,yaw);
    for (const key of ['KeyW','ShiftLeft','ControlLeft']) await page.keyboard.down(key);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.pointerLockElement === null && !window.world.controls.navigation);
    assert.equal(await page.evaluate(() => window.world.controls.keys.size),0);
    for (const key of ['KeyW','ShiftLeft','ControlLeft']) await page.keyboard.up(key);
  }
  await clickGalaxy();
  // Exercise the same UI entry point used by links, while the real pointer is locked.
  await page.evaluate(async () => {
    const { navigate } = await import('/src/router/router.js');
    await navigate('/account');
  });
  await page.waitForFunction(() => document.pointerLockElement === null);
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.waitForFunction(() => window.world.running);
  assert.equal(await page.evaluate(() => document.pointerLockElement),null);
  assert.equal(await page.evaluate(() => window.world.controls.navigation),false);
  await clickGalaxy();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.pointerLockElement === null && !window.world.controls.navigation);
}
