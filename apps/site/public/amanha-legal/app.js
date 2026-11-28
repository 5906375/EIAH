(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Logo oficial: se data-logo tiver caminho, usa a imagem; senão fica o símbolo provisório.
  var logo = $('.logo');
  if (logo && logo.getAttribute('data-logo')) {
    logo.src = logo.getAttribute('data-logo');
    logo.hidden = false;
    var sim = $('.simbolo');
    if (sim) sim.hidden = true;
  }

  var estado = { passo: 1, versao: 0, aprovada: false, hash: '', textoAprovado: '' };

  function hora() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function log(txt) {
    var ul = $('#log');
    var v = $('.vazio', ul);
    if (v) ul.removeChild(v);
    var li = document.createElement('li');
    var t = document.createElement('time');
    t.textContent = hora();
    li.appendChild(t);
    li.appendChild(document.createTextNode(txt));
    ul.insertBefore(li, ul.firstChild);
  }

  function ir(n) {
    estado.passo = n;
    $$('.painel').forEach(function (p) { p.hidden = Number(p.getAttribute('data-painel')) !== n; });
    $$('#stepper li').forEach(function (li) {
      var k = Number(li.getAttribute('data-passo'));
      li.classList.toggle('ativo', k === n);
      li.classList.toggle('feito', k < n);
      if (k === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (n === 4) renderFinal();
  }

  function val(id, padrao) {
    var v = ($('#' + id).value || '').trim();
    return v || padrao;
  }

  function montar() {
    var tipo = $('#tipo').value;
    var a = val('parteA', '[parte contratante]');
    var b = val('parteB', '[parte contratada]');
    var obj = val('objeto', '[objeto]');
    var prazo = parseInt($('#prazo').value, 10);
    if (!(prazo >= 1)) prazo = 12;
    var foro = val('foro', '[foro]');
    if (tipo === 'nda') {
      return 'ACORDO DE CONFIDENCIALIDADE\n\n' +
        'Pelo presente instrumento, ' + a + ' e ' + b + ' acordam o que segue.\n\n' +
        'Cláusula 1ª. As partes comprometem-se a manter sigilo sobre as informações trocadas em razão de ' + obj + ', não as divulgando a terceiros sem autorização por escrito.\n\n' +
        'Cláusula 2ª. O dever de sigilo vigora por ' + prazo + ' meses, contados da assinatura.\n\n' +
        'Cláusula 3ª. O descumprimento sujeita a parte infratora às consequências previstas em lei.\n\n' +
        'Cláusula 4ª. Fica eleito o foro da ' + foro + ' para dirimir dúvidas decorrentes deste acordo.\n\n' +
        '[Texto de demonstração. Dados fictícios. Sem valor jurídico.]';
    }
    return 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\n' +
      'Contratante: ' + a + '.\nContratada: ' + b + '.\n\n' +
      'Cláusula 1ª. A Contratada prestará à Contratante serviços de ' + obj + '.\n\n' +
      'Cláusula 2ª. O contrato vigora por ' + prazo + ' meses, contados da assinatura.\n\n' +
      'Cláusula 3ª. Cada parte responde pelos encargos que lhe cabem, na forma da lei.\n\n' +
      'Cláusula 4ª. Fica eleito o foro da ' + foro + ' para dirimir dúvidas decorrentes deste contrato.\n\n' +
      '[Texto de demonstração. Dados fictícios. Sem valor jurídico.]';
  }

  // Hash curto do texto: identifica a versão e permite saber se mudou depois da aprovação.
  function hash(txt) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (x) {
          return ('0' + x.toString(16)).slice(-2);
        }).join('').slice(0, 12);
      });
    }
    var h = 5381;
    for (var i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
    return Promise.resolve(('00000000' + (h >>> 0).toString(16)).slice(-8));
  }

  function limparConferencia() {
    $$('.chk').forEach(function (c) { c.checked = false; });
  }

  function msg(t, ok) {
    var m = $('#msg');
    m.textContent = t || '';
    m.classList.toggle('ok', !!ok);
  }

  $('#gerar').addEventListener('click', function () {
    var t = montar();
    $('#texto').value = t;
    $('#minutaPreview').textContent = t;
    estado.aprovada = false;
    limparConferencia();
    msg('');
    log('Minuta gerada a partir do atendimento (rascunho).');
    ir(2);
  });

  $$('[data-ir]').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = Number(b.getAttribute('data-ir'));
      if (n === 3 && estado.passo === 2) log('Minuta enviada para revisão humana.');
      ir(n);
    });
  });

  $('#texto').addEventListener('input', function () {
    $('#minutaPreview').textContent = $('#texto').value;
    if (estado.aprovada && $('#texto').value !== estado.textoAprovado) {
      estado.aprovada = false;
      limparConferencia();
      msg('O texto mudou depois da aprovação. A aprovação foi anulada e é preciso revisar de novo.');
      log('Texto editado após a aprovação v' + estado.versao + ': aprovação anulada.');
    }
  });

  $('#aprovar').addEventListener('click', function () {
    var papel = $('#papel').value;
    if (papel !== 'revisor') {
      msg('Quem redige não aprova. Troque para Revisor(a) para decidir.');
      log('Tentativa de aprovação bloqueada: perfil Redator(a).');
      return;
    }
    var faltam = $$('.chk').filter(function (c) { return !c.checked; }).length;
    if (faltam) {
      msg('Falta marcar ' + faltam + ' item(ns) da conferência.');
      return;
    }
    var texto = $('#texto').value;
    if (!texto.trim()) { msg('A minuta está vazia.'); return; }
    hash(texto).then(function (h) {
      estado.versao += 1;
      estado.aprovada = true;
      estado.hash = h;
      estado.textoAprovado = texto;
      estado.quando = new Date();
      estado.papel = 'Revisor(a)';
      msg('Versão v' + estado.versao + ' aprovada.', true);
      log('Versão v' + estado.versao + ' aprovada por Revisor(a) · hash ' + h + '.');
      ir(4);
    });
  });

  function renderFinal() {
    var selo = $('#selo');
    var final = $('#minutaFinal');
    selo.textContent = '';
    if (estado.aprovada) {
      selo.classList.remove('anulado');
      selo.appendChild(document.createTextNode('Aprovada · versão v' + estado.versao + ' · ' + estado.papel + ' · ' +
        estado.quando.toLocaleString('pt-BR') + ' · hash '));
      var c = document.createElement('code');
      c.textContent = estado.hash;
      selo.appendChild(c);
      final.textContent = estado.textoAprovado;
    } else {
      selo.classList.add('anulado');
      selo.textContent = 'Sem versão aprovada. Volte à revisão humana para aprovar.';
      final.textContent = $('#texto').value;
    }
  }

  $('#copiar').addEventListener('click', function () {
    var t = $('#minutaFinal').textContent;
    var b = $('#copiar');
    function ok() { b.textContent = 'Copiado'; setTimeout(function () { b.textContent = 'Copiar texto'; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(ok, function () {});
    }
  });

  $('#recomecar').addEventListener('click', function () {
    estado.versao = 0;
    estado.aprovada = false;
    estado.hash = '';
    estado.textoAprovado = '';
    limparConferencia();
    msg('');
    $('#log').innerHTML = '<li class="vazio">Nenhum evento ainda.</li>';
    ir(1);
  });

  ir(1);
})();
