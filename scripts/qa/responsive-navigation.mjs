import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Start Vite with VITE_API_URL pointing to the same local origin as QA_BASE_URL.
const output = 'docs/evidence/front-door-navigation';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
 for (const width of [320, 390, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript(() => {
   localStorage.setItem('eiah_token', 'synthetic-ui-fixture');
   localStorage.setItem('brand_name', 'LENE CRUZ STUDIO');
   localStorage.setItem('workspace_id', 'workspace-test');
  });
  await page.route('**/api/**', async route => {
   const session = { tenantId:'tenant-test', workspaceId:'workspace-test', activeDomain:'core', availableDomains:['core'], entitlements:{}, productInstallations:[], verticals:[], roles:[], branding:{brandName:'LENE CRUZ STUDIO',workspaceLabel:'WORKSPACE INICIAL'}, experience:{roleProfile:'workspace_admin',primaryNavigation:[],landingPath:'/app/chat'} };
   const body = route.request().url().includes('/session/context') ? {ok:true,data:session} : {ok:false,items:[],data:null};
   await route.fulfill({json:body});
  });
  for (const path of ['/app/chat', '/profile', '/app/chat?domain=imob', '/app/chat?domain=logistica']) {
   await page.goto(`${process.env.QA_BASE_URL || "http://localhost:5173"}${path}`, {waitUntil:'domcontentloaded'});
   const nav = page.getByRole('navigation', {name:'Navegação principal', includeHidden:true});
   await nav.waitFor({state:'attached'});
   const button = page.getByRole('button', {name:'Menu',exact:true});
   await page.waitForFunction(() => document.querySelector('nav a[href="/app/billing"]'));
   if(width<1024){
    await assert.doesNotReject(()=>button.waitFor());
    assert.equal(await nav.isVisible(),false);
    await button.click();
    await page.getByRole('button',{name:'Fechar menu'}).waitFor();
   }
   assert.equal(await nav.isVisible(),true);
   assert.deepEqual(await nav.locator('a').allTextContents(),['Runs','Chat','Billing','Marketplace','Self-service','Perfil']);
   if(path.startsWith('/app/chat'))assert.equal(await nav.getByRole('link',{name:'Chat',exact:true}).getAttribute('aria-current'),'page');
   for(const link of await nav.locator('a').all()) {
    const box=await link.boundingBox();
    assert.ok(box && box.x>=0 && box.x+box.width<=width+1,`link clipped at ${width} ${path}`);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${path} ${width}`);
   if(width===390 && ['/app/chat','/profile'].includes(path))await page.screenshot({path:`${output}/${path==='/profile'?'profile':'chat'}-mobile.png`});
   if(width<1024){
    await nav.getByRole('link',{name:'Perfil',exact:true}).focus();
    await page.keyboard.press('Escape');
    assert.equal(await nav.isVisible(),false);
    await button.click();
    await nav.getByRole('link',{name:path==='/profile'?'Chat':'Perfil',exact:true}).click();
    await page.waitForURL(`**${path==='/profile'?'/app/chat':'/profile'}`);
    assert.equal(await nav.isVisible(),false);
   }
   results.push({width,path,status:'pass'});
  }
  await page.close();
 }
 await writeFile(`${output}/browser-results.json`,JSON.stringify({fixture:'synthetic API responses; UI only, no real backend operations',browser:'Chromium',results},null,2)+'\n');
 console.log(`${results.length} responsive navigation scenarios PASS`);
} finally {await browser.close();}
