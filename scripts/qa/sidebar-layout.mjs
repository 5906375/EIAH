import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
// Vite: VITE_API_URL=http://localhost:5180/api, --port 5180.
const out='docs/evidence/front-door-sidebar-layout';
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const [width,height] of [[320,700],[390,844],[1024,768],[1440,705],[1920,1080]]) {
  const page=await browser.newPage({viewport:{width,height}});
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
  // Real component mounted in the real workspace using a synthetic UI fixture.
  await page.evaluate(async()=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {ImobActionMenuBar}=await import('/src/features/imob/ImobActionMenuBar.tsx');
    const {IMOB_ACTION_MENUS}=await import('/src/features/imob/imobActionMenus.ts');
    const aside=document.createElement('aside');
    aside.className='front-door-sidebar no-scrollbar min-w-0 shrink-0 lg:w-48 lg:overflow-y-auto';
    aside.setAttribute('aria-label','Menu operacional');
    document.querySelector('.front-door-workspace').prepend(aside);
    window.__qaMenuSelections=[];
    createRoot(aside).render(React.createElement(ImobActionMenuBar,{layout:'sidebar',menus:IMOB_ACTION_MENUS,onSelect:item=>window.__qaMenuSelections.push(item.id)}));
  });
  const sidebar=page.getByRole('complementary',{name:'Menu operacional'});
  const operations=sidebar.getByRole('navigation',{name:'Operações IMOB'});
  const mobileToggle=sidebar.getByRole('button',{name:/^Operações IMOB/});
  if(width<1024){
    await mobileToggle.waitFor();
    assert.equal(await operations.isVisible(),false);
    await mobileToggle.click();
  }
  await operations.waitFor();
  const owners=sidebar.getByRole('button',{name:/^Proprietários/});
  await owners.click();
  const menuItem=sidebar.getByRole('menuitem',{name:'Cadastrar proprietário',exact:true});
  assert.equal(await menuItem.evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
  assert.equal(await sidebar.getByRole('menu',{name:'Proprietários'}).evaluate(el=>getComputedStyle(el).position),'static');
  await page.screenshot({path:`${out}/menu-${width}.png`});
  await menuItem.click();
  assert.equal((await page.evaluate(()=>window.__qaMenuSelections)).length,1);
  if(width<1024){
    assert.equal(await operations.isVisible(),false);
    await mobileToggle.click();
    await owners.click();
    await page.keyboard.press('Escape');
    assert.equal(await operations.isVisible(),false);
    assert.equal(await mobileToggle.evaluate(el=>document.activeElement===el),true);
  }else{
    await owners.click();
    await page.keyboard.press('Escape');
    assert.equal(await sidebar.getByRole('menu',{name:'Proprietários'}).count(),0);
    const sideBox=await sidebar.boundingBox(), contentBox=await surface.boundingBox();
    assert.ok(sideBox.x+sideBox.width<=contentBox.x,'left sidebar without covering transcript');
  }
  assert.ok((await surface.boundingBox()).height>=height*(width>=1024?0.5:0.35),'usable conversation height');
  const messageInput=page.locator('.front-door-composer textarea').last();
  const emptyHeight=(await messageInput.boundingBox()).height;
  assert.ok(emptyHeight<=64,'compact empty composer');
  await messageInput.fill('Linha 1\nLinha 2\nLinha 3\nLinha 4');
  assert.ok((await messageInput.boundingBox()).height>emptyHeight,'composer grows with input');
  await messageInput.fill('');
  assert.ok((await messageInput.boundingBox()).height<=emptyHeight+1,'composer shrinks after clearing');
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
  const panel=surface.locator('.imob-structured-form');
  const panelStyle=await panel.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,background:s.backgroundColor,radius:parseFloat(s.borderRadius)}});
  assert.equal(panelStyle.border,'1px');
  assert.equal(panelStyle.background,'rgb(26, 34, 49)');
  assert.ok(panelStyle.radius>0);
  const fieldStyle=await input.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,background:s.backgroundColor,radius:parseFloat(s.borderRadius)}});
  assert.equal(fieldStyle.border,'1px');assert.equal(fieldStyle.background,'rgba(0, 0, 0, 0.3)');assert.ok(fieldStyle.radius>0);
  const saveStyle=await save.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,background:s.backgroundColor,radius:parseFloat(s.borderRadius)}});
  assert.equal(saveStyle.border,'1px');assert.ok(saveStyle.radius>100);
  assert.notEqual(saveStyle.background,'rgba(255, 255, 255, 0.05)');
  await save.focus();
  assert.notEqual(await save.evaluate(el=>getComputedStyle(el).boxShadow),'none');
  const newConversation=page.getByRole('button',{name:'Nova conversa',exact:true});
  assert.equal(await newConversation.evaluate(el=>getComputedStyle(el).borderTopWidth),'1px');
  const shell=await page.locator('main').boundingBox();
  const header=await page.locator('body > #root header').first().locator(':scope > div').boundingBox();
  const transcript=surface.locator('.front-door-reading-column');
  const composer=page.locator('.front-door-composer');
  const t=await transcript.boundingBox(), c=await composer.boundingBox();
  assert.ok(Math.abs(t.x-c.x)<1 && Math.abs(t.width-c.width)<1,'transcript/composer alignment');
  const messageInputBox=await composer.locator('textarea').last().boundingBox();
  assert.ok(Math.abs(messageInputBox.width-c.width)<1,'full width message input');
  const columns=await surface.locator('.imob-form-fields').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
  assert.equal(columns.split(' ').length,1,'one form column at every width');
  if(width>=1440){
   assert.ok(shell.x>100 && shell.width<width*0.9,'shared page margins');
   assert.ok(t.width<shell.width,'reading column narrower than shell');
   assert.ok(Math.abs(t.width-48*rootSize)<1,'max-w-3xl reading column');
  }
  await surface.evaluate(el=>{el.scrollTop=0});
  await page.screenshot({path:`${out}/form-${width}.png`});
  await save.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/form-actions-${width}.png`});
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
  results.push({width,height,status:'pass',checks:['Perfil rem scale; mobile controls 16px','single column form','bordered panel and dark fields','borderless sidebar, callbacks and Escape','mobile collapse','usable transcript height','composer autogrow','pill buttons and primary emphasis','visible keyboard focus','transcript/composer alignment','Chat/Profile shared outer frame and header','44px controls','input editing','hidden scrollbar','mouse wheel and ArrowDown/ArrowUp scrolling','no horizontal overflow','no runtime errors']});
  await page.goto(`${process.env.QA_BASE_URL||'http://localhost:5180'}/profile`,{waitUntil:'domcontentloaded'});
  await page.locator('main').waitFor();
  const profile=await page.locator('main').boundingBox();
  const profileHeader=await page.locator('body > #root header').first().locator(':scope > div').boundingBox();
  assert.ok(Math.abs(profile.x-shell.x)<1 && Math.abs(profile.width-shell.width)<1,'Chat/Profile shared outer frame');
  assert.ok(Math.abs(profileHeader.x-header.x)<1 && Math.abs(profileHeader.width-header.width)<1,'Chat/Profile shared header');
  await page.close();
 }
 await writeFile(`${out}/browser-results.json`,JSON.stringify({fixture:'synthetic session and restored messages, mocked API, no real mutations',results},null,2)+'\n');
 console.log('5 browser scenarios PASS');
}finally{await browser.close()}
