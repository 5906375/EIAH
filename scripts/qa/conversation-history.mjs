import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const output=process.env.QA_OUTPUT_DIR||'docs/evidence/front-door-conversation-history';
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const [width,height] of [[320,700],[390,844],[1024,768],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const writes=[]; let supportsManagement=true; let agentsAvailable=false;
  let items=[{conversationId:'conv-one',title:'Primeira conversa',lastMessagePreview:'Pedido da primeira conversa'},{conversationId:'conv-two',title:'Segunda conversa',lastMessagePreview:'Pedido da segunda conversa'}].map(item=>({...item,status:'active',createdAt:'2026-11-10T10:00:00Z',updatedAt:'2026-11-10T11:00:00Z',lastMessageAt:'2026-11-10T11:00:00Z'}));
  await page.addInitScript(({includeForm,longChat})=>{
    localStorage.setItem('eiah_token','synthetic-history-fixture');localStorage.setItem('tenant_id','tenant-history');localStorage.setItem('workspace_id','workspace-history');localStorage.setItem('active_domain','imob');
    localStorage.setItem('eiah:greeted:tenant-history:workspace-history','1');
    sessionStorage.setItem('eiah:chat:tenant-history:workspace-history:EIAH:default',JSON.stringify({runId:null,messages:[
      {id:'request-one',role:'user',content:'Cadastrar proprietário',status:'done'},
      {id:'answer-one',role:'assistant',content:'Formulário de demonstração',status:'done',presentationSnapshot:{verticalHandoff:{ok:true,handoff:{vertical:{id:'imob'}}}},imobStructured:{id:'answer-one',role:'assistant',text:'Formulário de demonstração',form:includeForm?{
        entity:'proprietario',action:'create',label:'Cadastrar proprietário — exemplo sintético',description:'Campos compartilhados dos formulários IMOB.',submitTarget:'imob.owners.create',
        fields:[{name:'ownerName',label:'Nome completo',type:'text',required:true},{name:'ownerEmail',label:'E-mail',type:'email'},{name:'ownerPhone',label:'Telefone',type:'tel'},
        {name:'documentCategory',label:'Tipo de documento',type:'select',options:[{value:'identity',label:'Identificação'}]},
        {name:'documents',label:'Anexar documentos',type:'file',helperText:'Documentação sintética para verificar o layout.'}],
        actions:[{id:'cancel',label:'Cancelar',kind:'secondary'},{id:'submit',label:'Salvar cadastro',kind:'primary'}]
      }:undefined}},
      {id:'request-two',role:'user',content:'Consultar imóveis cadastrados',status:'done'},
    ]}));
    if(longChat){
      const key='eiah:chat:tenant-history:workspace-history:EIAH:default',saved=JSON.parse(sessionStorage.getItem(key));
      for(let i=0;i<60;i++)saved.messages.push({id:`long-${i}`,role:'assistant',content:`Mensagem sintética ${i}: ${'Conteúdo para verificar rolagem da conversa. '.repeat(6)}`,status:'done'});
      sessionStorage.setItem(key,JSON.stringify(saved));
    }
  },{includeForm:Boolean(process.env.QA_IMOB_FORM),longChat:Boolean(process.env.QA_LONG_CHAT)});
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),method=route.request().method(),path=url.pathname;
    const session={tenantId:'tenant-history',workspaceId:'workspace-history',userId:'owner-history',activeDomain:'imob',availableDomains:['core','imob'],entitlements:{IMOB_INSTALLED:true},productInstallations:[{product:'IMOB'}],verticals:[{verticalId:'IMOB',activeDomain:'imob',label:'IMOB',enabled:true,frontDoorSurface:'chat'}],roles:[],branding:{brandName:'EIAH',workspaceLabel:'Workspace sintético'},experience:{roleProfile:'workspace_admin',primaryNavigation:[],landingPath:'/app/chat'}};
    let body={ok:false,data:null,items:[]};
    if(path.endsWith('/session/context'))body={ok:true,data:session};
    if(process.env.QA_AGENT_SELECT&&path.endsWith('/agents'))body={items:agentsAvailable?[{id:'EIAH',name:'EIAH Core',description:'Fixture'},{id:'specialist-fixture',name:'Especialista com nome muito longo para conferir quebra de texto e seleção responsiva',description:'Fixture'},...Array.from({length:20},(_,i)=>({id:`agent-${i}`,name:`Agente sintético ${i}`,description:'Fixture'}))]:[]};
    if(path.endsWith('/chat/vertical-handoff'))body={ok:true,data:{ok:true,handoff:{version:'chat.vertical_handoff.v2',handoffId:'fixture',vertical:{id:'imob',label:'IMOB',registryVersion:'fixture'},capability:{id:'knowledge.search',mode:'read_only'},outcome:'allowed',reasonCode:'VERTICAL_HANDOFF_ALLOWED',presentation:{source:'operational',variant:'chat_card'}}}};
    if(path.endsWith('/imob/chat/conversations')&&method==='GET'){
      const q=(url.searchParams.get('q')||'').toLowerCase();body={ok:true,capabilities:supportsManagement?{search:true,rename:true,delete:true}:undefined,items:items.filter(item=>!supportsManagement||`${item.title} ${item.lastMessagePreview}`.toLowerCase().includes(q))};
    }
    if(/\/imob\/chat\/conversations\/[^/]+\/messages$/.test(path)&&method==='GET'){
      const id=path.split('/').at(-2);body={ok:true,items:[{id:`message-${id}`,conversationId:id,role:'user',content:`Pedido restaurado ${id}`,createdAt:'2026-11-10T11:00:00Z'}]};
    }
    if(/\/imob\/chat\/conversations\/[^/]+$/.test(path)&&['PATCH','DELETE'].includes(method)){
      const id=decodeURIComponent(path.split('/').at(-1)),data=route.request().postDataJSON();writes.push({method,id,data});
      if(method==='PATCH'){items=items.map(item=>item.conversationId===id?{...item,title:data.title}:item);body={ok:true,conversationId:id,title:data.title};}
      else {assert.equal(data.confirm,true);items=items.filter(item=>item.conversationId!==id);body={ok:true,conversationId:id,deleted:true};}
    }
    await route.fulfill({json:body});
  });
  await page.goto(`${process.env.QA_BASE_URL||'http://localhost:5180'}/app/chat`,{waitUntil:'domcontentloaded'});
  if(process.env.QA_CHAT_CARD){
    const card=await page.locator('.front-door-launcher').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopColor,radius:parseFloat(s.borderTopLeftRadius),root:parseFloat(getComputedStyle(document.documentElement).fontSize)};});
    assert.equal(card.background,'rgba(15, 23, 42, 0.7)');
    assert.equal(card.border,'rgba(255, 255, 255, 0.1)');
    assert.ok(Math.abs(card.radius-card.root*1.5)<1,'same rounded corners as Self-Service card');
  }
  if(process.env.QA_DARK_MESSAGES){
    const surface=page.getByRole('region',{name:'Conversa',exact:true});
    assert.equal(await surface.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0.2)');
    assert.equal(await surface.evaluate(el=>getComputedStyle(el).opacity),'1');
    assert.equal(await page.locator('.front-door-launcher').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(15, 23, 42, 0.7)');
  }
  if(process.env.QA_LONG_CHAT){
    const surface=page.getByRole('region',{name:'Conversa',exact:true});
    await surface.waitFor();
    const metrics=await surface.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,top:el.scrollTop}));
    assert.ok(metrics.height>50&&metrics.scroll>metrics.height+500,JSON.stringify(metrics));
    await surface.evaluate(el=>el.scrollTop=0);
    await surface.hover();await page.mouse.wheel(0,700);await page.waitForTimeout(400);
    assert.ok(await surface.evaluate(el=>el.scrollTop)>0,'mouse wheel moves messages');
    await surface.focus();await page.keyboard.press('Home');await page.keyboard.press('Control+Home');await page.waitForTimeout(250);
    const before=await surface.evaluate(el=>el.scrollTop);await page.keyboard.press('PageDown');await page.waitForTimeout(300);
    assert.ok(await surface.evaluate(el=>el.scrollTop)>before,'keyboard moves messages');
    await page.screenshot({path:`${output}/scroll-${width}.png`});
  }
  const send=page.getByRole('button',{name:/^Enviar(?: mensagem)?$/i});
  const composer=page.locator('.front-door-composer');
  const input=composer.locator('textarea').last();
  await send.waitFor();
  assert.equal(await send.isDisabled(),true);
  await input.fill('Pedido sintético');
  assert.equal(await send.isEnabled(),true);
  const sendBox=await send.boundingBox(),inputBox=await input.boundingBox();
  assert.ok(sendBox.x>=inputBox.x+inputBox.width,'send beside input');
  assert.ok(sendBox.y<inputBox.y+inputBox.height&&sendBox.y+sendBox.height>inputBox.y,'same row');
  assert.equal(await send.locator('svg').count(),1);
  assert.ok(Math.abs(sendBox.y+sendBox.height/2-inputBox.y-inputBox.height/2)<2,'send centered vertically');
  const circle=await send.evaluate(el=>parseFloat(getComputedStyle(el,'::before').width));
  assert.ok(Math.abs(circle-sendBox.width*0.7)<1,'send circle reduced by 30 percent');
  await input.fill('');
  const sidebar=page.getByRole('complementary',{name:'Workspace e operações'});
  await sidebar.getByRole('heading',{name:'Chat ativo · IMOB',exact:true}).waitFor();
  assert.equal(await sidebar.locator('label#agent-label').evaluate(el=>el.classList.contains('sr-only')),true);
  const divider=await sidebar.evaluate(el=>{const s=getComputedStyle(el);return {right:s.borderRightWidth,bottom:s.borderBottomWidth,color:s.borderRightColor};});
  if(width>=1024){assert.equal(divider.right,'1px');assert.equal(divider.bottom,'0px');assert.equal(divider.color,'rgba(255, 255, 255, 0.13)');}
  else {assert.equal(divider.right,'0px');assert.equal(divider.bottom,'1px');}
  const toggle=sidebar.getByRole('button',{name:/^Painel do workspace/});
  const openPanel=async()=>{if(width<1024&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();};
  await openPanel();
  await sidebar.getByRole('combobox',{name:'Agente',exact:true}).waitFor({state:'attached'});
  const menuButton=sidebar.locator('.imob-sidebar-menu button[aria-haspopup="menu"]').first();
  assert.equal(await menuButton.evaluate(el=>getComputedStyle(el).fontWeight),'400');
  if(width>=1024) assert.ok((await menuButton.boundingBox()).height<=30,'compact desktop menu');
  if(process.env.QA_IMOB_FORM){
    const form=page.locator('.imob-structured-form');
    await form.waitFor();
    const metrics=await form.evaluate(el=>{
      const root=parseFloat(getComputedStyle(document.documentElement).fontSize),css=getComputedStyle(el),field=el.querySelector('input'),fields=el.querySelector('.imob-form-fields');
      return {padding:parseFloat(css.paddingLeft),expectedPadding:root*(innerWidth>=640?.875:.7),gap:parseFloat(getComputedStyle(fields).gap),expectedGap:root*.525,font:parseFloat(getComputedStyle(field).fontSize),height:field.getBoundingClientRect().height};
    });
    assert.ok(Math.abs(metrics.padding-metrics.expectedPadding)<1,'form padding scaled to 70 percent');
    assert.ok(Math.abs(metrics.gap-metrics.expectedGap)<1,'field gap scaled to 70 percent');
    if(width<640){assert.equal(metrics.font,16);assert.ok(metrics.height>=40);}
    else assert.ok(metrics.height<44,'compact desktop fields');
    const name=form.locator('input[type="text"]').first();await name.fill('Pessoa Sintética');assert.equal(await name.inputValue(),'Pessoa Sintética');
    await form.locator('select').selectOption('identity');
    await form.locator('input[type="file"]').setInputFiles({name:'sintetico.txt',mimeType:'text/plain',buffer:Buffer.from('Somente dados sinteticos')});
    await form.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/form-${width}.png`});
    // The legacy IMOB chat hosts the same component without the Front Door ancestor.
    const legacy=await form.evaluate(el=>{const clone=el.cloneNode(true);document.body.append(clone);const css=getComputedStyle(clone),input=getComputedStyle(clone.querySelector('input'));const result={padding:parseFloat(css.paddingLeft),font:parseFloat(input.fontSize)};clone.remove();return result;});
    assert.equal(legacy.padding,metrics.padding);assert.equal(legacy.font,metrics.font);
  }
  assert.equal(await sidebar.getByRole('region',{name:'Conversas salvas'}).count(),0);
  assert.equal(await sidebar.getByText('Renomear e excluir estão indisponíveis no momento.',{exact:true}).count(),0);
  assert.equal(await sidebar.getByRole('button',{name:/^(Renomear|Excluir) /}).count(),0);
  const cost=await sidebar.getByText(/Workspace no mês:/).boundingBox(),quota=await sidebar.getByText('Quota: 0%',{exact:true}).boundingBox();
  assert.ok(quota.y>=cost.y+cost.height,'cost and quota stacked in one column');
  const sequence=sidebar.getByRole('region',{name:'Sequência da conversa'});
  const sequenceToggle=sequence.getByRole('button',{name:/Resumo da sequência/});
  assert.equal(await sequenceToggle.getAttribute('aria-expanded'),'false');
  await sequenceToggle.click();
  assert.equal(await sequenceToggle.getAttribute('aria-expanded'),'true');
  await page.screenshot({path:`${output}/sequence-${width}.png`});
  await sequenceToggle.click();
  await sequence.getByRole('button',{name:'1. Cadastrar proprietário',exact:true}).waitFor({state:'hidden'});
  await sequenceToggle.click();
  await sequence.getByRole('button',{name:'1. Cadastrar proprietário',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.messageId),'request-one');
  await openPanel();
  await sidebar.getByRole('button',{name:'Nova conversa',exact:true}).click();
  await openPanel();
  await sequence.getByText('Os pedidos desta conversa aparecerão aqui.',{exact:true}).waitFor();
  assert.equal(writes.length,0,'removing saved history must not delete or rename records');
  await page.screenshot({path:`${output}/sidebar-${width}.png`});
  if(process.env.QA_AGENT_SELECT){
    const agent=page.locator('.front-door-sidebar [role="combobox"]');
    const checkPopup=async()=>{const box=await page.getByRole('listbox').boundingBox(),trigger=await agent.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,'popup within viewport');assert.ok(box.width<=trigger.width+1,'popup follows trigger width');assert.equal(await page.getByRole('listbox').evaluate(el=>el.scrollWidth<=el.clientWidth),true);};
    await agent.click();await page.getByRole('option',{name:'Nenhum agente disponível neste workspace.',exact:true}).waitFor();await checkPopup();
    await page.screenshot({path:`${output}/agents-empty-${width}.png`});
    await page.keyboard.press('Escape');
    assert.equal(await sidebar.getByRole('link',{name:'Ver agentes no Self-service'}).getAttribute('href'),'/self-service#marketplace-assinaturas');
    agentsAvailable=true;await page.reload();await openPanel();
    await agent.click();await page.getByRole('option',{name:/Especialista com nome muito longo/}).waitFor();await checkPopup();
    await page.screenshot({path:`${output}/agents-list-${width}.png`});
    await page.getByRole('option',{name:/Especialista com nome muito longo/}).click();
    await agent.getByText(/Especialista com nome muito longo/).waitFor();
    await agent.click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('listbox').count(),0);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  results.push({width,height,status:'pass',checks:['compact sidebar','source turn navigation','saved history and unavailable notice absent','no rename/delete requests','new conversation','responsive no overflow or runtime errors']});
  await page.close();
 }
 await writeFile(`${output}/browser-results.json`,JSON.stringify({fixture:'mock API, synthetic owner/conversations; no real records mutated',results},null,2)+'\n');
 console.log('4 Front Door sidebar browser scenarios PASS');
}finally{await browser.close()}
