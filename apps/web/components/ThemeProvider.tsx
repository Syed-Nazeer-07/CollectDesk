'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';
type ThemePreferenceValue = Theme | 'system';

interface ThemeContextType {
  theme: Theme;
  preference: ThemePreferenceValue;
  setPreference: (preference: ThemePreferenceValue) => void;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  preference: 'system',
  setPreference: () => {},
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [preference, setPreferenceState] = useState<ThemePreferenceValue>('system');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem('cd-theme'); } catch {}
      const next = saved === 'light' || saved === 'dark' ? saved : 'system';
      setPreferenceState(next);
      const resolved = next === 'system' ? (media.matches ? 'dark' : 'light') : next;
      setThemeState(resolved);
      applyTheme(resolved);
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', sync); };
  }, []);

  function applyTheme(t: Theme) {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(t);
    root.setAttribute('data-theme', t);
    root.style.colorScheme = t;
  }

  const setPreference = (next: ThemePreferenceValue) => {
    setPreferenceState(next);
    const resolved = next === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : next;
    setThemeState(resolved);
    applyTheme(resolved);
    try { localStorage.setItem('cd-theme', next); } catch {}
  };
  const setTheme = (next: Theme) => setPreference(next);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle-btn ${className}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="theme-toggle-track">
        <span className={`theme-toggle-thumb ${theme}`}>
          {theme === 'dark' ? <Moon size={14} strokeWidth={2.4} /> : <Sun size={14} strokeWidth={2.4} />}
        </span>
      </span>
      <span className="theme-toggle-text">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}


export function ThemePreference() {
  const {preference, setPreference} = useTheme();
  return <label className="field theme-preference">Theme preference<select value={preference} onChange={e=>setPreference(e.target.value as ThemePreferenceValue)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}
