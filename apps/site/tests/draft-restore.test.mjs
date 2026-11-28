import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

// localStorage simulado: os módulos só o usam dentro das funções.
const memory = new Map();
globalThis.localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: key => { throw new Error('substituído em cada teste'); },
  removeItem: key => { memory.delete(key); }
};
const normalSetItem = (key, value) => { memory.set(key, String(value)); };
const reset = () => { memory.clear(); localStorage.setItem = normalSetItem; };
reset();

const { readClientProperties, replaceClientProperties, saveClientProperty } = await import('../public/imob/client-properties.mjs');
const { brandFromDraft, editsFromDraft, parseDraftText, summarizeDraft, MAX_DRAFT_BYTES } = await import('../public/imob/draft-restore.mjs');
const { footerFields } = await import('../public/imob/client-footer.mjs');

beforeEach(reset);

const webp = n => 'data:image/webp;base64,' + Buffer.from('RIFF----WEBPVP8 ' + 'x'.repeat(n)).toString('base64');
const draft = (extra = {}) => ({ brand: { name: 'Horizonte Imóveis' }, properties: [], ...extra });
const house = (extra = {}) => ({ id: 'v-01', finalidade: 'venda', titulo: 'Casa', tipo: 'Casa', cidade: 'Itapema', bairro: 'Centro', preco: 900000, ...extra });

test('parseDraftText aceita um rascunho válido e explica em português o que não serve', () => {
  const ok = parseDraftText(JSON.stringify(draft({ properties: [house()] })));
  assert.equal(ok.ok, true);
  assert.equal(ok.draft.properties.length, 1);
  assert.match(parseDraftText('').message, /vazio/);
  assert.match(parseDraftText('   \n ').message, /vazio/);
  assert.match(parseDraftText('{ quebrado').message, /Não foi possível ler o arquivo.*vitrine-imob\.json/);
  assert.match(parseDraftText('[]').message, /rascunho válido/);
  assert.match(parseDraftText('null').message, /rascunho válido/);
  assert.match(parseDraftText('"texto"').message, /rascunho válido/);
  const bad = parseDraftText(JSON.stringify({ brand: { name: ' ' }, properties: [house({ titulo: '' }), 'texto'] }));
  assert.equal(bad.ok, false);
  assert.ok(bad.message.startsWith('O arquivo tem problemas:'), bad.message);
  for (const part of ['Informe o nome da imobiliária', 'Imóvel 1: informe o título', 'Imóvel 2: dados inválidos']) assert.ok(bad.message.includes(part), part);
  assert.ok(!/undefined|TypeError/.test(bad.message));
});

test('parseDraftText recusa arquivo grande demais antes de ler o JSON', () => {
  const text = JSON.stringify(draft({ properties: [house({ descricao: 'x'.repeat(300) })] }));
  const big = parseDraftText(text, { maxBytes: 100 });
  assert.equal(big.ok, false);
  assert.match(big.message, /grande demais/);
  assert.equal(MAX_DRAFT_BYTES, 25 * 1024 * 1024);
});

test('brandFromDraft guarda só os campos conhecidos, no formato do editor', () => {
  const logo = webp(50);
  const brand = brandFromDraft({
    name: 'Horizonte', introduction: 'Imóveis na praia.', accent: '#087566', contact: 'Equipe', logo,
    footerEmail: 'a@b.co', footerCreci: 'CRECI-SC 123', footerConfirmed: true,
    script: '<script>alert(1)</script>', __proto__: { admin: true }, constructor: 'x', onclick: 'x()'
  });
  assert.deepEqual(Object.keys(brand).sort(), ['accent', 'contact', 'footerConfirmed', 'footerCreci', 'footerEmail', 'introduction', 'logo', 'name'].sort());
  assert.equal(brand.logo, logo);
  for (const key of ['script', 'onclick', 'constructor', '__proto__', 'admin']) assert.ok(!Object.hasOwn(brand, key), key + ' não entra');
  assert.equal(Object.getPrototypeOf(brand), Object.prototype, 'a marca não herda nada do arquivo');
  const bad = brandFromDraft({ name: 42, introduction: 'x'.repeat(501), accent: 'vermelho', logo: 'https://x/y.png', footerConfirmed: 'sim', footerEmail: ['a'], contact: null });
  assert.deepEqual(bad, {});
  assert.deepEqual(brandFromDraft(null), {});
  assert.deepEqual(brandFromDraft('texto'), {});
  assert.equal(brandFromDraft({ logo: 'data:image/svg+xml;base64,PHN2Zz4=' }).logo, undefined, 'logo svg não entra');
  assert.equal(brandFromDraft({ name: 'x'.repeat(81) }).name, undefined, 'nome acima do limite não entra');
  for (const field of footerFields) assert.equal(brandFromDraft({ [field]: 'valor' })[field], 'valor', field + ' faz parte da lista oficial do rodapé');
});

test('editsFromDraft converte os imóveis no registro do editor', () => {
  const uuid = 'p-' + crypto.randomUUID();
  const edits = editsFromDraft([
    house({ id: 'v-01', condominio: 600, iptu: 150, area: 80, quartos: 2, caracteristicas: ['Varanda', 'Piscina'], fotos: [webp(10), 'https://eiah.ia.br/imob/assets/x.webp', 'data:image/png;base64,AAAA'], origem: 'informed_by_manager', destaque: true }),
    house({ id: uuid, finalidade: 'temporada', preco: 500, stay: { maxGuests: 4, cleaning: 120, blocked: [1, 2] } }),
    house({ id: 'id-invalido', titulo: 'Sem endereço válido' }),
    house({ id: undefined, titulo: 'Sem id', condominio: -5, iptu: null })
  ]);
  const ids = Object.keys(edits);
  assert.equal(ids.length, 4);
  assert.ok(ids.includes('v-01') && ids.includes(uuid));
  const generated = ids.filter(id => id !== 'v-01' && id !== uuid);
  assert.equal(generated.length, 2);
  assert.ok(generated.every(id => /^p-[a-f0-9-]{36}$/.test(id)), 'ids novos no formato do editor');
  const first = edits['v-01'];
  assert.equal(first.caracteristicas, 'Varanda, Piscina');
  assert.equal(first.condominio, 600);
  assert.equal(first.photos.length, 1, 'só foto webp enviada pelo cliente volta');
  assert.ok(first.photos[0].startsWith('data:image/webp;base64,'));
  assert.ok(!('origem' in first) && !('destaque' in first), 'campos fora do registro do editor são descartados');
  assert.deepEqual([edits[uuid].maxGuests, edits[uuid].cleaning], [4, 120]);
  assert.equal(edits[generated[1]].condominio, null, 'valor negativo vira "não informado"');
  assert.equal(edits[generated[1]].iptu, null);
  assert.equal(first.area, 80);
  assert.equal(first.suites, 0);
});

test('editsFromDraft descarta fotos grandes demais', () => {
  const huge = 'data:image/webp;base64,' + 'A'.repeat(1300000);
  const [edit] = Object.values(editsFromDraft([house({ fotos: [huge, webp(5)] })]));
  assert.equal(edit.photos.length, 1);
});

test('summarizeDraft fala em singular e plural', () => {
  assert.equal(summarizeDraft(draft({ properties: [house()] })), 'O arquivo traz a marca "Horizonte Imóveis" e 1 imóvel.');
  assert.equal(summarizeDraft(draft({ properties: [house(), house({ id: 'v-02' })] })), 'O arquivo traz a marca "Horizonte Imóveis" e 2 imóveis.');
  assert.equal(summarizeDraft(draft()), 'O arquivo traz a marca "Horizonte Imóveis" e 0 imóveis.');
});

test('replaceClientProperties substitui tudo, valida cada registro e avisa quando o navegador não guarda', () => {
  saveClientProperty('v-01', { finalidade: 'venda', titulo: 'Antigo', tipo: 'Apartamento', cidade: 'Itajaí', bairro: 'Centro', preco: 800000 });
  const result = replaceClientProperties({
    'v-02': { finalidade: 'venda', titulo: 'Novo', tipo: 'Casa', cidade: 'Itapema', bairro: 'Morretes', preco: 700000 },
    'id-ruim': { finalidade: 'venda', titulo: 'x', tipo: 'Casa', cidade: 'a', bairro: 'b', preco: 1 },
    'v-03': { finalidade: 'venda', titulo: '', tipo: 'Casa', cidade: 'a', bairro: 'b', preco: 1 },
    'l-01': null
  });
  assert.deepEqual([result.ok, result.saved, result.rejected], [true, 1, 3]);
  const ids = readClientProperties({ onlyEdited: true }).map(property => property.id);
  assert.deepEqual(ids, ['v-02'], 'a edição antiga de v-01 foi substituída, não somada');
  assert.deepEqual(replaceClientProperties(undefined), { ok: true, saved: 0, rejected: 0 });
  assert.deepEqual(readClientProperties({ onlyEdited: true }), []);
  localStorage.setItem = () => { throw new Error('cota'); };
  assert.deepEqual(replaceClientProperties({ 'v-02': { finalidade: 'venda', titulo: 'Novo', tipo: 'Casa', cidade: 'a', bairro: 'b', preco: 1 } }), { ok: false, saved: 0, rejected: 0 });
});

test('ida e volta: editar, exportar, limpar o navegador e reabrir devolve a mesma vitrine', () => {
  const uuid = 'p-' + crypto.randomUUID();
  const photo = webp(30);
  saveClientProperty(uuid, { finalidade: 'locacao', titulo: 'Casa na praia', tipo: 'Casa', cidade: 'Itapema', bairro: 'Meia Praia', preco: 3200, condominio: 600, iptu: null, area: 90, quartos: 2, caracteristicas: 'Varanda, Piscina', descricao: 'Casa de exemplo.', photos: [photo] });
  saveClientProperty('v-01', { finalidade: 'venda', titulo: 'Apartamento editado', tipo: 'Apartamento', cidade: 'Balneário Camboriú', bairro: 'Centro', preco: 950000 });
  saveClientProperty('t-01', { finalidade: 'temporada', titulo: 'Temporada editada', tipo: 'Apartamento', cidade: 'Itapema', bairro: 'Meia Praia', preco: 600, maxGuests: 5, cleaning: 200 });
  const exported = JSON.parse(JSON.stringify({ brand: { name: 'Horizonte Imóveis', introduction: 'Imóveis na praia.', accent: '#087566' }, properties: readClientProperties({ onlyEdited: true }) }));
  assert.equal(exported.properties.length, 3);

  reset(); // outro computador, ou dados limpos
  assert.deepEqual(readClientProperties({ onlyEdited: true }), []);
  const parsed = parseDraftText(JSON.stringify(exported));
  assert.equal(parsed.ok, true, parsed.message);
  const result = replaceClientProperties(editsFromDraft(parsed.draft.properties));
  assert.deepEqual([result.saved, result.rejected], [3, 0]);

  const restored = new Map(readClientProperties({ onlyEdited: true }).map(property => [property.id, property]));
  for (const original of exported.properties) {
    const back = restored.get(original.id);
    assert.ok(back, original.id + ' voltou');
    for (const field of ['finalidade', 'titulo', 'tipo', 'cidade', 'bairro', 'preco', 'condominio', 'iptu', 'area', 'quartos', 'suites', 'banheiros', 'vagas', 'origem']) {
      assert.deepEqual(back[field], original[field], original.id + ': ' + field);
    }
    assert.deepEqual(back.caracteristicas, original.caracteristicas, original.id + ': características');
    assert.deepEqual(back.fotos, original.fotos, original.id + ': fotos');
    assert.deepEqual(back.stay, original.stay, original.id + ': temporada');
  }
  assert.deepEqual(restored.get(uuid).fotos, [photo], 'a foto enviada pelo cliente voltou');
  assert.equal(restored.get(uuid).condominio, 600);
  assert.equal(restored.get(uuid).iptu, null, 'IPTU não informado continua não informado');
  assert.deepEqual([restored.get('t-01').stay.maxGuests, restored.get('t-01').stay.cleaning], [5, 200]);
});

test('um arquivo com chaves perigosas não contamina nada nem leva campos desconhecidos', () => {
  const text = '{"brand":{"name":"Horizonte","__proto__":{"admin":true},"constructor":{"prototype":{"admin":true}}},'
    + '"properties":[{"id":"v-01","finalidade":"venda","titulo":"Casa","preco":1,"tipo":"Casa","cidade":"a","bairro":"b","__proto__":{"admin":true},"onerror":"x()"}]}';
  const parsed = parseDraftText(text);
  assert.equal(parsed.ok, true);
  const brand = brandFromDraft(parsed.draft.brand);
  const [edit] = Object.values(editsFromDraft(parsed.draft.properties));
  assert.deepEqual(brand, { name: 'Horizonte' });
  assert.equal(({}).admin, undefined, 'Object.prototype intacto');
  assert.ok(!Object.hasOwn(edit, 'onerror') && !Object.hasOwn(edit, '__proto__'));
  assert.equal(Object.getPrototypeOf(edit), Object.prototype);
});


// Restauração composta usa os mesmos writers de marca/imóveis e localStorage simulado já existente.
const { restoreDraftText } = await import('../public/imob/draft-restore.mjs');
const { clientBrandStorageKey, readSavedBrand } = await import('../public/imob/client-brand.mjs');
const { clientPropertyStorageKey } = await import('../public/imob/client-properties.mjs');
const oldBrandText = ' { "name": "Marca anterior", "accent": "#123456" } ';
const restorationText = () => JSON.stringify(draft({ properties: [house()] }));
function previousPersonalization() {
  saveClientProperty('l-01', { finalidade: 'locacao', titulo: 'Anterior', tipo: 'Casa', cidade: 'Itajaí', bairro: 'Centro', preco: 1200 });
  memory.set(clientBrandStorageKey, oldBrandText);
  return new Map(memory);
}

test('restauração composta: valida antes da confirmação e de qualquer gravação', async () => {
  const before = previousPersonalization();
  let confirmations = 0;
  let persists = 0;
  let writes = 0;
  localStorage.setItem = () => { writes += 1; throw new Error('não deveria gravar'); };
  const result = await restoreDraftText('{ inválido', {
    confirm: () => { confirmations += 1; return true; },
    persist: async () => { persists += 1; }
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /Não foi possível ler/);
  assert.deepEqual([confirmations, persists, writes], [0, 0, 0]);
  assert.deepEqual(memory, before);
});

test('restauração composta: cancelamento explícito mantém marca e imóveis intactos', async () => {
  const before = previousPersonalization();
  let confirms = 0;
  let persists = 0;
  const result = await restoreDraftText(restorationText(), {
    confirm: message => {
      confirms += 1;
      assert.match(message, /Horizonte Imóveis/);
      assert.match(message, /substitui a marca e os imóveis/);
      assert.deepEqual(memory, before, 'confirmação antecede as gravações');
      return false;
    },
    persist: async () => { persists += 1; }
  });
  assert.deepEqual(result, { ok: false, cancelled: true });
  assert.deepEqual([confirms, persists], [1, 0]);
  assert.deepEqual(memory, before);
});

test('restauração composta: ausência de confirmação válida impede a substituição', async () => {
  const before = previousPersonalization();
  const result = await restoreDraftText(restorationText(), { persist: async () => {} });
  assert.equal(result.ok, false);
  assert.match(result.message, /Nenhum dado foi alterado/);
  assert.deepEqual(memory, before);
});

test('restauração composta: sucesso restaura marca e imóveis e mantém a publicação anterior', async () => {
  previousPersonalization();
  const published = { brand: { name: 'Versão publicada anterior' } };
  let persists = 0;
  const result = await restoreDraftText(restorationText(), {
    confirm: () => true,
    persist: async () => {
      persists += 1;
      assert.deepEqual(readSavedBrand(), { name: 'Horizonte Imóveis' });
      const properties = readClientProperties({ onlyEdited: true });
      assert.deepEqual(properties.map(property => property.id), ['v-01']);
      assert.equal(properties[0].titulo, 'Casa');
      return { draft: { brand: readSavedBrand(), properties }, published };
    }
  });
  assert.deepEqual([result.ok, result.saved, result.rejected, persists], [true, 1, 0, 1]);
  assert.deepEqual(result.setup.draft.brand, { name: 'Horizonte Imóveis' });
  assert.equal(result.setup.published, published, 'não publica automaticamente');
});

test('restauração composta: falha ao preservar o estado anterior impede qualquer gravação', async () => {
  const before = previousPersonalization();
  const getItem = localStorage.getItem;
  let writes = 0;
  let persists = 0;
  localStorage.getItem = () => { throw new Error('leitura negada'); };
  localStorage.setItem = () => { writes += 1; };
  try {
    const result = await restoreDraftText(restorationText(), {
      confirm: () => true,
      persist: async () => { persists += 1; }
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /preservar os dados anteriores/);
    assert.deepEqual([writes, persists], [0, 0]);
    assert.deepEqual(memory, before);
  } finally {
    localStorage.getItem = getItem;
  }
});

test('restauração composta: falha na primeira gravação conserva os dados anteriores e não confirma sucesso', async () => {
  const before = previousPersonalization();
  let persists = 0;
  let writes = 0;
  localStorage.setItem = () => { writes += 1; throw new Error('cota'); };
  const result = await restoreDraftText(restorationText(), {
    confirm: () => true,
    persist: async () => { persists += 1; }
  });
  assert.deepEqual([result.ok, result.recovered, persists, writes], [false, true, 0, 1]);
  assert.equal(result.saved, undefined);
  assert.deepEqual(memory, before);
});

test('restauração composta: falha na segunda gravação recupera exatamente a marca e os imóveis anteriores', async () => {
  const before = previousPersonalization();
  let failed = false;
  let persists = 0;
  localStorage.setItem = (key, value) => {
    if (key === clientBrandStorageKey && !failed) {
      failed = true;
      assert.notEqual(memory.get(clientPropertyStorageKey), before.get(clientPropertyStorageKey), 'primeira gravação ocorreu');
      throw new Error('cota na marca');
    }
    normalSetItem(key, value);
  };
  const result = await restoreDraftText(restorationText(), {
    confirm: () => true,
    persist: async () => { persists += 1; }
  });
  assert.deepEqual([result.ok, result.recovered, persists], [false, true, 0]);
  assert.match(result.message, /dados anteriores.*recuperados/);
  assert.equal(result.setup, undefined);
  assert.deepEqual(memory, before, 'inclui texto original e nenhuma chave extra');
});

test('restauração composta: recuperação remove chaves que não existiam antes', async () => {
  localStorage.setItem = (key, value) => {
    if (key === clientBrandStorageKey) throw new Error('marca indisponível');
    normalSetItem(key, value);
  };
  const result = await restoreDraftText(restorationText(), { confirm: () => true, persist: async () => {} });
  assert.deepEqual([result.ok, result.recovered], [false, true]);
  assert.deepEqual([...memory], []);
});

test('restauração composta: falha na própria recuperação é explícita e nunca retorna sucesso', async () => {
  const before = previousPersonalization();
  localStorage.setItem = (key, value) => {
    if (key === clientBrandStorageKey || value === before.get(clientPropertyStorageKey)) throw new Error('armazenamento negado');
    normalSetItem(key, value);
  };
  const result = await restoreDraftText(restorationText(), {
    confirm: () => true,
    persist: async () => { assert.fail('persist não pode ser chamado'); }
  });
  assert.deepEqual([result.ok, result.recovered], [false, false]);
  assert.match(result.message, /não foi possível recuperar todos os dados anteriores/);
  assert.equal(result.saved, undefined);
  assert.equal(result.setup, undefined);
  assert.equal(memory.get(clientBrandStorageKey), oldBrandText);
  assert.notEqual(memory.get(clientPropertyStorageKey), before.get(clientPropertyStorageKey));
});

test('restauração composta: falha da transação do rascunho recupera as duas gravações locais', async () => {
  const before = previousPersonalization();
  let persists = 0;
  const result = await restoreDraftText(restorationText(), {
    confirm: () => true,
    persist: async () => {
      persists += 1;
      assert.notEqual(memory.get(clientBrandStorageKey), oldBrandText);
      assert.notEqual(memory.get(clientPropertyStorageKey), before.get(clientPropertyStorageKey));
      throw new Error('transação abortada');
    }
  });
  assert.deepEqual([result.ok, result.recovered, persists], [false, true, 1]);
  assert.deepEqual(memory, before);
});

test('restauração composta: recuperação continua nos imóveis mesmo quando a recuperação da marca falha', async () => {
  const before = previousPersonalization();
  localStorage.setItem = (key, value) => {
    if (key === clientBrandStorageKey && value === oldBrandText) throw new Error('recuperação da marca bloqueada');
    normalSetItem(key, value);
  };
  const result = await restoreDraftText(restorationText(), {
    confirm: () => true,
    persist: async () => { throw new Error('transação abortada'); }
  });
  assert.deepEqual([result.ok, result.recovered], [false, false]);
  assert.equal(memory.get(clientPropertyStorageKey), before.get(clientPropertyStorageKey));
  assert.notEqual(memory.get(clientBrandStorageKey), oldBrandText);
});

test('restauração composta: falha ao remover chave durante recuperação também é comunicada', async () => {
  const removeItem = localStorage.removeItem;
  localStorage.removeItem = () => { throw new Error('remoção negada'); };
  localStorage.setItem = (key, value) => {
    if (key === clientBrandStorageKey) throw new Error('marca indisponível');
    normalSetItem(key, value);
  };
  try {
    const result = await restoreDraftText(restorationText(), { confirm: () => true, persist: async () => {} });
    assert.deepEqual([result.ok, result.recovered], [false, false]);
    assert.match(result.message, /não foi possível recuperar/);
    assert.ok(memory.has(clientPropertyStorageKey));
  } finally {
    localStorage.removeItem = removeItem;
  }
});

test('restauração composta: sucesso só é retornado depois da confirmação do commit', async () => {
  previousPersonalization();
  let finish;
  const commit = new Promise(resolve => { finish = resolve; });
  let completed = false;
  const pending = restoreDraftText(restorationText(), {
    confirm: () => true,
    persist: () => commit
  }).then(result => { completed = true; return result; });
  await Promise.resolve();
  assert.equal(completed, false);
  const setup = { draft: { brand: { name: 'Horizonte Imóveis' } } };
  finish(setup);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.setup, setup);
});
