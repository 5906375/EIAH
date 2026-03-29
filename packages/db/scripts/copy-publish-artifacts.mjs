import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const distDir = path.join(root, 'dist');
const generatedSrcDir = path.join(root, 'src', 'generated', 'client');
const generatedDistDir = path.join(distDir, 'generated', 'client');

fs.rmSync(path.join(distDir, 'generated'), { recursive: true, force: true });
fs.mkdirSync(path.join(distDir, 'middleware'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'generated'), { recursive: true });

fs.copyFileSync(path.join(root, 'src', 'index.d.ts'), path.join(distDir, 'index.d.ts'));
fs.copyFileSync(path.join(root, 'src', 'client.d.ts'), path.join(distDir, 'client.d.ts'));
fs.copyFileSync(path.join(root, 'src', 'middleware', 'tenantGuard.d.ts'), path.join(distDir, 'middleware', 'tenantGuard.d.ts'));
fs.cpSync(generatedSrcDir, generatedDistDir, { recursive: true });
