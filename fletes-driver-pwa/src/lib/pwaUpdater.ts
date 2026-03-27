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

  const updateRegistration = async () => {
    if (stopped) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
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
