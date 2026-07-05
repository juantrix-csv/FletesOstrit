const UPDATE_INTERVAL_MS = 60 * 1000;

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
  const response = await fetch(`/?build-check=${Date.now()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'text/html',
      'Cache-Control': 'no-cache',
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
  const loadedShell = getLoadedShell();
  const serverShell = await getServerShell();

  if (!serverShell) return false;

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
    return true;
  }

  return false;
};

export const requestPwaUpdate = async () => {
  if (!('serviceWorker' in navigator)) {
    return ensureCurrentShell();
  }

  const registration = await navigator.serviceWorker.getRegistration();
  await registration?.update();
  return ensureCurrentShell();
};

export const setupPwaUpdater = () => {
  if (!('serviceWorker' in navigator)) return () => {};

  stopped = false;

  const updateRegistration = async () => {
    if (stopped) return;
    try {
      await requestPwaUpdate();
    } catch {
      // Ignore transient SW update failures and retry on next focus/interval.
    }
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
