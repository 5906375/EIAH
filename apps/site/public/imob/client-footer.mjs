export const footerFields = [
  'footerLegalName', 'footerResponsible', 'footerRole', 'footerCnpj', 'footerCreci',
  'footerAddress', 'footerPhone', 'footerWhatsapp', 'footerEmail'
];

export function contactNumber(value) {
  const compact = value.replace(/[().\s-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact.slice(1);
  if (/^55[1-9]\d{9,10}$/.test(compact)) return compact;
  if (/^[1-9]\d{9,10}$/.test(compact)) return '55' + compact;
  return '';
}

function appendDetail(list, label, value, example, href = '') {
  const row = document.createElement('div');
  const labelNode = document.createElement('dt');
  const detail = document.createElement('dd');
  labelNode.textContent = label;
  if (value && href) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = value;
    if (href.startsWith('https://')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    detail.append(link);
  } else {
    detail.textContent = value || 'Ex.: ' + example;
    if (!value) detail.className = 'client-footer-example';
  }
  row.append(labelNode, detail);
  list.append(row);
}

export function renderClientFooter(container, profile = {}) {
  const {
    name, contact, footerLegalName, footerResponsible, footerRole, footerCnpj,
    footerCreci, footerAddress, footerPhone = '', footerWhatsapp = '', footerEmail = ''
  } = profile;
  const identity = document.createElement('div');
  identity.className = 'client-footer-identity';
  const title = document.createElement('p');
  title.className = 'client-footer-title';
  title.textContent = name || 'Nome da imobiliária';
  identity.append(title);
  if (!name) {
    const example = document.createElement('p');
    example.className = 'client-footer-example';
    example.textContent = 'Ex.: Imobiliária Exemplo';
    identity.append(example);
  }
  if (!footerLegalName || footerLegalName !== name) {
    const legalName = document.createElement('dl');
    appendDetail(legalName, 'Razão social ou nome profissional', footerLegalName, 'Imobiliária Exemplo Ltda.');
    identity.append(legalName);
  }

  const registration = document.createElement('dl');
  appendDetail(registration, 'Responsável', [footerResponsible, footerRole].filter(Boolean).join(' · '),
    'Pessoa Exemplo · Corretora responsável');
  appendDetail(registration, 'CNPJ', footerCnpj, '00.000.000/0000-00');
  appendDetail(registration, 'CRECI', footerCreci, 'CRECI-SC 00000');
  appendDetail(registration, 'Endereço comercial', footerAddress, 'Rua Exemplo, 100, Centro, Itapema – SC');

  const channels = document.createElement('dl');
  const phone = contactNumber(footerPhone);
  const whatsapp = contactNumber(footerWhatsapp);
  const email = /^[^\s@]+@[^\s@]+$/.test(footerEmail)
    ? 'mailto:' + encodeURIComponent(footerEmail).replace('%40', '@') : '';
  appendDetail(channels, 'Atendimento', contact, 'Equipe de atendimento imobiliário');
  appendDetail(channels, 'Telefone', footerPhone, '(47) 0000-0000', phone ? 'tel:+' + phone : '');
  appendDetail(channels, 'WhatsApp', footerWhatsapp, '(47) 00000-0000', whatsapp ? 'https://wa.me/' + whatsapp : '');
  appendDetail(channels, 'E-mail', footerEmail, 'contato@example.com', email);

  container.replaceChildren(identity, registration, channels);
}
