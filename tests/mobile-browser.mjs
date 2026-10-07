import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Intercept backend endpoints only: **/api/** also catches Vite's /src/api/index.js.
const isApiRequest = url => url.pathname.startsWith('/api/');
for (const [path, expected] of [
  ['/api/auth/session', true], ['/api/projects?limit=10', true],
  ['/src/api/index.js', false], ['/src/api/contracts.js', false],
]) assert.equal(isApiRequest(new URL(path, 'http://127.0.0.1:5175')), expected, path);
const temp=await mkdtemp(join(tmpdir(),'orbit-mobile-'));
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3093',APP_ORIGIN:'http://127.0.0.1:5175',ORBITFOLIO_DATABASE_PATH:join(temp,'db.sqlite')},stdio:'ignore'});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5175','--strictPort'],{stdio:'ignore'});
// Vite's proxy normally uses 3000; route API requests to this isolated backend.
let browser;
try {
  for(let i=0;i<80;i++) {
    try { if((await fetch('http://127.0.0.1:5175')).ok && (await fetch('http://127.0.0.1:3093/api/health')).ok)break; } catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  for(const viewport of [{width:390,height:844},{width:430,height:932},{width:844,height:390}]) {
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:true});
    await context.route(isApiRequest, async route=>{
      const request=route.request(), url=new URL(request.url());
      const response=await route.fetch({url:'http://127.0.0.1:3093'+url.pathname+url.search});
      await route.fulfill({response});
    });
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    // Count actual calls without replacing the browser's API behavior.
    await page.addInitScript(()=>{
      window.lockCalls=0;
      const request=Element.prototype.requestPointerLock;
      if(request)Element.prototype.requestPointerLock=function(...args){window.lockCalls++;return request.apply(this,args);};
    });
    await page.goto('http://127.0.0.1:5175/account');
    // /account renders the normal shell for an anonymous visitor too.
    // Wait for actual app initialization before creating fixtures or hooking Universe.
    await page.getByRole('heading', {name:'Conta', exact:true}).waitFor();
    const homeLink = page.getByRole('navigation', {name:'Navegação principal'})
      .getByRole('link', {name:'Início', exact:true});
    await homeLink.waitFor({state:'visible'});
    assert.equal(await homeLink.getAttribute('href'), '/');
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('touch-mode')), true);
    const id=await page.evaluate(async()=>{
      const registration=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Mobile Tester',username:'mobile'+Date.now(),email:`mobile${Date.now()}@test.local`,password:'mobile-test-password'})});
      if(!registration.ok)throw new Error(await registration.text());
      const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Touch Planet',demoUrl:'https://example.com',languages:{HTML:60,Python:30,Shell:10}})});
      if(!response.ok)throw new Error(await response.text());
      const {project}=await response.json();
      const {Universe}=await import('/src/three/universe.js');
      const start=Universe.prototype.start;
      Universe.prototype.start=function(){window.world=this;return start.call(this);};
      return project.id;
    });
    await homeLink.tap();
    await page.waitForURL('http://127.0.0.1:5175/');
    await page.waitForFunction(()=>window.world?.running && window.world.planets.length>0);
    await page.locator('.touch-controls').waitFor({state:'visible'});
    await page.evaluate(()=>{
      window.canvasInteractions=0;
      const click=world.fallbackClick;
      world.fallbackClick=event=>{window.canvasInteractions++;return click(event);};
    });
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const cdp=await context.newCDPSession(page);
    const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    const point=async(selector,id)=>{
      const box=await page.locator(selector).boundingBox(); assert.ok(box);
      return {id,x:box.x+box.width/2,y:box.y+box.height/2};
    };
    const stick=await point('.touch-stick',1), boost=await point('[data-flight-key=ShiftLeft]',2), up=await point('[data-flight-key=Space]',3);
    assert.ok(stick.x<viewport.width/2 && boost.x>viewport.width/2,'Joystick left, buttons right');
    const hud=await page.locator('.warp-hud').boundingBox();
    const stickBox=await page.locator('.touch-stick').boundingBox();
    assert.ok(hud && hud.height<60 && hud.y+hud.height<stickBox.y,'Compact HUD above joystick');
    const initial=await page.evaluate(()=>({yaw:world.controls.yaw,pitch:world.controls.pitch,energy:world.warp.energy}));
    await send('touchStart',[stick]);
    await send('touchMove',[{...stick,x:stick.x+40}]);
    await page.waitForFunction(()=>world.controls.axes.x>.2);
    await send('touchStart',[{...stick,x:stick.x+40},boost,up]);
    await page.waitForFunction(()=>world.warp.active && world.controls.keys.has('Space'));
    await page.waitForFunction(value=>world.warp.energy<value,initial.energy);
    assert.equal(await page.locator('[data-home-panel]').count(),0,'Joystick must not open a planet');
    assert.equal(await page.evaluate(()=>window.canvasInteractions),0,'Joystick never reaches canvas raycast');
    assert.deepEqual(await page.evaluate(()=>({yaw:world.controls.yaw,pitch:world.controls.pitch})),{yaw:initial.yaw,pitch:initial.pitch});
    await send('touchEnd',[]);
    await page.waitForFunction(()=>world.controls.axes.x===0 && world.controls.keys.size===0 && !world.warp.active);
    const down=await point('[data-flight-key=ControlLeft]',4);
    await send('touchStart',[down]);await page.waitForFunction(()=>world.controls.keys.has('ControlLeft'));
    await send('touchCancel',[]);await page.waitForFunction(()=>world.controls.keys.size===0);
    await send('touchStart',[boost]);await page.waitForFunction(()=>world.warp.active);
    await send('touchCancel',[]);await page.waitForFunction(()=>!world.warp.active);
    await send('touchStart',[stick]);await send('touchMove',[{...stick,x:stick.x+40}]);
    await page.setViewportSize({width:viewport.height,height:viewport.width});
    await page.waitForFunction(()=>world.controls.axes.x===0 && world.controls.keys.size===0);
    await send('touchCancel',[]);
    await page.setViewportSize(viewport);
    const findEmpty = () => page.evaluate(async()=>{
      const {pickPlanetSystem}=await import('/src/three/planet-interaction.js');
      const u=world, rect=u.canvas.getBoundingClientRect();
      for(const y of [.5,.65,.8])for(const x of [.25,.4,.6]) {
        const point={x:rect.left+rect.width*x,y:rect.top+rect.height*y};
        if(document.elementFromPoint(point.x,point.y)===u.canvas &&
          !pickPlanetSystem(u.camera,u.planets,u.ship.position,u.raycaster,u.pointer.clone().set(x*2-1,1-y*2),false))return point;
      }
      throw new Error('No clear canvas point');
    });
    const empty=await findEmpty();
    const beforeLook=await page.evaluate(()=>({yaw:world.controls.yaw,pitch:world.controls.pitch,
      camera:world.camera.position.toArray(),interactions:window.canvasInteractions}));
    const look={...empty,id:5}, movingStick={...stick,x:stick.x+40};
    await send('touchStart',[stick,look]);
    await send('touchMove',[movingStick,{...look,x:look.x+45,y:look.y+25}]);
    await page.waitForFunction(before=>world.controls.axes.x>.2 &&
      world.controls.yaw!==before.yaw && world.controls.pitch!==before.pitch,beforeLook);
    await page.waitForFunction(()=>Math.abs(world.ship.rotation.y-world.controls.yaw)<1e-6 &&
      Math.abs(world.ship.rotation.x-world.controls.pitch)<1e-6);
    await page.waitForFunction(before=>world.camera.position.toArray().some((v,i)=>Math.abs(v-before.camera[i])>.1) &&
      world.camera.position.distanceTo(world.ship.position)<25,beforeLook);
    assert.equal(await page.evaluate(()=>world.controls.keys.size),0,'Camera drag does not press WASD');
    await send('touchCancel',[]);
    await page.waitForFunction(()=>world.controls.taps.size===0 && world.controls.axes.x===0);
    assert.equal(await page.evaluate(()=>window.canvasInteractions),beforeLook.interactions,'Drag does not select');
    const emptyAfterLook=await findEmpty();
    await page.touchscreen.tap(emptyAfterLook.x,emptyAfterLook.y);
    assert.deepEqual(await page.evaluate(()=>({...world.controls.axes,keys:world.controls.keys.size})),{x:0,z:0,keys:0});
    assert.equal(await page.locator('[data-home-panel]').count(),0);
    // Put the existing planet on the center ray and tap through the real touch/raycast path.
    const tap=await page.evaluate(projectId=>{
      const u=world, p=u.planets.find(p=>p.userData.project.id===projectId);
      cancelAnimationFrame(u.frameId);
      p.visible=true;u.ship.position.copy(p.position);u.ship.position.z+=p.userData.radius*4;
      u.camera.position.copy(u.ship.position);u.camera.lookAt(p.position);u.camera.updateMatrixWorld();p.updateMatrixWorld();
      u.renderer.render(u.scene,u.camera);
      const rect=u.canvas.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    },id);
    const beforePlanetDrag=await page.evaluate(()=>window.canvasInteractions);
    await send('touchStart',[{...tap,id:6}]);
    await send('touchMove',[{...tap,id:6,x:tap.x+40,y:tap.y+20}]);
    await send('touchEnd',[]);
    assert.equal(await page.locator('[data-home-panel]').count(),0,'Dragging from a planet must not open it');
    assert.equal(await page.evaluate(()=>window.canvasInteractions),beforePlanetDrag);
    await page.touchscreen.tap(tap.x,tap.y);
    await page.locator('[data-home-panel]').waitFor();
    assert.equal(await page.locator('.touch-controls').isVisible(),false);
    assert.equal(await page.evaluate(()=>world.controls.keys.size),0);
    await page.getByRole('button',{name:'Fechar projeto',exact:true}).click();
    await page.waitForFunction(()=>world.running && !world.focus);
    await page.evaluate(()=>{world.running=false;world.start();});
    for(const route of ['/search','/account','/explore','/social','/featured','/projects/new','/progress','/favorites']) {
      await page.evaluate(async path=>{const {navigate}=await import('/src/router/router.js');await navigate(path);},route);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} overflow at ${viewport.width}`);
      assert.equal(await page.locator('.touch-controls').count(),0);
      // Normal pages keep native touch scrolling enabled.
      assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).touchAction),'none');
      if(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)) {
        await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
        assert.ok(await page.evaluate(()=>scrollY>0));
      }
    }
    assert.equal(await page.evaluate(()=>window.lockCalls),0);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  // Small desktop viewport must never switch to touch controls.
  const desktop=await browser.newPage({viewport:{width:390,height:844},hasTouch:false});
  await desktop.goto('http://127.0.0.1:5175/account');
  assert.equal(await desktop.evaluate(()=>document.documentElement.classList.contains('touch-mode')),false);
  assert.equal(await desktop.locator('.touch-controls').count(),0);
  console.log('PASS: mobile portrait/landscape, real multitouch, tap raycast, altitude, hold/cancel Warp, mode detection and responsive pages.');
} finally {
  await browser?.close();
  const stopped=[server,vite].map(child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill();}));
  await Promise.all(stopped);
  await rm(temp,{recursive:true,force:true});
}
