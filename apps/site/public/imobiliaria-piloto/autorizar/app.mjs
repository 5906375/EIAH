import { buildAuthorization } from './termo.mjs';
const form = document.querySelector('#authorizationForm');
const result = document.querySelector('#result');
const error = document.querySelector('#error');
let current = null;
document.querySelector('#endDate').min = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function invalidate() { current = null; result.hidden = true; error.textContent = ''; }
form.addEventListener('input', invalidate);
form.addEventListener('change', invalidate);
document.querySelector('#role').addEventListener('change', event => {
  const role = event.target.value;
  document.querySelector('#authority').required = role !== '' && role !== 'proprietario';
  document.querySelector('#authorityHint').textContent = role === 'proprietario' ? '(opcional para proprietário)' : '(obrigatório para representação / copropriedade)';
  document.querySelector('#creciLabel').hidden = role !== 'corretor';
  document.querySelector('#creci').required = role === 'corretor';
});
document.querySelector('#purpose').addEventListener('change', event => {
  document.querySelector('#priceLabel').textContent = event.target.value === 'temporada' ? 'Valor da diária autorizado (R$)' : event.target.value === 'locacao' ? 'Aluguel mensal autorizado (R$)' : 'Valor autorizado no anúncio (R$)';
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  try {
    current = buildAuthorization({ ...Object.fromEntries(fields), channels: fields.getAll('channels'), authorityConfirmed: fields.has('authorityConfirmed'), materialConfirmed: fields.has('materialConfirmed'), termsConfirmed: fields.has('termsConfirmed') });
    document.querySelector('#term').textContent = current.text;
    result.hidden = false;
    document.querySelector('#resultTitle').focus();
    result.scrollIntoView({behavior:'smooth',block:'start'});
  } catch (failure) { error.textContent = failure.message; }
});
document.querySelector('#download').addEventListener('click', () => {
  if (!current) return;
  const href = URL.createObjectURL(new Blob([current.text], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = href; link.download = 'EIAH-Imoveis-autorizacao-para-assinatura.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
});
document.querySelector('#print').addEventListener('click', () => { if (current) window.print(); });
