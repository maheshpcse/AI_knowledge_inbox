// The inbox currently has one screen. Keep scroll handling independent of a router.
export function installScrollReset() {
  const previousRestoration = history.scrollRestoration;
  history.scrollRestoration = 'manual';
  const routeKey = () => location.pathname + location.search;
  let currentRoute = routeKey();
  let frame;

  function reset() {
    cancelAnimationFrame(frame);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // Repeat after the route's synchronous rendering has completed.
    frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  }

  function routeChanged() {
    const nextRoute = routeKey();
    if (nextRoute === currentRoute) return; // Preserve in-page citation anchors.
    currentRoute = nextRoute;
    reset();
  }

  const originals = {};
  const wrappers = {};
  for (const method of ['pushState', 'replaceState']) {
    originals[method] = history[method];
    wrappers[method] = function (...args) {
      const result = originals[method].apply(this, args);
      routeChanged();
      return result;
    };
    history[method] = wrappers[method];
  }

  window.addEventListener('popstate', routeChanged);
  window.addEventListener('pageshow', reset);
  reset();

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('popstate', routeChanged);
    window.removeEventListener('pageshow', reset);
    history.scrollRestoration = previousRestoration;
    for (const method of Object.keys(originals)) {
      if (history[method] === wrappers[method]) history[method] = originals[method];
    }
  };
}
