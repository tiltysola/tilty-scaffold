import { createContext, useContext } from 'react';

export type ResolvedTheme = 'dark' | 'light';
export type AppliedTheme = ResolvedTheme | 'system';
export type AppThemeMode = 'auto' | ResolvedTheme;

export interface ThemeModeContextValue {
  mode: AppThemeMode;
  setMode: (mode: AppThemeMode) => void;
}

const themeModeStorageKey = 'tilty-scaffold.theme.mode';
const themeModes = new Set<AppThemeMode>(['auto', 'dark', 'light']);

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode() {
  const context = useContext(ThemeModeContext);

  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider.');
  }

  return context;
}

export function resolveAppliedTheme(mode: AppThemeMode, profileBackgroundTheme: ResolvedTheme | null): AppliedTheme {
  if (mode !== 'auto') {
    return mode;
  }

  return profileBackgroundTheme ?? 'system';
}

export function readStoredThemeMode(): AppThemeMode {
  if (typeof window === 'undefined') {
    return 'auto';
  }

  try {
    const value = window.localStorage.getItem(themeModeStorageKey);

    return isAppThemeMode(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeStoredThemeMode(mode: AppThemeMode) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(themeModeStorageKey, mode);
  } catch {
    // Theme persistence is a user preference and must not block rendering.
  }
}

function isAppThemeMode(value: unknown): value is AppThemeMode {
  return typeof value === 'string' && themeModes.has(value as AppThemeMode);
}
