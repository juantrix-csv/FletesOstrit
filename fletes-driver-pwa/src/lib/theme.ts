export type AppTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'fletes-ostrit-theme';

export const getStoredTheme = (): AppTheme => {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
};

export const applyTheme = (theme: AppTheme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = theme === 'dark' ? '#020617' : '#f8fafc';
  }
};

export const initializeTheme = () => {
  applyTheme(getStoredTheme());
};
