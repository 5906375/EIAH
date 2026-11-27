import { listVideos, videoStoreAvailable } from './property-videos.mjs';
import { displayName } from './video-files.mjs';

/**
 * Mostra os vídeos do imóvel dentro de `container`. Devolve a função que remove o bloco e libera as URLs
 * temporárias. Sem vídeos (ou sem armazenamento no navegador), não faz nada.
 */
export async function mountPropertyVideos(container, propertyId) {
  const nothing = () => {};
  if (!container || !videoStoreAvailable()) return nothing;
  let records;
  try { records = await listVideos(propertyId); } catch { return nothing; }
  if (!records.length || !container.isConnected) return nothing;
  const urls = [];
  const section = document.createElement('section');
  section.className = 'property-videos';
  section.setAttribute('aria-label', 'Vídeos do imóvel');
  for (const record of records) {
    const url = URL.createObjectURL(record.blob);
    urls.push(url);
    const figure = document.createElement('figure');
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = url;
    video.setAttribute('aria-label', 'Vídeo do imóvel: ' + displayName(record.name));
    const caption = document.createElement('figcaption');
    caption.textContent = displayName(record.name);
    figure.append(video, caption);
    section.append(figure);
  }
  container.append(section);
  return () => {
    for (const video of section.querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load(); }
    urls.forEach(url => URL.revokeObjectURL(url));
    section.remove();
  };
}
