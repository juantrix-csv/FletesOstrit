import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  applyTheme,
  getStoredThemeMode,
  resolveThemeMode,
  THEME_STORAGE_KEY,
  type AppTheme,
  type ThemeMode,
} from '../lib/theme';

type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredThemeMode());
  const [theme, setTheme] = useState<AppTheme>(() => resolveThemeMode(getStoredThemeMode()));

  useEffect(() => {
    const updateTheme = () => {
      const nextTheme = resolveThemeMode(mode);
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };

    updateTheme();
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);

    if (mode !== 'auto') return undefined;

    const intervalId = window.setInterval(updateTheme, 60000);
    return () => window.clearInterval(intervalId);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      toggleTheme: () => setMode(theme === 'dark' ? 'light' : 'dark'),
    }),
    [mode, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
