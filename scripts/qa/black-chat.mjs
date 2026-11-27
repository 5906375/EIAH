import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
// Vite: VITE_API_URL=http://localhost:5180/api, --port 5180.
const out='docs/evidence/black-front-door-chat';
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const width of [320,390,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.addInitScript(()=>{
   localStorage.setItem('eiah_token','synthetic-ui-fixture');
   localStorage.setItem('tenant_id','tenant-test');
   localStorage.setItem('workspace_id','workspace-test');
   const messages=[
    {id:'user-qa',role:'user',content:'Cadastrar imóvel',status:'done'},
    {id:'assistant-qa',role:'assistant',content:'Preencha os campos abaixo para continuar o cadastro do imóvel. (Formulário fechado sem salvar.)',status:'done',imobStructured:{id:'structured-qa',text:'Preencha os campos abaixo para continuar o cadastro do imóvel. (Formulário fechado sem salvar.)',card:{title:'Prévia de teste',lines:['Imóvel de demonstração — nenhum cadastro executado.']}}},
    {id:'user-qa-2',role:'user',content:'Ver próximos passos',status:'done'},
    {id:'assistant-qa-2',role:'assistant',content:'Conversa de demonstração para validar a apresentação.',status:'done',presentationSnapshot:{quickReplies:['Ver ajuda']}}
   ];
   sessionStorage.setItem('eiah:chat:tenant-test:workspace-test:EIAH:default',JSON.stringify({messages,runId:null}));
   localStorage.setItem('eiah:greeted:tenant-test:workspace-test','1');
  });
  await page.route('**/api/**',async route=>{
   const session={tenantId:'tenant-test',workspaceId:'workspace-test',activeDomain:'core',availableDomains:['core'],entitlements:{},productInstallations:[],verticals:[],roles:[],branding:{brandName:'EIAH',workspaceLabel:'Workspace de teste'},experience:{roleProfile:'workspace_admin',primaryNavigation:[],landingPath:'/app/chat'}};
   await route.fulfill({json:route.request().url().includes('/session/context')?{ok:true,data:session}:{ok:false,data:null,items:[]}});
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.QA_BASE_URL||'http://localhost:5180'}/app/chat`,{waitUntil:'domcontentloaded'});
  const surface=page.getByTestId('launcher-conversation-surface');
  await surface.getByText('Cadastrar imóvel',{exact:true}).waitFor();
  assert.equal(await page.locator('.front-door-launcher').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  for(const text of ['Cadastrar imóvel','Prévia de teste','Ver ajuda']){
   const el=surface.getByText(text,{exact:true});await el.waitFor();
   const style=await el.evaluate(el=>{const s=getComputedStyle(el.closest('button')||el.parentElement);return {background:s.backgroundColor,border:s.borderTopWidth}});
   assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.border,'0px');
  }
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${out}/chat-${width}.png`});
  results.push({width,status:'pass',checks:['black background','plain user/assistant messages','borderless quick reply','no horizontal overflow','no runtime errors']});
  await page.close();
 }
 await writeFile(`${out}/browser-results.json`,JSON.stringify({fixture:'synthetic session and restored messages, mocked API, no real mutations',results},null,2)+'\n');
 console.log('3 browser scenarios PASS');
}finally{await browser.close()}
