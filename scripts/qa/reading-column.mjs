import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
// Vite: VITE_API_URL=http://localhost:5180/api, --port 5180.
const out='docs/evidence/front-door-reading-column';
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const width of [320,390,1440,1920]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.addInitScript(()=>{
   localStorage.setItem('eiah_token','synthetic-ui-fixture');
   localStorage.setItem('tenant_id','tenant-test');
   localStorage.setItem('workspace_id','workspace-test');
   const messages=[
    {id:'user-qa',role:'user',content:'Cadastrar imóvel',status:'done'},
    {id:'assistant-qa',role:'assistant',content:'Preencha os campos abaixo para continuar o cadastro do imóvel. (Formulário fechado sem salvar.)',status:'done',imobStructured:{id:'structured-qa',form:{entity:'proprietario',action:'create',label:'Cadastrar proprietário',description:'Dados do proprietário',fields:[{name:'fullName',label:'Nome completo',type:'text',value:''},{name:'email',label:'Email',type:'text',value:''},{name:'phone',label:'Telefone',type:'text',value:''},{name:'city',label:'Cidade',type:'text',value:''}],actions:[{id:'submit',label:'Salvar cadastro',kind:'primary'},{id:'cancel',label:'Cancelar',kind:'secondary'}]},text:'Preencha os campos abaixo para continuar o cadastro do imóvel. (Formulário fechado sem salvar.)',card:{title:'Prévia de teste',lines:['Imóvel de demonstração — nenhum cadastro executado.']}}},
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
  const label=surface.locator('label').filter({hasText:'Nome completo'}).first();
  const rootSize=await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
  assert.ok(Math.abs(parseFloat(await label.evaluate(el=>getComputedStyle(el).fontSize))-rootSize*0.875)<0.1);
  const input=surface.locator('[data-imob-form-field="fullName"] input');
  assert.equal(await input.evaluate(el=>getComputedStyle(el).fontSize),width<640?'16px':`${rootSize}px`);
  assert.ok((await input.boundingBox()).height>=44);
  await input.fill('Pessoa de demonstração');
  assert.equal(await input.inputValue(),'Pessoa de demonstração');
  const save=surface.getByRole('button',{name:'Salvar cadastro',exact:true});
  assert.equal(await save.evaluate(el=>getComputedStyle(el).fontSize),width<640?'16px':`${rootSize}px`);
  assert.ok((await save.boundingBox()).height>=44);
  assert.equal(await surface.evaluate(el=>getComputedStyle(el).scrollbarWidth),'none');
  const shell=await page.locator('main').boundingBox();
  const header=await page.locator('body > #root header').first().locator(':scope > div').boundingBox();
  const transcript=surface.locator('.front-door-reading-column');
  const composer=page.locator('.front-door-composer');
  const t=await transcript.boundingBox(), c=await composer.boundingBox();
  assert.ok(Math.abs(t.x-c.x)<1 && Math.abs(t.width-c.width)<1,'transcript/composer alignment');
  const messageInput=await composer.locator('textarea').last().boundingBox();
  assert.ok(Math.abs(messageInput.width-c.width)<1,'full width message input');
  const columns=await surface.locator('.imob-form-fields').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
  assert.equal(columns.split(' ').length,1,'one form column at every width');
  if(width>=1440){
   assert.ok(shell.x>100 && shell.width<width*0.9,'shared page margins');
   assert.ok(t.width<shell.width,'reading column narrower than shell');
   assert.ok(Math.abs(t.width-48*rootSize)<1,'max-w-3xl reading column');
  }
  await page.screenshot({path:`${out}/form-${width}.png`});
  // Synthetic long content only to exercise the real scroll region.
  await surface.evaluate(el=>{
    const content=el.firstElementChild;
    for(let i=0;i<40;i++){const p=document.createElement('p');p.textContent='Mensagem de demonstração '+i;p.style.padding='16px';content.append(p);}
    el.scrollTop=0;
  });
  await surface.hover({position:{x:5,y:10}});
  await page.mouse.wheel(0,400);
  await page.waitForFunction(()=>document.querySelector('[data-testid="launcher-conversation-surface"]').scrollTop>0);
  await surface.evaluate(el=>{el.scrollTop=0;el.focus()});
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.querySelector('[data-testid="launcher-conversation-surface"]').scrollTop>0);
  await surface.evaluate(el=>{el.scrollTop=el.scrollHeight;el.focus()});
  const before=await surface.evaluate(el=>el.scrollTop);
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(before=>document.querySelector('[data-testid="launcher-conversation-surface"]').scrollTop<before,before);
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  results.push({width,status:'pass',checks:['Perfil rem scale; mobile controls 16px','single column form','transcript/composer alignment','Chat/Profile shared outer frame and header','44px controls','input editing','hidden scrollbar','mouse wheel and ArrowDown/ArrowUp scrolling','no horizontal overflow','no runtime errors']});
  await page.goto(`${process.env.QA_BASE_URL||'http://localhost:5180'}/profile`,{waitUntil:'domcontentloaded'});
  await page.locator('main').waitFor();
  const profile=await page.locator('main').boundingBox();
  const profileHeader=await page.locator('body > #root header').first().locator(':scope > div').boundingBox();
  assert.ok(Math.abs(profile.x-shell.x)<1 && Math.abs(profile.width-shell.width)<1,'Chat/Profile shared outer frame');
  assert.ok(Math.abs(profileHeader.x-header.x)<1 && Math.abs(profileHeader.width-header.width)<1,'Chat/Profile shared header');
  await page.close();
 }
 await writeFile(`${out}/browser-results.json`,JSON.stringify({fixture:'synthetic session and restored messages, mocked API, no real mutations',results},null,2)+'\n');
 console.log('4 browser scenarios PASS');
}finally{await browser.close()}
