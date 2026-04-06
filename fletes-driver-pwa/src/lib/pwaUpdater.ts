const UPDATE_INTERVAL_MS = 60 * 1000;

export const setupPwaUpdater = () => {
  if (!('serviceWorker' in navigator)) return () => {};

  let stopped = false;
  let reloading = false;

  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  const getLoadedShell = () => {
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
    const stylesheet = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="/assets/"]');

    return {
      script: script?.src ?? null,
      stylesheet: stylesheet?.href ?? null,
    };
  };

  const getServerShell = async () => {
    const response = await fetch('/', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'text/html',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const script = parsed.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
    const stylesheet = parsed.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="/assets/"]');

    return {
      script: script ? new URL(script.getAttribute('src') ?? '', window.location.origin).href : null,
      stylesheet: stylesheet ? new URL(stylesheet.getAttribute('href') ?? '', window.location.origin).href : null,
    };
  };

  const ensureCurrentShell = async () => {
    try {
      const loadedShell = getLoadedShell();
      const serverShell = await getServerShell();

      if (!serverShell) return;

      const scriptChanged =
        loadedShell.script !== null &&
        serverShell.script !== null &&
        loadedShell.script !== serverShell.script;

      const stylesheetChanged =
        loadedShell.stylesheet !== null &&
        serverShell.stylesheet !== null &&
        loadedShell.stylesheet !== serverShell.stylesheet;

      if (scriptChanged || stylesheetChanged) {
        reloadOnce();
      }
    } catch {
      // Ignore transient HTML fetch/parser failures and retry later.
    }
  };

  const updateRegistration = async () => {
    if (stopped) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    } catch {
      // Ignore transient SW update failures and retry on next focus/interval.
    }

    await ensureCurrentShell();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void updateRegistration();
    }
  };

  const intervalId = window.setInterval(() => {
    void updateRegistration();
  }, UPDATE_INTERVAL_MS);

  window.addEventListener('focus', updateRegistration);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);

  void updateRegistration();

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
    window.removeEventListener('focus', updateRegistration);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    navigator.serviceWorker.removeEventListener('controllerchange', reloadOnce);
  };
};
