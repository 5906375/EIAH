const activeGalleries = new WeakMap();

export function releasePropertyGallery(container) {
  const gallery = activeGalleries.get(container);
  if (!gallery) return 0;
  const offset = gallery.track.scrollLeft;
  gallery.observer.disconnect();
  activeGalleries.delete(container);
  return offset;
}

export function appendPropertyGallery(container, property, baseUrl, offset) {
  if (!property.fotos?.length) return;

  const section = document.createElement('section');
  section.className = 'property-carousel';
  section.setAttribute('aria-label', 'Fotos do imóvel');
  const track = document.createElement('div');
  track.className = 'property-context-photos';
  for (const [index, photo] of property.fotos.entries()) {
    const image = document.createElement('img');
    image.src = new URL(photo, baseUrl).href;
    image.alt = property.titulo + ' · foto ' + (index + 1) + ' de ' + property.fotos.length;
    image.loading = 'lazy';
    image.decoding = 'async';
    const link = document.createElement('a');
    link.href = image.src;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', 'Ampliar foto ' + (index + 1) + ' de ' + property.titulo);
    link.append(image);
    track.append(link);
  }
  section.append(track);
  container.append(section);
  if (track.children.length === 1) return;

  track.classList.add('property-context-photos-multiple');
  track.tabIndex = 0;
  track.setAttribute('role', 'group');
  track.setAttribute('aria-label', 'Galeria horizontal');
  const controls = document.createElement('div');
  controls.className = 'property-carousel-controls';
  const count = document.createElement('span');
  count.textContent = property.fotos.length + ' fotos';
  const buttons = document.createElement('div');
  buttons.className = 'property-carousel-buttons';
  const first = track.children[0];
  const second = track.children[1];
  const makeButton = (label, icon, direction) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-ghost property-carousel-arrow';
    button.setAttribute('aria-label', label);
    button.textContent = icon;
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      const stride = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollBy({ left: direction * stride, behavior: reducedMotion ? 'instant' : 'smooth' });
    });
    return button;
  };
  const previous = makeButton('Foto anterior', '‹', -1);
  const next = makeButton('Próxima foto', '›', 1);
  buttons.append(previous, next);
  controls.append(count, buttons);
  section.prepend(controls);

  const update = () => {
    previous.setAttribute('aria-disabled', String(track.scrollLeft <= 2));
    next.setAttribute('aria-disabled', String(track.scrollLeft + track.clientWidth >= track.scrollWidth - 2));
  };
  track.scrollLeft = offset;
  track.addEventListener('scroll', update, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(track);
  activeGalleries.set(container, { track, observer });
  update();
}
