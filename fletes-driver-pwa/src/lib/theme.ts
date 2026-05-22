export type AppTheme = 'light' | 'dark';
export type ThemeMode = AppTheme | 'auto';

export const THEME_STORAGE_KEY = 'fletes-ostrit-theme-mode';

const LIGHT_THEME_START_HOUR = 7;
const DARK_THEME_START_HOUR = 19;

export const getThemeForTime = (date = new Date()): AppTheme => {
  const hour = date.getHours();
  return hour >= LIGHT_THEME_START_HOUR && hour < DARK_THEME_START_HOUR ? 'light' : 'dark';
};

export const resolveThemeMode = (mode: ThemeMode): AppTheme => (
  mode === 'auto' ? getThemeForTime() : mode
);

export const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
};

export const getStoredTheme = (): AppTheme => {
  return resolveThemeMode(getStoredThemeMode());
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
