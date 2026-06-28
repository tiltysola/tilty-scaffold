import { type ReactNode, useEffect, useState } from 'react';

import { FastAverageColor } from 'fast-average-color';
import {
  ThemeProvider as NextThemeProvider,
  type ThemeProviderProps as NextThemeProviderProps,
  useTheme as useNextTheme,
} from 'next-themes';

import { useAuth } from '@/hooks/useAuth';
import { type AuthSnapshot, resolveAssetUrl } from '@/lib/auth';

type ResolvedTheme = 'dark' | 'light';
type NextTheme = ResolvedTheme | 'system';

interface ThemeProviderProps extends NextThemeProviderProps {
  children: ReactNode;
}

interface ProfileBackgroundThemeSample {
  imageUrl: string;
  theme: ResolvedTheme | null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemeProvider {...props}>
      <ThemeController />
      {children}
    </NextThemeProvider>
  );
}

function ThemeController() {
  const { setTheme } = useNextTheme();
  const profileBackgroundTheme = useProfileBackgroundTheme();
  const nextTheme = resolveNextTheme(profileBackgroundTheme);

  useEffect(() => {
    setTheme(nextTheme);
  }, [nextTheme, setTheme]);

  return null;
}

function useProfileBackgroundTheme() {
  const [sample, setSample] = useState<ProfileBackgroundThemeSample | null>(null);
  const snapshot = useAuth();
  const imageUrl = resolveProfileBackgroundUrl(snapshot);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    let isActive = true;
    const averageColor = new FastAverageColor();
    const image = new Image();

    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!isActive) {
        return;
      }

      setSample({
        imageUrl,
        theme: getProfileBackgroundTheme(averageColor, image),
      });
    };
    image.onerror = () => {
      if (!isActive) {
        return;
      }

      setSample({
        imageUrl,
        theme: null,
      });
    };
    image.src = imageUrl;

    return () => {
      isActive = false;
      averageColor.destroy();
    };
  }, [imageUrl]);

  if (!imageUrl || sample?.imageUrl !== imageUrl) {
    return null;
  }

  return sample.theme;
}

function resolveProfileBackgroundUrl(snapshot: AuthSnapshot) {
  if (snapshot.status !== 'authenticated' || !snapshot.session) {
    return null;
  }

  return resolveAssetUrl(snapshot.session.user.profileBackgroundUrl) ?? null;
}

function getProfileBackgroundTheme(averageColor: FastAverageColor, image: HTMLImageElement): ResolvedTheme | null {
  try {
    const result = averageColor.getColor(image, {
      mode: 'precision',
      silent: true,
    });

    return result.isDark ? 'dark' : 'light';
  } catch {
    return null;
  }
}

function resolveNextTheme(profileBackgroundTheme: ResolvedTheme | null): NextTheme {
  return profileBackgroundTheme ?? 'system';
}
