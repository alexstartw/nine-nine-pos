'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type FontSize = 'sm' | 'md' | 'lg';

interface SettingsValue {
  theme: Theme;
  fontSize: FontSize;
  setTheme: (t: Theme) => void;
  setFontSize: (s: FontSize) => void;
}

const SettingsContext = createContext<SettingsValue>({
  theme: 'light',
  fontSize: 'md',
  setTheme: () => {},
  setFontSize: () => {},
});

const FONT_SIZE_PX: Record<FontSize, string> = { sm: '14px', md: '16px', lg: '18px' };

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [fontSize, setFontSizeState] = useState<FontSize>('md');

  useEffect(() => {
    const savedTheme = localStorage.getItem('settings-theme') as Theme | null;
    const savedSize = localStorage.getItem('settings-font-size') as FontSize | null;
    if (savedTheme === 'light' || savedTheme === 'dark') applyTheme(savedTheme);
    if (savedSize === 'sm' || savedSize === 'md' || savedSize === 'lg') applyFontSize(savedSize);
  }, []);

  function applyTheme(t: Theme) {
    document.documentElement.classList.toggle('dark', t === 'dark');
    setThemeState(t);
  }

  function applyFontSize(s: FontSize) {
    document.documentElement.setAttribute('data-font-size', s);
    setFontSizeState(s);
  }

  function setTheme(t: Theme) {
    applyTheme(t);
    localStorage.setItem('settings-theme', t);
  }

  function setFontSize(s: FontSize) {
    applyFontSize(s);
    localStorage.setItem('settings-font-size', s);
  }

  return (
    <SettingsContext.Provider value={{ theme, fontSize, setTheme, setFontSize }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
