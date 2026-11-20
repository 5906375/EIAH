import { renderClientFooter } from './client-footer.mjs';

const key = 'eiah-imob-visual:client-brand:v1';
const defaults = Object.freeze({
  name: 'Imobiliária Horizonte',
  accent: '#087566',
  introduction: 'Encontre imóveis para comprar, alugar ou passar a temporada no litoral catarinense.',
  contact: 'Equipe de atendimento',
  logo: ''
});
const validLogo = value => typeof value === 'string' && value.length < 730000 &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);

export function readSavedBrand() {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

export function readBrand() {
  return { ...defaults, ...readSavedBrand() };
}

export function saveBrand(profile) {
  try {
    localStorage.setItem(key, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function accessibleAccent(hex) {
  const selected = /^#[0-9a-f]{6}$/i.test(hex) ? hex : defaults.accent;
  let channels = selected.slice(1).match(/../g).map(value => parseInt(value, 16));
  function luminance() {
    const rgb = channels.map(channel => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  while (1.05 / (luminance() + .05) < 4.5) {
    channels = channels.map(channel => Math.floor(channel * .94));
  }
  return '#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join('');
}

export function applyBrand(scope, profile, { preview = false } = {}) {
  const brand = { ...defaults, ...profile };
  const { name, introduction, logo } = brand;
  scope.style.setProperty('--brand', accessibleAccent(profile.accent));
  scope.querySelectorAll('[data-client-name]').forEach(el => { el.textContent = name || 'Sua imobiliária'; });
  scope.querySelectorAll('[data-client-intro]').forEach(el => { el.textContent = introduction; });
  scope.querySelectorAll('[data-client-footer]').forEach(el => {
    renderClientFooter(el, preview || profile.footerConfirmed === true ? brand : undefined);
  });
  scope.querySelectorAll('[data-client-logo]').forEach(el => {
    if (validLogo(logo)) {
      const image = document.createElement('img');
      image.src = logo;
      image.alt = '';
      el.replaceChildren(image);
    } else {
      el.textContent = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || (preview ? 'SI' : 'IH');
    }
  });
}

if (document.body.dataset.product === 'ia-cliente') {
  const render = () => {
    const brand = readBrand();
    applyBrand(document.body, brand);
    if (document.body.hasAttribute('data-storefront')) document.title = brand.name;
  };
  render();
  addEventListener('pageshow', render);
  addEventListener('storage', event => { if (event.key === key) render(); });
} else if (document.body.dataset.product === 'operacao-eiah') {
  document.querySelectorAll('[data-client-footer]').forEach(el => renderClientFooter(el));
}
