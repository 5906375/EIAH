import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { contactNumber } from '../public/imob/client-footer.mjs';
import { PILOT_LIMIT, PILOT_ORIGIN, reservedSlugs, slugProblem } from '../public/imob/pilot-site.mjs';
import { rentalCosts, unknownChargesNotice } from '../public/imob/rental-costs.mjs';

export { reservedSlugs };

const defaultRoot = new URL('../public/imob/', import.meta.url);
const limit = PILOT_LIMIT;
const slotsFile = 'piloto-vagas.json';
const exampleMark = '<!-- Vitrine de exemplo';
const examplePrefix = 'exemplo-';
const exampleNotice = 'Vitrine de exemplo. Nomes, imóveis, valores e fotos são ilustrativos e não representam anúncios reais.';
const marker = '<!doctype html>\n<!-- Vitrine do piloto IMOB -->';
const units = { venda: '', locacao: ' por mês', temporada: ' por diária' };
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
const maxImageBytes = 5 * 1024 * 1024;
const maxFeatures = 20;
const maxProperties = 50;
const maxPhotos = 20;
const textLimits = { titulo: 100, tipo: 40, cidade: 60, bairro: 60, descricao: 800 };


// Confere o conteúdo real do arquivo, não só o prefixo data: informado no rascunho.
const imageTypes = {
  png: bytes => bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpeg: bytes => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  webp: bytes => bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP'
};

function readPage(root, slug) {
  try {
    return readFileSync(new URL(slug + '/index.html', root), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return '';
  }
}

function countSites(root) {
  return readdirSync(root, { withFileTypes: true }).filter(entry =>
    entry.isDirectory() && !entry.name.startsWith('.') && readPage(root, entry.name).startsWith(marker)
  ).length;
}

function decodeImage(value) {
  const match = typeof value === 'string' && value.match(/^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  const type = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  return bytes.length && bytes.length <= maxImageBytes && imageTypes[type](bytes) ? { type, bytes } : null;
}

// Foto enviada pelo cliente vira arquivo ao lado da página (fotos/…); imagem do site continua apontando para /imob/assets.
function imageSource(value, { slug, files }, name) {
  const image = decodeImage(value);
  if (image) {
    const path = 'fotos/' + name + '.' + (image.type === 'jpeg' ? 'jpg' : image.type);
    files.set(path, image.bytes);
    return '/imob/' + slug + '/' + path;
  }
  if (typeof value !== 'string') return '';
  const asset = value.match(/(?:^\.\/assets\/|^(?:https:\/\/(?:www\.)?eiah\.ia\.br)?\/imob\/assets\/)([a-z0-9-]+\.webp)$/i);
  return asset ? '/imob/assets/' + asset[1] : '';
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const count = (value, one, many) => positive(value) ? value + ' ' + (value === 1 ? one : many) : '';

function specs(property) {
  const { tipo, area, quartos, suites, banheiros, vagas, stay, finalidade } = property;
  return [
    typeof tipo === 'string' ? tipo.trim() : '',
    positive(area) ? area + ' m²' : '',
    count(quartos, 'quarto', 'quartos'),
    count(suites, 'suíte', 'suítes'),
    count(banheiros, 'banheiro', 'banheiros'),
    count(vagas, 'vaga', 'vagas'),
    finalidade === 'temporada' && positive(stay?.maxGuests) ? 'até ' + count(stay.maxGuests, 'hóspede', 'hóspedes') : ''
  ].filter(Boolean);
}

// Encargos só para locação, sem inventar valor: o que não foi informado aparece como "não informado".
function costLines(property) {
  if (property.finalidade === 'temporada') {
    return positive(property.stay?.cleaning) ? ['Taxa de limpeza ' + currency.format(property.stay.cleaning)] : [];
  }
  if (property.finalidade !== 'locacao') return [];
  const costs = rentalCosts(property);
  const lines = costs.charges.filter(charge => charge.known).map(charge => charge.label + ' ' + currency.format(charge.amount));
  const notice = unknownChargesNotice(costs);
  if (notice) lines.push(notice);
  if (costs.total !== null) lines.push('Total mensal ' + currency.format(costs.total));
  return lines;
}

function renderProperty(property, index, context) {
  if (!property || typeof property.titulo !== 'string' || !property.titulo.trim() || !Object.hasOwn(units, property.finalidade) ||
      typeof property.preco !== 'number' || !Number.isFinite(property.preco) || property.preco < 0) {
    throw new Error('Confira o título, a finalidade e o preço dos imóveis no rascunho.');
  }
  const { titulo, bairro, cidade, preco, descricao, finalidade, fotos } = property;
  const images = (Array.isArray(fotos) ? fotos : []).map((photo, photoIndex) => imageSource(photo, context, 'imovel-' + (index + 1) + '-' + (photoIndex + 1)))
    .filter(Boolean)
    .map(src => '<img src="' + escape(src) + '" alt="Foto de ' + escape(titulo) + '" loading="lazy">').join('');
  const features = (Array.isArray(property.caracteristicas) ? property.caracteristicas : [])
    .filter(item => typeof item === 'string' && item.trim()).slice(0, maxFeatures).map(item => item.trim());
  const facts = specs(property);
  const costs = costLines(property);
  return `<article class="setup-option">
    <h3>${escape(titulo)}</h3>
    <p>${escape([bairro, cidade].filter(Boolean).join(' · '))}</p>
    <p><strong>${currency.format(preco)}${units[finalidade]}</strong></p>
    ${facts.length ? '<div class="specs">' + facts.map(item => '<span>' + escape(item) + '</span>').join('') + '</div>' : ''}
    ${costs.length ? '<div class="specs">' + costs.map(item => '<span>' + escape(item) + '</span>').join('') + '</div>' : ''}
    <p>${escape(descricao)}</p>
    ${features.length ? '<p>Características: ' + escape(features.join(', ')) + '</p>' : ''}
    ${images ? '<div class="property-context-photos" tabindex="0" aria-label="Fotos do imóvel">' + images + '</div>' : ''}
  </article>`;
}

const isAmount = value => value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const isOptionalText = (value, max) => value === undefined || value === null || (typeof value === 'string' && value.length <= max);

// Confere o rascunho inteiro e lista todos os problemas de uma vez, em português, antes de gravar qualquer arquivo.
export function validateDraft(draft) {
  const { brand, properties } = draft ?? {};
  if (!brand || typeof brand !== 'object' || Array.isArray(brand) || !Array.isArray(properties)) {
    throw new Error('Exporte um rascunho válido pelo editor IMOB.');
  }
  const problems = [];
  if (typeof brand.name !== 'string' || !brand.name.trim()) problems.push('Informe o nome da imobiliária.');
  else if (brand.name.length > 80) problems.push('O nome da imobiliária passa de 80 caracteres.');
  if (!isOptionalText(brand.introduction, 500)) problems.push('A apresentação deve ser um texto de até 500 caracteres.');
  if (properties.length > maxProperties) problems.push('O rascunho tem ' + properties.length + ' imóveis; o limite é ' + maxProperties + '.');
  properties.slice(0, maxProperties).forEach((property, index) => {
    const label = 'Imóvel ' + (index + 1) + ': ';
    if (!property || typeof property !== 'object' || Array.isArray(property)) {
      problems.push(label + 'dados inválidos.');
      return;
    }
    if (typeof property.titulo !== 'string' || !property.titulo.trim()) problems.push(label + 'informe o título.');
    if (!Object.hasOwn(units, property.finalidade)) problems.push(label + 'a finalidade deve ser venda, locação ou temporada.');
    if (typeof property.preco !== 'number' || !Number.isFinite(property.preco) || property.preco < 0) problems.push(label + 'o preço é inválido.');
    for (const [field, max] of Object.entries(textLimits)) {
      if (!isOptionalText(property[field], max)) problems.push(label + 'o campo ' + field + ' deve ser um texto de até ' + max + ' caracteres.');
    }
    for (const field of ['area', 'quartos', 'suites', 'banheiros', 'vagas', 'condominio', 'iptu']) {
      if (!isAmount(property[field])) problems.push(label + 'o campo ' + field + ' deve ser um número maior ou igual a zero.');
    }
    if (property.caracteristicas !== undefined && !(Array.isArray(property.caracteristicas) && property.caracteristicas.every(item => typeof item === 'string'))) {
      problems.push(label + 'as características devem ser uma lista de textos.');
    }
    if (property.fotos !== undefined && !(Array.isArray(property.fotos) && property.fotos.length <= maxPhotos)) {
      problems.push(label + 'as fotos devem ser uma lista de até ' + maxPhotos + '.');
    }
    if (property.stay !== undefined && (!property.stay || !isAmount(property.stay.maxGuests) || !isAmount(property.stay.cleaning))) {
      problems.push(label + 'os dados de temporada são inválidos.');
    }
  });
  if (problems.length) throw new Error('Corrija o rascunho antes de publicar:\n- ' + problems.join('\n- '));
}

export function renderSite(draft, slug, { example = false } = {}) {
  validateDraft(draft);
  const { brand, properties } = draft;
  const context = { slug, files: new Map() };
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accent) ? brand.accent : '#087566';
  const whatsapp = contactNumber(String(brand.footerWhatsapp ?? ''));
  const phone = contactNumber(String(brand.footerPhone ?? ''));
  const email = String(brand.footerEmail ?? '').trim();
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // Vitrine de exemplo nunca traz contatos: os dados são fictícios e ninguém deve ligar ou escrever para eles.
  const contacts = example ? '' : [
    whatsapp ? '<a class="btn btn-ghost" href="https://wa.me/' + whatsapp + '">Falar pelo WhatsApp</a>' : '',
    phone ? '<a class="btn btn-ghost" href="tel:+' + phone + '">Ligar</a>' : '',
    hasEmail ? '<a class="btn btn-ghost" href="mailto:' + encodeURIComponent(email).replace('%40', '@') + '">Enviar e-mail</a>' : ''
  ].join('');
  const logo = imageSource(brand.logo, context, 'logo');
  const homes = properties.map((property, index) => renderProperty(property, index, context)).join('');
  // Metadados para buscadores e para a prévia ao compartilhar o link (WhatsApp, redes sociais).
  const address = PILOT_ORIGIN + slug + '/';
  const summary = String(brand.introduction ?? '').replace(/\s+/g, ' ').trim().slice(0, 155) || 'Imóveis de ' + brand.name.trim() + '.';
  const firstImage = homes.match(/<img src="([^"]+)"/)?.[1] ?? '';
  const html = `${marker}
${example ? exampleMark + ': imobiliária fictícia criada pela EIAH -->\n' : ''}<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(brand.name)}${example ? ' · Vitrine de exemplo' : ''}</title>
  ${example ? '<meta name="robots" content="noindex,nofollow">' : ''}
  <meta name="description" content="${escape(summary)}">
  <link rel="canonical" href="${address}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${escape(brand.name)}">
  <meta property="og:description" content="${escape(summary)}">
  <meta property="og:url" content="${address}">
  ${firstImage ? '<meta property="og:image" content="' + (firstImage.startsWith('/') ? 'https://eiah.ia.br' : '') + firstImage + '">' : ''}
  <link rel="stylesheet" href="/imob/catalog.css">
  <link rel="stylesheet" href="/imob/visual.css">
  <link rel="stylesheet" href="/imob/site-setup.css">
</head>
<body style="--brand:${accent}">
  <main class="wrap setup">
    ${example ? '<p class="example-banner" role="note"><strong>Vitrine de exemplo.</strong> ' + escape(exampleNotice.replace('Vitrine de exemplo. ', '')) + '</p>' : ''}
    ${logo ? '<img src="' + escape(logo) + '" width="144" alt="">' : ''}
    <h1>${escape(brand.name)}</h1>
    <p class="lead">${escape(brand.introduction)}</p>
    ${contacts ? '<div class="next-actions">' + contacts + '</div>' : ''}
    <section class="setup-panel" aria-labelledby="imoveis">
      <h2 id="imoveis">Imóveis</h2>
      <div class="setup-homes">${homes || '<p>Nenhum imóvel anunciado no momento.</p>'}</div>
    </section>
  </main>
  <footer class="client-footer"><div class="wrap client-footer-shell">
    <p>${escape(brand.footerLegalName || brand.name)}</p>
    <p>${escape([brand.footerResponsible, brand.footerCreci, brand.footerCnpj].filter(Boolean).join(' · '))}</p>
    <p>${escape(brand.footerAddress)}</p>
    ${contacts ? '<div class="next-actions">' + contacts + '</div>' : ''}
  </div></footer>
</body>
</html>`;
  return { html, files: context.files };
}

/** Remove as vitrines de exemplo (pastas exemplo-*) e atualiza o contador de vagas. Devolve quantas saíram. */
export function removeExamples(root = defaultRoot) {
  let removed = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const page = readPage(root, entry.name);
    if (page.startsWith(marker) && page.includes(exampleMark)) {
      rmSync(new URL(entry.name + '/', root), { recursive: true, force: true });
      removed += 1;
    }
  }
  syncSlots(root);
  return removed;
}

// A tela "Criar meu site" mostra quantas vagas restam lendo este arquivo. Ele só é regravado quando muda.
export function syncSlots(root = defaultRoot) {
  const content = JSON.stringify({ limit, used: countSites(root) }) + '\n';
  const file = new URL(slotsFile, root);
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current === content) return false;
  writeFileSync(file, content);
  return true;
}

function checkLimit(root) {
  const sites = countSites(root);
  if (sites > limit) throw new Error('O piloto IMOB ultrapassou o limite de 10 vitrines. Corrija antes de publicar.');
  return sites;
}

export function publish(slug, draft, { root = defaultRoot, example = false } = {}) {
  const sites = checkLimit(root);
  const problem = slugProblem(slug);
  if (problem) throw new Error(problem);
  // O prefixo "exemplo-" separa as vitrines de demonstração das de clientes: uma não pode se passar pela outra.
  if (example && !slug.startsWith(examplePrefix)) throw new Error('O endereço de uma vitrine de exemplo deve começar com "' + examplePrefix + '".');
  if (!example && slug.startsWith(examplePrefix)) throw new Error('O prefixo "' + examplePrefix + '" é reservado às vitrines de exemplo.');
  const existing = readdirSync(root).includes(slug);
  if (existing && !readPage(root, slug).startsWith(marker)) {
    throw new Error('Endereço reservado no IMOB.');
  }
  if (!existing && sites >= limit) throw new Error('As 10 vagas do piloto já foram preenchidas.');
  // Monta tudo numa pasta temporária e só então troca; falha no meio não deixa a vitrine pela metade.
  const { html, files } = renderSite(draft, slug, { example });
  const stage = new URL('.piloto-' + process.pid + '/', root);
  const backup = new URL('.piloto-antigo-' + process.pid + '/', root);
  const target = new URL(slug + '/', root);
  rmSync(stage, { recursive: true, force: true });
  try {
    mkdirSync(stage);
    writeFileSync(new URL('index.html', stage), html, { flag: 'wx' });
    for (const [path, bytes] of files) {
      mkdirSync(new URL('fotos/', stage), { recursive: true });
      writeFileSync(new URL(path, stage), bytes, { flag: 'wx' });
    }
    if (existing) renameSync(target, backup);
    try {
      renameSync(stage, target);
    } catch (error) {
      if (existing) renameSync(backup, target);
      throw error;
    }
    rmSync(backup, { recursive: true, force: true });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  syncSlots(root);
  return { url: PILOT_ORIGIN + slug + '/', photos: files.size };
}

export function run(argv, { root = defaultRoot } = {}) {
  const example = argv[0] === '--exemplo';
  const [slug, file, ...extra] = example ? argv.slice(1) : argv;
  if (!example && slug === '--remover-exemplos' && !file && !extra.length) {
    console.log('Vitrines de exemplo removidas: ' + removeExamples(root) + '. Vagas do piloto: ' + (limit - checkLimit(root)) + '/' + limit + ' livres.');
    return;
  }
  if (!example && slug === '--check' && !file && !extra.length) {
    const sites = checkLimit(root);
    const changed = syncSlots(root);
    console.log('Piloto IMOB: ' + sites + '/' + limit + ' vitrines.' + (changed ? ' Arquivo ' + slotsFile + ' atualizado.' : ''));
    return;
  }
  if (!file || extra.length) {
    throw new Error('Uso: node apps/site/scripts/publish-imob-pilot.mjs [--exemplo] nome-do-site rascunho.json');
  }
  let draft;
  try {
    draft = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Não foi possível ler o rascunho. Baixe de novo o arquivo vitrine-imob.json no editor IMOB.');
  }
  const result = publish(slug, draft, { root, example });
  console.log((example ? 'Vitrine de exemplo pronta' : 'Vitrine pronta') + ' para deploy em ' + result.url + (result.photos ? ' (' + result.photos + ' arquivo(s) de imagem)' : ''));
}

export function main(argv, options) {
  try {
    run(argv, options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
