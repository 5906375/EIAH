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
  const writes=[]; let supportsManagement=true;
  let items=[{conversationId:'conv-one',title:'Primeira conversa',lastMessagePreview:'Pedido da primeira conversa'},{conversationId:'conv-two',title:'Segunda conversa',lastMessagePreview:'Pedido da segunda conversa'}].map(item=>({...item,status:'active',createdAt:'2026-11-10T10:00:00Z',updatedAt:'2026-11-10T11:00:00Z',lastMessageAt:'2026-11-10T11:00:00Z'}));
  await page.addInitScript(()=>{
    localStorage.setItem('eiah_token','synthetic-history-fixture');localStorage.setItem('tenant_id','tenant-history');localStorage.setItem('workspace_id','workspace-history');localStorage.setItem('active_domain','imob');
    localStorage.setItem('eiah:greeted:tenant-history:workspace-history','1');
    sessionStorage.setItem('eiah:chat:tenant-history:workspace-history:EIAH:default',JSON.stringify({runId:null,messages:[
      {id:'request-one',role:'user',content:'Cadastrar proprietário',status:'done'},
      {id:'answer-one',role:'assistant',content:'Formulário de demonstração',status:'done',presentationSnapshot:{verticalHandoff:{ok:true,handoff:{vertical:{id:'imob'}}}},imobStructured:{id:'answer-one',role:'assistant',text:'Formulário de demonstração'}},
      {id:'request-two',role:'user',content:'Consultar imóveis cadastrados',status:'done'},
    ]}));
  });
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),method=route.request().method(),path=url.pathname;
    const session={tenantId:'tenant-history',workspaceId:'workspace-history',userId:'owner-history',activeDomain:'imob',availableDomains:['core','imob'],entitlements:{IMOB_INSTALLED:true},productInstallations:[{product:'IMOB'}],verticals:[{verticalId:'IMOB',activeDomain:'imob',label:'IMOB',enabled:true,frontDoorSurface:'chat'}],roles:[],branding:{brandName:'EIAH',workspaceLabel:'Workspace sintético'},experience:{roleProfile:'workspace_admin',primaryNavigation:[],landingPath:'/app/chat'}};
    let body={ok:false,data:null,items:[]};
    if(path.endsWith('/session/context'))body={ok:true,data:session};
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
  const sidebar=page.getByRole('complementary',{name:'Workspace e operações'});
  const toggle=sidebar.getByRole('button',{name:/^Painel do workspace/});
  const openPanel=async()=>{if(width<1024&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();};
  await openPanel();
  const history=sidebar.getByRole('region',{name:'Conversas salvas'});
  // A labelled section is a region only when it has an accessible name.
  await history.waitFor();
  const cost=await sidebar.getByText(/Workspace no mês:/).boundingBox(),quota=await sidebar.getByText('Quota: 0%',{exact:true}).boundingBox();
  assert.ok(quota.y>=cost.y+cost.height,'cost and quota stacked in one column');
  await history.getByRole('button',{name:'Primeira conversa',exact:true}).waitFor();
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
  const search=history.getByRole('searchbox',{name:'Buscar conversas'});
  await search.fill('Segunda');
  await history.getByRole('button',{name:'Primeira conversa',exact:true}).waitFor({state:'hidden'});
  await history.getByRole('button',{name:'Segunda conversa',exact:true}).waitFor();
  await search.fill('');
  await history.getByRole('button',{name:'Primeira conversa',exact:true}).waitFor();
  await history.getByRole('button',{name:'Renomear Primeira conversa',exact:true}).click();
  await history.getByRole('textbox',{name:'Título da conversa'}).fill('Conversa renomeada');
  await history.getByRole('button',{name:'Salvar título',exact:true}).click();
  await history.getByRole('button',{name:'Conversa renomeada',exact:true}).waitFor();
  assert.equal(writes.filter(write=>write.method==='PATCH').length,1);
  await history.getByRole('button',{name:'Excluir Segunda conversa',exact:true}).click();
  assert.equal(writes.filter(write=>write.method==='DELETE').length,0);
  await history.getByRole('group',{name:'Confirmar exclusão da conversa'}).getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(writes.filter(write=>write.method==='DELETE').length,0);
  await history.getByRole('button',{name:'Conversa renomeada',exact:true}).click();
  await page.getByTestId('launcher-conversation-surface').getByText('Pedido restaurado conv-one',{exact:true}).waitFor();
  await openPanel();
  await history.getByRole('button',{name:'Excluir Conversa renomeada',exact:true}).click();
  await page.screenshot({path:`${output}/delete-${width}.png`});
  await history.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();
  await history.getByRole('button',{name:'Conversa renomeada',exact:true}).waitFor({state:'hidden'});
  assert.equal(writes.filter(write=>write.method==='DELETE').length,1);
  await sequence.getByText('Os pedidos desta conversa aparecerão aqui.',{exact:true}).waitFor();
  await sidebar.getByRole('button',{name:'Nova conversa',exact:true}).click();
  await openPanel();
  await page.screenshot({path:`${output}/sidebar-${width}.png`});
  supportsManagement=false;
  await history.getByRole('button',{name:'Atualizar',exact:true}).click();
  await history.getByText('Renomear e excluir estão indisponíveis no momento.',{exact:true}).waitFor();
  assert.equal(await history.getByRole('button',{name:'Renomear Segunda conversa',exact:true}).isDisabled(),true);
  assert.equal(await history.getByRole('button',{name:'Excluir Segunda conversa',exact:true}).isDisabled(),true);
  await search.fill('Sem correspondência');
  await history.getByText('Nenhuma conversa encontrada.',{exact:true}).waitFor();
  await search.fill('');
  await history.getByRole('button',{name:'Segunda conversa',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  results.push({width,height,status:'pass',checks:['compact sidebar','source turn navigation','search','rename','cancel delete makes no request','confirmed delete','open saved conversation','current deletion starts new conversation','old API mutation controls disabled and local search fallback','responsive no overflow or runtime errors']});
  await page.close();
 }
 await writeFile(`${output}/browser-results.json`,JSON.stringify({fixture:'mock API, synthetic owner/conversations; no real records mutated',results},null,2)+'\n');
 console.log('4 conversation history browser scenarios PASS');
}finally{await browser.close()}
