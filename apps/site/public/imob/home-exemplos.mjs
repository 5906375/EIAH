// Mostra o link "Ver vitrines de exemplo" só enquanto existirem vitrines de exemplo publicadas.
import { exampleCards } from './pilot-site.mjs';

try {
  const response = await fetch(new URL('./piloto-exemplos.json', import.meta.url), { cache: 'no-store' });
  if (response.ok && exampleCards(await response.json()).length) document.getElementById('link-exemplos').hidden = false;
} catch {
  // sem a lista, o link continua oculto
}
