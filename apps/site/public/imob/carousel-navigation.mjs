export function bindCarouselNavigation(track, navigation, previous, next) {
  function update() {
    const maxScroll = track.scrollWidth - track.clientWidth;
    navigation.hidden = maxScroll <= 2;
    if (navigation.hidden) track.removeAttribute('tabindex');
    else track.tabIndex = 0;
    previous.setAttribute('aria-disabled', String(track.scrollLeft <= 2));
    next.setAttribute('aria-disabled', String(track.scrollLeft >= maxScroll - 2));
  }

  for (const [button, direction] of [[previous, -1], [next, 1]]) {
    button.addEventListener('click', () => {
      const [first, second] = track.children;
      if (!second || button.getAttribute('aria-disabled') === 'true') return;
      const stride = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollBy({ left: direction * stride, behavior: reducedMotion ? 'instant' : 'smooth' });
    });
  }
  track.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(track);
  return update;
}
