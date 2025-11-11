#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
) as { name: string; version?: string };

type CommandHandler = (args: string[]) => Promise<void> | void;

const commands: Record<string, CommandHandler> = {
  help: () => {
    console.log(`${pkg.name} v${pkg.version ?? '0.0.0'}`);
    console.log('Uso: eiah <comando>');
    console.log('\nComandos de exemplo:');
    console.log('  runs:trigger       Aciona um run chamando a API de orquestração');
    console.log('  billing:reconcile  Executa reconciliação de ledger/billing');
    console.log('  --version, -v      Exibe versão atual');
    console.log('\nObs: os comandos ainda são stubs — conecte-os ao orchestrator/API conforme o roadmap.');
  },
  version: () => {
    console.log(pkg.version ?? '0.0.0');
  },
  'runs:trigger': async (args) => {
    console.log('runs:trigger ainda não está conectado. Args recebidos:', args.join(' '));
    console.log('Integre aqui chamadas autenticadas para POST /api/runs ou utilize o SDK @eiah/core.');
  },
  'billing:reconcile': async () => {
    console.log('billing:reconcile ainda não está conectado.');
    console.log('Use este stub para disparar scripts de reconciliação quando o BillingEngine estiver pronto.');
  }
};

const [, , rawCommand, ...rest] = process.argv;
const resolved = normalizeCommand(rawCommand);

if (!resolved.known && rawCommand) {
  console.error(`Comando desconhecido: ${rawCommand}`);
}

await commands[resolved.name](rest);

if (!resolved.known && rawCommand) {
  process.exitCode = 1;
}

function normalizeCommand(value?: string): { name: keyof typeof commands; known: boolean } {
  if (!value || value === 'help' || value === '--help' || value === '-h') {
    return { name: 'help', known: true };
  }

  if (value === '--version' || value === '-v') {
    return { name: 'version', known: true };
  }

  if ((commands as Record<string, CommandHandler>)[value]) {
    return { name: value as keyof typeof commands, known: true };
  }

  return { name: 'help', known: false };
}
