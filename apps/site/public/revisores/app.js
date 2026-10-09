'use strict';
const form = document.getElementById('registration');
const result = document.getElementById('result');
const error = document.getElementById('error');
const selected = name => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`), el => el.value);
let message = '';
form.addEventListener('submit', event => {
  event.preventDefault(); result.hidden = true; error.textContent = '';
  if (!form.reportValidity()) return;
  const name = document.getElementById('name').value.trim();
  const areas = selected('area');
  if (name.length < 2) { error.textContent = 'Informe seu nome.'; document.getElementById('name').focus(); return; }
  if (!areas.length) { error.textContent = 'Selecione UI, UX ou ambas.'; form.querySelector('[name="area"]').focus(); return; }
  const portfolio = document.getElementById('portfolio').value.trim();
  if (portfolio && !/^https?:\/\//i.test(portfolio)) { error.textContent = 'Use um link iniciado por https:// ou http://.'; document.getElementById('portfolio').focus(); return; }
  const devices = selected('device');
  const lines = ['Inscrição de interesse — Revisores EIAH', `Nome: ${name}`, `E-mail: ${document.getElementById('email').value.trim()}`, `Áreas: ${areas.join(' e ')}`];
  const experience = document.getElementById('experience').value;
  if (experience) lines.push(`Experiência: ${experience}`);
  if (portfolio) lines.push(`Portfólio: ${portfolio}`);
  if (devices.length) lines.push(`Dispositivos: ${devices.join(', ')}`);
  lines.push('', 'Autorizo o uso dos dados informados para avaliar minha participação e entrar em contato sobre os testes de UI e UX do EIAH. Posso retirar esta autorização pelo canal institucional.', 'Texto de consentimento: revisores.v1 — 03/10/2026', `Preparação da mensagem: ${new Date().toISOString()}`, 'Este cadastro não concede acesso ao ambiente de testes.');
  message = lines.join('\n');
  document.getElementById('summary').textContent = message;
  document.getElementById('send').href = 'mailto:contato@eiah.ia.br?subject=' + encodeURIComponent('Inscrição de revisor EIAH — ' + areas.join(' e ')) + '&body=' + encodeURIComponent(message);
  result.hidden = false; result.scrollIntoView({behavior:'smooth', block:'nearest'});
});
form.addEventListener('reset', () => { result.hidden = true; error.textContent = ''; message = ''; document.getElementById('summary').textContent = ''; document.getElementById('send').removeAttribute('href'); document.getElementById('copyStatus').textContent = ''; });
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(message); document.getElementById('copyStatus').textContent = 'Inscrição copiada. Cole no e-mail e envie para concluir.'; }
  catch { document.getElementById('copyStatus').textContent = 'Selecione e copie o texto acima manualmente.'; }
});
