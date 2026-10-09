'use strict';
/*
 * IA na Prática Jurídica — comportamento da página.
 * Tudo roda no navegador; só a votação ao vivo conversa com o servidor (/api/votacao/…).
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var brl = function (v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); };
  var guardar = {
    ler: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    gravar: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento: segue sem lembrar */ } },
    apagar: function (k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
  };
  var copiar = function (texto, alvo, ok) {
    var falha = function () { alvo.textContent = 'Não foi possível copiar; selecione o texto manualmente.'; };
    if (!navigator.clipboard) return falha();
    navigator.clipboard.writeText(texto).then(function () { alvo.textContent = ok; }, falha);
  };
  var params = new URLSearchParams(location.search);
  var salaParticipante = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  var modoParticipante = salaParticipante.length === 5;

  /* ---------------- Abas e faixa de status ---------------- */
  var ABAS = ['roteiro', 'votacao', 'simulador', 'comparativo', 'roi', 'guia', 'diagnostico'];
  var NOMES = {
    votacao: ['Votação ao vivo', 'Termômetro do grupo'],
    simulador: ['Simulador', 'Quanto risco tem este uso de IA?'],
    comparativo: ['Comparativo', 'Quatro tipos de solução'],
    roi: ['Calculadora de ROI', 'Quanto vale o tempo que a IA devolve?'],
    guia: ['Guia', 'O que a IA faz, onde erra e as regras do jogo'],
    diagnostico: ['Autodiagnóstico', 'Onde você está no uso de IA?']
  };
  var abaAtual = 'roteiro';
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var slideAtual = 0;

  var pontos = $('statusPontos');
  slides.forEach(function (s, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Ir para o slide ' + (i + 1));
    b.addEventListener('click', function () { irSlide(i); });
    pontos.appendChild(b);
  });

  function atualizarStatus() {
    if (abaAtual === 'roteiro') {
      $('statusPill').textContent = 'Slide ' + (slideAtual + 1) + ' de ' + slides.length;
      $('statusTitulo').textContent = slides[slideAtual].getAttribute('data-titulo');
      pontos.hidden = false;
      Array.prototype.forEach.call(pontos.children, function (p, i) { p.classList.toggle('on', i === slideAtual); });
    } else {
      $('statusPill').textContent = NOMES[abaAtual][0];
      $('statusTitulo').textContent = NOMES[abaAtual][1];
      pontos.hidden = true;
    }
  }

  function abrir(id, rolar) {
    if (ABAS.indexOf(id) < 0) id = 'roteiro';
    if (modoParticipante) id = 'votacao';
    abaAtual = id;
    document.querySelectorAll('[data-painel]').forEach(function (p) { p.hidden = p.getAttribute('data-painel') !== id; });
    document.querySelectorAll('.aba').forEach(function (a) { a.setAttribute('aria-selected', String(a.getAttribute('data-aba') === id)); });
    atualizarStatus();
    if (id === 'votacao') iniciarVotacao(); else pararAtualizacao();
    if (rolar) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function irSlide(i) {
    slideAtual = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, j) { s.hidden = j !== slideAtual; });
    $('slideAnterior').disabled = slideAtual === 0;
    $('slideProximo').disabled = slideAtual === slides.length - 1;
    atualizarStatus();
  }
  $('slideAnterior').addEventListener('click', function () { irSlide(slideAtual - 1); });
  $('slideProximo').addEventListener('click', function () { irSlide(slideAtual + 1); });
  document.addEventListener('keydown', function (e) {
    if (abaAtual !== 'roteiro' || /input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { irSlide(slideAtual + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { irSlide(slideAtual - 1); e.preventDefault(); }
  });

  var daHash = function () { return location.hash.replace('#', ''); };
  window.addEventListener('hashchange', function () { if (daHash() !== 'fontes') abrir(daHash(), true); });

  /* ---------------- Cronômetro e tela cheia ---------------- */
  var segundos = 0, relogio = null;
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var PAUSA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  var mostrarTempo = function () {
    var m = Math.floor(segundos / 60), s = segundos % 60;
    $('tempo').textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    $('tempo').classList.toggle('alerta', segundos >= 50 * 60);
  };
  $('cronoPlay').addEventListener('click', function () {
    if (relogio) { clearInterval(relogio); relogio = null; this.innerHTML = PLAY; this.setAttribute('aria-label', 'Continuar cronômetro'); }
    else { relogio = setInterval(function () { segundos++; mostrarTempo(); }, 1000); this.innerHTML = PAUSA; this.setAttribute('aria-label', 'Pausar cronômetro'); }
  });
  $('cronoZerar').addEventListener('click', function () { segundos = 0; mostrarTempo(); });
  $('telaCheia').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });

  /* ---------------- Checklist ---------------- */
  var caixas = document.querySelectorAll('#checklist input');
  caixas.forEach(function (c) {
    c.addEventListener('change', function () {
      var n = Array.prototype.filter.call(caixas, function (x) { return x.checked; }).length;
      $('barraChecklist').style.width = (n / caixas.length * 100) + '%';
      $('textoChecklist').textContent = n + ' de ' + caixas.length + ' práticas';
      $('nivelChecklist').textContent = n <= 2 ? 'Comece pelas três primeiras' : n <= 5 ? 'Bom caminho — feche as lacunas' : n < 8 ? 'Quase lá' : 'Prática madura';
    });
  });

  /* ---------------- Calculadora de ROI ---------------- */
  var num = function (id) { var v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : 0; };
  var resumoRoi = '';
  function calcular() {
    var minutas = num('minutas'), horas = num('horas'), reducao = num('reducao'), revisao = num('revisao');
    var hora = num('hora'), mensal = num('mensal'), impl = num('implantacao'), meses = Math.max(1, Math.round(num('meses')) || 12);
    $('reducaoTxt').textContent = reducao + '%';
    var devolvidas = Math.max(0, minutas * horas * reducao / 100 - minutas * revisao);
    var valor = devolvidas * hora, liquido = valor - mensal, custoPeriodo = impl + mensal * meses;
    var roi = custoPeriodo > 0 ? ((liquido * meses - impl) / custoPeriodo) * 100 : 0;
    var payback;
    if (liquido <= 0) payback = 'Sem retorno com estes números';
    else if (impl === 0) payback = 'Imediato';
    else { var m = impl / liquido; payback = m < 1 ? 'Menos de 1 mês' : m.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' meses'; }
    $('oHoras').textContent = devolvidas.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
    $('oValor').textContent = brl(valor);
    $('oLiquido').textContent = brl(liquido);
    $('oPayback').textContent = payback;
    $('oRoi').textContent = Math.round(roi).toLocaleString('pt-BR') + '%';
    $('linhaRoi').className = 'saida grande' + (roi < 0 ? ' ruim' : '');
    $('oLeitura').textContent = liquido <= 0
      ? 'Com estes números o custo supera o tempo devolvido. Revise o volume, a redução esperada ou a solução escolhida.'
      : 'Cerca de ' + Math.round(devolvidas) + ' horas por mês voltam para análise, atendimento e estratégia — já descontada a revisão humana.';
    resumoRoi = 'Calculadora de ROI — IA na Prática Jurídica\n' +
      'Minutas/mês: ' + minutas + ' · horas por minuta: ' + horas + ' · redução: ' + reducao + '% · revisão extra: ' + revisao + ' h\n' +
      'Valor da hora: ' + brl(hora) + ' · custo mensal: ' + brl(mensal) + ' · investimento inicial: ' + brl(impl) + ' · horizonte: ' + meses + ' meses\n' +
      'Horas devolvidas/mês: ' + Math.round(devolvidas) + ' · ganho líquido/mês: ' + brl(liquido) + ' · retorno: ' + payback + ' · ROI: ' + Math.round(roi) + '%';
  }
  $('calc').addEventListener('input', calcular);
  $('copiarRoi').addEventListener('click', function () { copiar(resumoRoi, $('statusRoi'), 'Resultado copiado.'); });

  /* ---------------- Autodiagnóstico ---------------- */
  var form = $('enquete'), textoDiag = '';
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var faltam = [], total = 0;
    for (var i = 1; i <= 6; i++) {
      var m = form.querySelector('input[name="q' + i + '"]:checked');
      if (!m) faltam.push(i); else total += parseInt(m.value, 10);
    }
    if (faltam.length) {
      $('erroEnquete').textContent = (faltam.length > 1 ? 'Responda as perguntas ' : 'Responda a pergunta ') + faltam.join(', ') + '.';
      $('resultado').hidden = true;
      return;
    }
    $('erroEnquete').textContent = '';
    var pct = Math.round(total / 15 * 100);
    var vol = parseInt(form.querySelector('input[name="q6"]:checked').getAttribute('data-vol'), 10);
    var r = function (q) { return parseInt(form.querySelector('input[name="' + q + '"]:checked').value, 10); };
    var nivel, desc, acoes = [];
    if (pct < 40) { nivel = 'Nível 1 · Uso informal'; desc = 'A IA provavelmente já está em uso, mas sem regras. É o cenário de maior risco: ninguém garante a revisão nem consegue provar quem aprovou.'; }
    else if (pct < 75) { nivel = 'Nível 2 · Em adoção'; desc = 'Há ferramentas e alguma revisão, mas o controle depende das pessoas. Falta transformar boas práticas em processo.'; }
    else { nivel = 'Nível 3 · Uso governado'; desc = 'A IA está dentro de um processo, com revisão e registro. O foco agora é escala e medição de resultados.'; }
    if (r('q1') < 2) acoes.push('Defina quais ferramentas de IA são permitidas e para quais tarefas.');
    if (r('q2') < 3) acoes.push('Torne a revisão por quem tem autoridade uma etapa obrigatória antes de qualquer envio.');
    if (r('q3') < 3) acoes.push('Registre quem aprovou cada versão — é a prova de supervisão que a OAB recomenda.');
    if (r('q4') < 2) acoes.push('Tire dados de clientes de ferramentas gratuitas ou pessoais; prefira contratos com política de dados.');
    if (r('q5') < 3) acoes.push('Inclua no contrato com o cliente um aviso escrito sobre o uso de IA.');
    if (vol >= 30) acoes.push('Com o seu volume, vale calcular o retorno (Calculadora de ROI).');
    if (!acoes.length) acoes.push('Meça o tempo economizado e revise a política a cada 6 meses.');
    $('resNivel').textContent = nivel;
    $('resPontos').textContent = pct + '%';
    $('resTexto').textContent = desc;
    var ul = $('resAcoes'); ul.innerHTML = '';
    acoes.forEach(function (a) { var li = document.createElement('li'); li.textContent = a; ul.appendChild(li); });
    $('minutas').value = vol; calcular();
    textoDiag = 'Autodiagnóstico — IA na Prática Jurídica\n' + nivel + ' — ' + pct + '%\n' + desc + '\n\nPróximas ações:\n- ' + acoes.join('\n- ');
    $('resultado').hidden = false;
    $('resultado').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  form.addEventListener('reset', function () { $('resultado').hidden = true; $('erroEnquete').textContent = ''; });
  $('copiarDiag').addEventListener('click', function () { copiar(textoDiag, $('statusCopia'), 'Diagnóstico copiado.'); });

  /* ---------------- Simulador de IA & Risco ---------------- */
  var sim = $('sim');
  var TAREFAS = ['pesquisa e ideias gerais', 'resumo de documento', 'minuta de contrato', 'peça processual'];
  function simular() {
    var v = function (n) { return parseInt(sim.querySelector('input[name="' + n + '"]:checked').value, 10); };
    var tarefa = v('tarefa'), dados = v('dados'), ferramenta = v('ferramenta'), revisao = v('revisao'), cliente = v('cliente');
    // A ferramenta pesa quando há dados de clientes; a revisão pesa mais quanto mais formal a tarefa;
    // o aviso ao cliente importa quando há dados dele ou documento com efeito jurídico.
    var pesoFerramenta = dados === 0 ? ferramenta * 0.25 : ferramenta;
    var pesoRevisao = revisao * (tarefa + 1) / 4;
    var pesoCliente = dados > 0 || tarefa >= 2 ? cliente : 0;
    var pontos = tarefa + dados + pesoFerramenta + pesoRevisao + pesoCliente;
    var fatores = [], acoes = [];
    if (dados >= 3 && ferramenta >= 3) { pontos += 3; fatores.push('Dados de clientes em ferramenta sem contrato corporativo: risco de exposição e de violação do sigilo.'); }
    if (tarefa === 3 && revisao >= 3) { pontos += 2; fatores.push('Peça processual sem revisão de quem assina: risco de citação inventada e de sanção.'); }
    if (tarefa >= 2) fatores.push('A tarefa (' + TAREFAS[tarefa] + ') gera documento com efeito jurídico.');
    if (dados === 5) fatores.push('Dados sensíveis ou sob segredo exigem o maior cuidado (LGPD e sigilo profissional).');
    else if (dados === 3) fatores.push('Há dados pessoais de clientes no uso.');
    if (ferramenta === 4 && dados > 0) fatores.push('Ferramenta gratuita ou conta pessoal: sem garantias contratuais sobre os dados.');
    if (ferramenta >= 3 && dados === 0) fatores.push('Sem dados de clientes, ferramentas gratuitas ou individuais são aceitáveis para este uso.');
    if (revisao === 5) fatores.push('Nenhuma revisão humana antes do uso.');
    else if (revisao === 3) fatores.push('Revisão só por quem gerou o texto: tende a confirmar o próprio erro.');
    if (pesoCliente > 0) fatores.push('Cliente não informado sobre o uso de IA (a OAB recomenda informar por escrito).');
    if (!fatores.length) fatores.push('Cenário com controles adequados para esta tarefa.');
    if (dados >= 3) acoes.push(dados === 5 ? 'Anonimize os dados ou use apenas ferramenta contratada com política de dados.' : 'Anonimize os dados antes de usar a IA sempre que possível.');
    if (ferramenta >= 3 && dados >= 1) acoes.push('Prefira plano corporativo com contrato ou um fluxo com revisão e registro.');
    if (revisao >= 3 && tarefa >= 1) acoes.push('Exija revisão de quem tem autoridade e confira citações na fonte oficial.');
    if (revisao === 1 && tarefa >= 2) acoes.push('Registre quem aprovou e qual versão, para provar a supervisão.');
    if (pesoCliente > 0) acoes.push('Inclua aviso escrito ao cliente sobre o uso de IA.');
    if (revisao >= 3 && tarefa === 0) acoes.push('Confira na fonte qualquer informação antes de usá-la.');
    if (!acoes.length) acoes.push('Mantenha o padrão e revise a política periodicamente.');
    var nivel, classe;
    if (pontos <= 4) { nivel = 'Baixo'; classe = 'risco-baixo'; }
    else if (pontos <= 9) { nivel = 'Moderado'; classe = 'risco-moderado'; }
    else if (pontos <= 14) { nivel = 'Alto'; classe = 'risco-alto'; }
    else { nivel = 'Crítico'; classe = 'risco-critico'; }
    $('simNivel').textContent = nivel;
    $('simNivel').className = 'nivel-risco ' + classe;
    $('simPonteiro').style.left = Math.min(100, Math.max(0, pontos / 24 * 100)) + '%';
    var preencher = function (ul, itens) { ul.innerHTML = ''; itens.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); };
    preencher($('simFatores'), fatores);
    preencher($('simAcoes'), acoes);
  }
  sim.addEventListener('change', simular);

  /* ---------------- Votação ao vivo ---------------- */
  var PERGUNTAS = [
    { t: 'Com que frequência você usa IA generativa no trabalho hoje?', o: ['Diariamente', 'Algumas vezes por semana', 'Raramente', 'Nunca'] },
    { t: 'Qual é a sua maior preocupação com IA na advocacia?', o: ['Sigilo e dados do cliente', 'Informações inventadas pela IA', 'Responsabilidade profissional', 'Custo e retorno'] },
    { t: 'O seu escritório tem uma política escrita de uso de IA?', o: ['Sim', 'Em elaboração', 'Não'] },
    { t: 'Você informaria ao cliente que usou IA em uma peça?', o: ['Sempre', 'Só se perguntarem', 'Não'] },
    { t: 'Quanto do seu tempo semanal vai para redação e revisão de documentos?', o: ['Menos de 20%', '20% a 40%', '40% a 60%', 'Mais de 60%'] }
  ];
  var API = '/api/votacao/salas';
  var sala = guardar.ler('iapj.sala');
  var estadoSala = null, timer = null;
  var eleitor = guardar.ler('iapj.eleitor');
  if (!eleitor || !/^[a-f0-9]{24}$/.test(eleitor)) {
    var b = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(b);
    eleitor = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    guardar.gravar('iapj.eleitor', eleitor);
  }

  var api = function (metodo, caminho, corpo) {
    return fetch(API + caminho, {
      method: metodo,
      headers: corpo ? { 'content-type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      var tipo = r.headers.get('content-type') || '';
      if (tipo.indexOf('application/json') < 0) throw new Error('OFFLINE');
      return r.json().then(function (d) { return { status: r.status, dados: d }; });
    });
  };
  var offline = function () { $('vOffline').hidden = false; };

  function pararAtualizacao() { if (timer) { clearInterval(timer); timer = null; } }

  function iniciarVotacao() {
    pararAtualizacao();
    if (modoParticipante) { atualizarParticipante(); timer = setInterval(atualizarParticipante, 3000); return; }
    mostrarSala();
    if (sala) { atualizarApresentador(); timer = setInterval(atualizarApresentador, 2500); }
  }

  /* Apresentador */
  var linkSala = function (codigo) { return location.origin + location.pathname + '?sala=' + codigo; };
  function mostrarSala() {
    $('vSemSala').hidden = !!sala;
    $('vComSala').hidden = !sala;
    if (!sala) return;
    $('vCodigo').textContent = sala.codigo;
    $('vLink').textContent = linkSala(sala.codigo);
    var qr = $('vQr');
    qr.innerHTML = '';
    if (typeof window.qrcode === 'function') {
      var q = window.qrcode(0, 'M');
      q.addData(linkSala(sala.codigo));
      q.make();
      qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } else {
      qr.hidden = true;
    }
    var lista = $('vListaPerguntas');
    if (!lista.children.length) {
      PERGUNTAS.forEach(function (p, i) {
        var bt = document.createElement('button');
        bt.type = 'button';
        bt.textContent = (i + 1) + '. ' + p.t;
        bt.addEventListener('click', function () { controlar({ perguntaAtiva: i, aberta: true }); });
        lista.appendChild(bt);
      });
    }
  }

  function desenharResultados() {
    if (!estadoSala) return;
    var ativa = estadoSala.perguntaAtiva;
    Array.prototype.forEach.call($('vListaPerguntas').children, function (bt, i) { bt.setAttribute('aria-pressed', String(i === ativa)); });
    var votos = estadoSala.resultados[ativa] || [];
    var total = votos.reduce(function (a, n) { return a + n; }, 0);
    $('vTituloResultado').textContent = PERGUNTAS[ativa].t;
    var barras = $('vBarras');
    barras.innerHTML = '';
    PERGUNTAS[ativa].o.forEach(function (op, i) {
      var n = votos[i] || 0, pct = total ? Math.round(n / total * 100) : 0;
      var d = document.createElement('div');
      d.className = 'barra-voto';
      d.innerHTML = '<div class="rot"><span></span><b></b></div><div class="trilho"><i></i></div>';
      d.querySelector('span').textContent = op;
      d.querySelector('b').textContent = pct + '% (' + n + ')';
      d.querySelector('i').style.width = pct + '%';
      barras.appendChild(d);
    });
    $('vTotal').textContent = total + (total === 1 ? ' voto' : ' votos') + (estadoSala.aberta ? ' · votação aberta' : ' · votação encerrada');
    $('vAbrirFechar').textContent = estadoSala.aberta ? 'Encerrar votação' : 'Reabrir votação';
  }

  function atualizarApresentador() {
    if (!sala) return;
    api('GET', '/' + sala.codigo).then(function (r) {
      if (r.status === 404) { guardar.apagar('iapj.sala'); sala = null; estadoSala = null; pararAtualizacao(); mostrarSala(); return; }
      estadoSala = r.dados;
      desenharResultados();
    }).catch(offline);
  }

  function controlar(mudancas) {
    if (!sala) return;
    var corpo = { chave: sala.chave };
    Object.keys(mudancas).forEach(function (k) { corpo[k] = mudancas[k]; });
    api('POST', '/' + sala.codigo + '/controle', corpo).then(atualizarApresentador).catch(offline);
  }

  $('vCriar').addEventListener('click', function () {
    var bt = this;
    bt.disabled = true;
    $('vErroCriar').textContent = '';
    api('POST', '').then(function (r) {
      bt.disabled = false;
      if (r.status !== 201) { $('vErroCriar').textContent = 'Não foi possível criar a sala agora. Tente de novo.'; return; }
      sala = r.dados;
      guardar.gravar('iapj.sala', sala);
      iniciarVotacao();
    }).catch(function () { bt.disabled = false; offline(); });
  });
  $('vNovaSala').addEventListener('click', function () {
    guardar.apagar('iapj.sala'); sala = null; estadoSala = null; pararAtualizacao(); mostrarSala();
  });
  $('vCopiarLink').addEventListener('click', function () { if (sala) copiar(linkSala(sala.codigo), this, 'Link copiado'); });
  $('vAbrirFechar').addEventListener('click', function () { if (estadoSala) controlar({ aberta: !estadoSala.aberta }); });
  $('vZerar').addEventListener('click', function () {
    if (estadoSala && window.confirm('Zerar os votos da pergunta atual?')) controlar({ zerar: true });
  });

  /* Participante */
  var perguntaMostrada = -1;
  function atualizarParticipante() {
    api('GET', '/' + salaParticipante).then(function (r) {
      var aviso = $('pAviso');
      if (r.status === 404) {
        $('pPergunta').textContent = 'Sala não encontrada';
        $('pEscolhas').innerHTML = '';
        aviso.hidden = false; aviso.className = 'aviso-vivo';
        aviso.textContent = 'Confira o código com quem está apresentando. As salas expiram em 24 horas.';
        pararAtualizacao();
        return;
      }
      var e = r.dados;
      var meuVoto = guardar.ler('iapj.voto.' + salaParticipante + '.' + e.perguntaAtiva);
      if (e.perguntaAtiva !== perguntaMostrada) {
        perguntaMostrada = e.perguntaAtiva;
        $('pPergunta').textContent = PERGUNTAS[e.perguntaAtiva].t;
        var box = $('pEscolhas');
        box.innerHTML = '';
        PERGUNTAS[e.perguntaAtiva].o.forEach(function (op, i) {
          var bt = document.createElement('button');
          bt.type = 'button';
          bt.textContent = op;
          bt.addEventListener('click', function () { votar(e.perguntaAtiva, i); });
          box.appendChild(bt);
        });
      }
      Array.prototype.forEach.call($('pEscolhas').children, function (bt, i) {
        bt.setAttribute('aria-pressed', String(meuVoto === i));
        bt.disabled = !e.aberta;
      });
      if (!e.aberta) { aviso.hidden = false; aviso.className = 'aviso-vivo'; aviso.textContent = 'Votação encerrada para esta pergunta. Aguarde a próxima.'; }
      else if (meuVoto !== null && meuVoto !== undefined) { aviso.hidden = false; aviso.className = 'aviso-vivo ok'; aviso.textContent = 'Voto registrado. Você pode trocar enquanto a votação estiver aberta.'; }
      else aviso.hidden = true;
    }).catch(offline);
  }
  function votar(pergunta, opcao) {
    api('POST', '/' + salaParticipante + '/voto', { pergunta: pergunta, opcao: opcao, eleitor: eleitor }).then(function (r) {
      if (r.status === 200) guardar.gravar('iapj.voto.' + salaParticipante + '.' + pergunta, opcao);
      atualizarParticipante();
    }).catch(offline);
  }

  /* ---------------- Início ---------------- */
  if (modoParticipante) {
    document.body.classList.add('participante');
    $('vApresentador').hidden = true;
    $('vParticipante').hidden = false;
    $('pCodigo').textContent = salaParticipante;
  }
  irSlide(0);
  calcular();
  simular();
  abrir(daHash() || 'roteiro', false);
})();
