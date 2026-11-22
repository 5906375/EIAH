import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { contactNumber } from '../public/imob/client-footer.mjs';

const root = new URL('../public/imob/', import.meta.url);
const limit = 10;
const marker = '<!doctype html>\n<!-- Vitrine do piloto IMOB -->';
const slugFormat = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const units = { venda: '', locacao: ' por mês', temporada: ' por diária' };
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);

function readPage(slug) {
  try {
    return readFileSync(new URL(slug + '/index.html', root), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return '';
  }
}

function countSites() {
  return readdirSync(root, { withFileTypes: true }).filter(entry =>
    entry.isDirectory() && readPage(entry.name).startsWith(marker)
  ).length;
}

function imageSource(value) {
  if (typeof value !== 'string') return '';
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value)) return value;
  const asset = value.match(/(?:^\.\/assets\/|^(?:https:\/\/(?:www\.)?eiah\.ia\.br)?\/imob\/assets\/)([a-z0-9-]+\.webp)$/i);
  return asset ? '/imob/assets/' + asset[1] : '';
}

function renderProperty(property) {
  if (!property || typeof property.titulo !== 'string' || !Object.hasOwn(units, property.finalidade) ||
      typeof property.preco !== 'number' || !Number.isFinite(property.preco) || property.preco < 0) {
    throw new Error('Confira o título, a finalidade e o preço dos imóveis no rascunho.');
  }
  const { titulo, bairro, cidade, preco, descricao, finalidade, fotos } = property;
  const images = (Array.isArray(fotos) ? fotos : []).map(imageSource).filter(Boolean)
    .map(src => '<img src="' + escape(src) + '" alt="Foto de ' + escape(titulo) + '" loading="lazy">').join('');
  return `<article class="setup-option">
    <h3>${escape(titulo)}</h3>
    <p>${escape([bairro, cidade].filter(Boolean).join(' · '))}</p>
    <p><strong>${currency.format(preco)}${units[finalidade]}</strong></p>
    <p>${escape(descricao)}</p>
    ${images ? '<div class="property-context-photos" tabindex="0" aria-label="Fotos do imóvel">' + images + '</div>' : ''}
  </article>`;
}

function renderSite({ brand, properties }) {
  if (!brand || typeof brand.name !== 'string' || !brand.name.trim() || !Array.isArray(properties)) {
    throw new Error('Exporte um rascunho válido pelo editor IMOB.');
  }
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accent) ? brand.accent : '#087566';
  const whatsapp = contactNumber(String(brand.footerWhatsapp ?? ''));
  const phone = contactNumber(String(brand.footerPhone ?? ''));
  const email = String(brand.footerEmail ?? '').trim();
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const contacts = [
    whatsapp ? '<a class="btn btn-ghost" href="https://wa.me/' + whatsapp + '">Falar pelo WhatsApp</a>' : '',
    phone ? '<a class="btn btn-ghost" href="tel:+' + phone + '">Ligar</a>' : '',
    hasEmail ? '<a class="btn btn-ghost" href="mailto:' + encodeURIComponent(email).replace('%40', '@') + '">Enviar e-mail</a>' : ''
  ].join('');
  const logo = imageSource(brand.logo);
  return `${marker}
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(brand.name)}</title>
  <link rel="stylesheet" href="/imob/catalog.css">
  <link rel="stylesheet" href="/imob/visual.css">
  <link rel="stylesheet" href="/imob/site-setup.css">
</head>
<body style="--brand:${accent}">
  <main class="wrap setup">
    ${logo ? '<img src="' + escape(logo) + '" width="144" alt="">' : ''}
    <h1>${escape(brand.name)}</h1>
    <p class="lead">${escape(brand.introduction)}</p>
    ${contacts ? '<div class="next-actions">' + contacts + '</div>' : ''}
    <section class="setup-panel" aria-labelledby="imoveis">
      <h2 id="imoveis">Imóveis</h2>
      <div class="setup-homes">${properties.map(renderProperty).join('') || '<p>Nenhum imóvel anunciado no momento.</p>'}</div>
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
}

function run([slug, file, ...extra]) {
  const count = countSites();
  if (count > limit) throw new Error('O piloto IMOB ultrapassou o limite de 10 vitrines. Corrija antes de publicar.');
  if (slug === '--check' && !file && !extra.length) {
    console.log('Piloto IMOB: ' + count + '/' + limit + ' vitrines.');
    return;
  }
  if (!file || extra.length || !slugFormat.test(slug ?? '') || slug.length > 65) {
    throw new Error('Uso: node apps/site/scripts/publish-imob-pilot.mjs nome-do-site rascunho.json');
  }
  const existing = readdirSync(root).includes(slug);
  if (existing && !readPage(slug).startsWith(marker)) {
    throw new Error('Endereço reservado no IMOB.');
  }
  if (!existing && count >= limit) throw new Error('As 10 vagas do piloto já foram preenchidas.');
  const page = renderSite(JSON.parse(readFileSync(file, 'utf8')));
  if (Buffer.byteLength(page) > 25 * 1024 * 1024) {
    throw new Error('A vitrine excede o limite de 25 MiB do Cloudflare. Reduza as fotos e exporte novamente.');
  }
  const directory = new URL(slug + '/', root);
  if (!existing) mkdirSync(directory);
  const temporary = new URL('.piloto-' + process.pid + '.tmp', directory);
  try {
    writeFileSync(temporary, page, { flag: 'wx' });
    renameSync(temporary, new URL('index.html', directory));
  } catch (error) {
    rmSync(temporary, { force: true });
    if (!existing) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  console.log('Vitrine pronta para deploy em https://eiah.ia.br/imob/' + slug + '/');
}

try {
  run(process.env.WRANGLER_COMMAND ? ['--check'] : process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
