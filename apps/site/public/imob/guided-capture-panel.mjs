import {
  GUIDED_FIELDS, canApply, currentStep, editStep, fieldQuestion, goBack, goToReview, guidedSteps,
  missingRequired, reviewItems, skipField, startGuided, submitAnswer, toFormValues
} from './guided-capture.mjs';

// Painel do cadastro guiado. Só coleta e mostra: as regras ficam em guided-capture.mjs.
// Nada é escrito no formulário nem salvo antes de "Aplicar imóvel à vitrine".
const form = document.getElementById('propertyEditor');
const root = document.getElementById('guidedCapture');

function element(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key in node && key !== 'type' && key !== 'for') node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function init() {
  const body = root.querySelector('#guidedBody');
  const start = root.querySelector('#guidedStart');
  const choice = document.getElementById('propertyChoice');
  const formField = name => form.elements.namedItem(name);
  let state = null;

  const currentFormValues = () => Object.fromEntries(
    GUIDED_FIELDS.map(({ name }) => [name, formField(name)?.value ?? ''])
  );
  const inputText = value => (value === null || value === undefined ? '' : String(value).replace('.', ','));
  // replaceChildren(null) escreveria o texto "null": nós ausentes precisam ser descartados.
  const show = (...nodes) => body.replaceChildren(...nodes.filter(Boolean));

  function focusLater(target) {
    queueMicrotask(() => body.querySelector(target)?.focus());
  }

  function button(label, onClick, { primary = false, disabled = false, describedBy } = {}) {
    const node = element('button', { type: 'button', className: 'btn ' + (primary ? 'btn-primary' : 'btn-ghost'), text: label });
    node.disabled = disabled;
    if (describedBy) node.setAttribute('aria-describedby', describedBy);
    node.addEventListener('click', onClick);
    return node;
  }

  function renderCollecting() {
    const steps = guidedSteps(state.values);
    const step = currentStep(state);
    const value = state.values[step.name];
    let control;
    if (step.kind === 'choice') {
      control = element('select', { id: 'guidedInput' },
        element('option', { value: '', text: 'Selecione' }),
        ...Object.entries(step.options).map(([key, label]) => element('option', { value: key, text: label })));
      control.value = value ?? '';
    } else if (step.kind === 'longtext') {
      control = element('textarea', { id: 'guidedInput', rows: 4, value: value ?? '' });
    } else {
      control = element('input', {
        id: 'guidedInput', type: 'text', autocomplete: 'off',
        inputMode: step.kind === 'money' || step.kind === 'area' ? 'decimal' : step.kind === 'count' ? 'numeric' : 'text',
        value: step.kind === 'text' ? (value ?? '') : inputText(value)
      });
    }
    control.setAttribute('form', 'guidedNoForm'); // evita enviar o formulário principal com Enter
    if (state.error) {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', 'guidedError');
    }
    const submit = () => { state = submitAnswer(state, control.value); render(); };
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter' && step.kind !== 'longtext') { event.preventDefault(); submit(); }
    });
    const last = state.index === steps.length - 1;
    show(
      element('p', { className: 'guided-progress', text: `Passo ${state.index + 1} de ${steps.length}` }),
      element('progress', { max: steps.length, value: state.index + 1, 'aria-hidden': 'true' }),
      element('label', { for: 'guidedInput', className: 'field-label', text: fieldQuestion(step, state.values) }),
      control,
      state.error ? element('p', { id: 'guidedError', className: 'guided-error', role: 'alert', text: state.error }) : null,
      element('div', { className: 'next-actions guided-actions' },
        button('Voltar', () => { state = goBack(state); render(); }, { disabled: state.index === 0 }),
        step.required ? null : button('Pular', () => { state = skipField(state); render(); }),
        button(last ? 'Ir para a revisão' : 'Próximo', submit, { primary: true }),
        button('Revisar agora', () => { state = goToReview(state); render(); }),
        button('Cancelar', () => { state = null; render(); })
      )
    );
    focusLater('#guidedInput');
  }

  function renderReview() {
    const items = reviewItems(state);
    const blocked = !canApply(state);
    const list = element('dl', { className: 'guided-review' });
    for (const item of items) {
      const fix = button('Corrigir', () => { state = editStep(state, item.name); render(); });
      fix.setAttribute('aria-label', 'Corrigir ' + item.label);
      list.append(element('div', {},
        element('dt', { text: item.label }),
        element('dd', {}, element('span', { text: item.display, className: item.missing ? 'guided-missing' : '' }), fix)));
    }
    const missing = missingRequired(state).map(item => item.label.toLowerCase()).join(', ');
    show(
      element('h4', { id: 'guidedReviewTitle', tabindex: '-1', text: 'Revise antes de aplicar' }),
      element('p', { className: 'field-help', text: 'Nada foi salvo ainda. O imóvel só entra na vitrine quando você aplicar. Fotos e vídeos (opcionais) são escolhidos nos campos abaixo deste painel.' }),
      list,
      blocked ? element('p', { id: 'guidedBlocked', className: 'guided-error', role: 'alert', text: 'Falta informar: ' + missing + '.' }) : null,
      element('div', { className: 'next-actions guided-actions' },
        button('Voltar', () => { state = goBack(state); render(); }),
        button('Cancelar', () => { state = null; render(); }),
        button('Aplicar imóvel à vitrine', apply, { primary: true, disabled: blocked, describedBy: blocked ? 'guidedBlocked' : undefined })
      )
    );
    focusLater('#guidedReviewTitle');
  }

  function apply() {
    if (!state || !canApply(state)) return;
    for (const [name, value] of Object.entries(toFormValues(state))) {
      const control = formField(name);
      if (!control) continue;
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true })); // atualiza a prévia e os campos de temporada
    }
    form.requestSubmit();
  }

  function render() {
    start.hidden = Boolean(state);
    if (!state) body.replaceChildren();
    else if (state.phase === 'review') renderReview();
    else renderCollecting();
  }

  start.addEventListener('click', () => {
    state = startGuided(currentFormValues());
    render();
  });
  choice.addEventListener('change', () => { state = null; render(); });
  form.addEventListener('imob:property-saved', () => { state = null; render(); });
  render();
}

if (form && root) init();
