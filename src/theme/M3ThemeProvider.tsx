import React, {useMemo} from 'react';
import {View} from 'react-native';
import {vars} from 'nativewind';
import {getMaterialColors} from '@expo/ui/jetpack-compose';
import {M3_COLOR_ROLES, roleToCssVar} from './colors';
import {
  createCoherentAccentRoles,
  DEFAULT_SEED,
  LEGACY_NEUTRAL_SURFACE_ROLES,
  NETFLIX_SEED,
} from './seeds';
import {M3HostThemeContext, M3PaletteContext} from './M3PaletteContext';
import useThemeStore from '../lib/zustand/themeStore';

export const FIXED_THEME_PRIMARY = '#E4E4E4';

export const M3ThemeProvider = ({children}: {children: React.ReactNode}) => {
  const primary = useThemeStore(state => state.primary);
  const source = useThemeStore(state => state.source);
  const isNetflix =
    source === 'custom' &&
    primary.toUpperCase() === NETFLIX_SEED.toUpperCase();

  const palette = useMemo(() => {
    const generatedPalette = getMaterialColors({
      scheme: 'dark',
      ...(source === 'custom' ? {seedColor: primary} : {}),
    });
    const customAccentRoles =
      source === 'custom' && primary.toUpperCase() === DEFAULT_SEED
        ? createCoherentAccentRoles(DEFAULT_SEED)
        : {};

    // Netflix-accurate overrides: OLED black bg, #141414 surfaces, red accent
    const netflixOverrides = isNetflix
      ? {
          primary: '#E50914',
          onPrimary: '#FFFFFF',
          primaryContainer: '#8B0000',
          onPrimaryContainer: '#FFCDD2',
          secondary: '#B81D24',
          onSecondary: '#FFFFFF',
          secondaryContainer: '#5C0008',
          onSecondaryContainer: '#FFCDD2',
          background: '#000000',
          onBackground: '#E5E5E5',
          surface: '#141414',
          surfaceDim: '#0A0A0A',
          surfaceContainerLowest: '#080808',
          surfaceContainerLow: '#141414',
          surfaceContainer: '#1A1A1A',
          surfaceContainerHigh: '#222222',
          surfaceContainerHighest: '#2A2A2A',
          surfaceBright: '#333333',
          surfaceVariant: '#1F1F1F',
          onSurface: '#E5E5E5',
          onSurfaceVariant: '#A3A3A3',
          outline: '#525252',
          outlineVariant: '#2B2B2B',
          inverseSurface: '#E5E5E5',
          inverseOnSurface: '#141414',
          scrim: '#000000',
          surfaceTint: '#E50914',
        }
      : {};

    return {
      ...generatedPalette,
      ...customAccentRoles,
      ...LEGACY_NEUTRAL_SURFACE_ROLES,
      ...netflixOverrides,
      background: '#000000',
      onBackground: isNetflix ? '#E5E5E5' : '#F2F2F2',
      onSurface: isNetflix ? '#E5E5E5' : '#F2F2F2',
      onSurfaceVariant: isNetflix ? '#A3A3A3' : '#C4C4C4',
      outline: isNetflix ? '#525252' : '#909090',
      outlineVariant: isNetflix ? '#2B2B2B' : '#454545',
    } as const;
  }, [primary, source, isNetflix]);
  const hostTheme = useMemo(
    () => ({
      colorScheme: 'dark' as const,
      ...(source === 'custom' ? {seedColor: primary} : {}),
    }),
    [primary, source],
  );

  const style = useMemo(() => {
    const entries = M3_COLOR_ROLES.map(role => [
      roleToCssVar(role),
      palette[role],
    ]);
    return vars(Object.fromEntries(entries));
  }, [palette]);

  return (
    <M3HostThemeContext.Provider value={hostTheme}>
      <M3PaletteContext.Provider value={palette}>
        <View style={[{flex: 1}, style]}>{children}</View>
      </M3PaletteContext.Provider>
    </M3HostThemeContext.Provider>
  );
};

export {useM3Colors} from './M3PaletteContext';
