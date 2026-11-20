#!/usr/bin/env python3
"""Gera a seleção PROPOSTA para o commit do incremento (não faz git add). Rodar na raiz do repositório: python3 <este arquivo>.
Saídas (nesta pasta): commit-selection.txt (relação por arquivo) e local-only-sha256.txt (hashes do que fica só local). Usa saídas -z do git."""
import subprocess, os, hashlib, json, re
def z(*a): return [x for x in subprocess.check_output(a).decode('utf8').split('\0') if x]
E = 'ops/evidence/latest/imob-property-guided-draft-2026-11-14'; B = E + '/browser-integrated-2026-11-19'; ST = E + '/stage6-review'
modified = z('git', 'diff', '-z', '--name-only', 'HEAD')
untracked = z('git', 'ls-files', '-z', '--others', '--exclude-standard')
ignored_ev = z('git', 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', E)
idx = open('docs/EVIDENCE_INDEX.md').read()
OUT_OF_SCOPE = {
  'CLAUDE.md': 'mudança preexistente de política (+32 linhas), idêntica em CODEX.md; não é parte do incremento — commit separado por decisão do owner',
  'CODEX.md': 'idem CLAUDE.md (as duas devem mudar juntas)',
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/README.md': 'evidência pós-deploy (2026-11-17) de outra frente (provider failure); não misturar com o novo incremento',
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/post-deploy-manual-intake.json': 'idem: evidência pós-deploy anterior ao incremento',
  'previa-imob-revisada.html': 'mockup HTML na raiz sem vínculo com o incremento (origem não atribuída a esta tarefa); preservar local e decidir à parte'}
prod = [p for p in modified + untracked if re.match(r'^(apps/(api|web)/src/|packages/(contracts|core|providers)/src/)', p) and not p.endswith('.test.ts') and '/tests/' not in p]
tests = [p for p in modified + untracked if (p.endswith('.test.ts') or '/tests/' in p or p.startswith('scripts/qa/')) and not p.startswith('ops/') and p not in prod]
ci = ['package.json  # +1 script test:imob-claim-only-writes:integration', '.github/workflows/ci.yml  # +1 passo no job logistica_core_integration (banco eiah_logistica_core_ci + EIAH_DISPOSABLE_INFRA=1)']
docs = ['docs/EVIDENCE_INDEX.md  # SOMENTE o hunk 2 (linhas "Coleta conversacional IMOB…"); o hunk 1 (pós-deploy) fica fora', E + '/README.md']
ev = sorted(set(p for p in untracked + ignored_ev if p.startswith(E + '/')))
KEEP_PNG_STAGE4 = {'01-abertura.png', '12-divergencia-quero-ver-meus-imoveis.png', '13-abertura-em-nova-aba.png', '14-bloqueio-409.png'}
def local_only(p):
    b = os.path.basename(p)
    if p == E + '/changes.diff': return 'idêntico ao changes.diff.gz já rastreado (redundante)'
    if p.endswith('.mjs') and p.startswith(B + '/diagnostics/'): return 'script de diagnóstico não portável (caminhos absolutos e manifesto de scratchpad já removido); a saída .txt integra o commit'
    if b.endswith('.png') and (p.startswith(B + '/spec-4-partial/') or p.startswith(B + '/invalid-run-5e/')): return 'captura de execução parcial/inválida preservada localmente; hash no manifesto (resultados e logs integram o commit)'
    if b.endswith('.png') and p.startswith(B + '/run-valid/') and b not in KEEP_PNG_STAGE4: return 'captura da rodada da etapa 4 superada pela etapa 5; hash no manifesto (as 4 que provam P-01/P-02/D-ROUTING-01 integram o commit)'
    return None
local = [(p, local_only(p)) for p in ev if local_only(p)]
inc = [p for p in ev if not local_only(p)]
ign = set(ignored_ev); force = [p for p in inc if p in ign]
os.makedirs(ST, exist_ok=True)
with open(ST + '/local-only-sha256.txt', 'w', encoding='utf8') as f:
    f.write('# sha256  tamanho  caminho  (preservados LOCALMENTE e fora do commit proposto; os hashes permitem auditar depois)\n')
    for p, _ in sorted(local): f.write('%s  %d  %s\n' % (hashlib.sha256(open(p, 'rb').read()).hexdigest(), os.path.getsize(p), p))
with open(ST + '/commit-selection.txt', 'w', encoding='utf8') as f:
    f.write('# Seleção PROPOSTA para o futuro commit (nada foi colocado no stage). HEAD base: %s\n' % subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip())
    f.write('# Arquivos individuais (diretórios não rastreados expandidos); `git status --short` agrupa diretórios, então não comparar contagens agregadas com estas.\n\n')
    f.write('## A. PRODUÇÃO (%d arquivos)\n' % len(prod)); [f.write(p + ('  [NOVO]' if p in untracked else '') + '\n') for p in sorted(prod)]
    f.write('\n## B. TESTES, HARNESS E SCRIPT QA (%d arquivos)\n' % len(tests)); [f.write(p + ('  [NOVO]' if p in untracked else '') + '\n') for p in sorted(tests)]
    f.write('\n## B2. CI E CONFIGURAÇÃO (2 arquivos; correção de B1)\n'); [f.write(p + '\n') for p in ci]
    f.write('\n## C. DOCUMENTAÇÃO (2)\n'); [f.write(p + '\n') for p in docs]
    f.write('\n## D. EVIDÊNCIA NOVA (%d arquivos; %d são *.log ignorados pelo .gitignore:17 e exigem `git add -f`, como os 124 logs já rastreados em ops/evidence)\n' % (len(inc), len(force)))
    for p in sorted(inc): f.write(p + ('  [FORCE]' if p in ign else '') + '\n')
    f.write('\n## E. PRESERVADOS LOCALMENTE, FORA DO COMMIT (%d arquivos; hashes em local-only-sha256.txt)\n' % len(local)); [f.write('%s  # %s\n' % (p, w)) for p, w in sorted(local)]
    f.write('\n## F. FORA DO ESCOPO DO INCREMENTO (não incluir)\n'); [f.write('%s  # %s\n' % (p, w)) for p, w in OUT_OF_SCOPE.items()]
    f.write('\n## G. B1 — RESOLVIDO LOCALMENTE (etapa 7)\nO teste de P-04 está em imob-claim-only-writes.integration.test.ts (guarda preservada), executado no job logistica_core_integration do CI; validado em PostgreSQL descartável: dedicado 1/1 (EIAH_DISPOSABLE_INFRA=1) e arquivo original do W4 32/32 (sem a variável), exit 0. CI remoto não executado.\n')
    f.write('docs/EVIDENCE_INDEX.md (hunk 1: seção "Intake IMOB — tentativa manual após deploy…")  # mesma evidência pós-deploy; commit separado\n')
cover = set(prod + tests + [E + '/README.md', 'docs/EVIDENCE_INDEX.md', 'package.json', '.github/workflows/ci.yml']) | set(OUT_OF_SCOPE)
selected = set(inc) | set(z('git', 'ls-files', '-z', E))
refs = set(re.findall(r'`(' + re.escape(E) + r'/[^`]+)`', idx))
print(json.dumps({'producao': len(prod), 'testes_harness_qa': len(tests), 'docs': 2, 'evidencia_nova': len(inc), 'force_add': len(force), 'local_only': len(local),
  'modificados_rastreados': len(modified), 'nao_rastreados_expandidos': len(untracked),
  'modificados_sem_destino': [p for p in modified if p not in cover],
  'nao_rastreados_sem_destino': [p for p in untracked if not p.startswith(E + '/') and p not in prod + tests and p not in OUT_OF_SCOPE],
  'refs_do_indice_sem_cobertura': [r for r in refs if os.path.exists(r) and r not in selected]}, ensure_ascii=False))
