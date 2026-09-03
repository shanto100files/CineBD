import React, {createContext, useContext} from 'react';
import type {MaterialColors} from './colors';

export type M3HostTheme = {
  colorScheme: 'dark';
  seedColor?: string;
};

const fallbackPalette: MaterialColors = {
  primary: '#E50914',
  onPrimary: '#FFFFFF',
  primaryContainer: '#8B0000',
  onPrimaryContainer: '#FFCDD2',
  inversePrimary: '#B81D24',
  secondary: '#B81D24',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#5C0008',
  onSecondaryContainer: '#FFCDD2',
  tertiary: '#FF6584',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#7A0030',
  onTertiaryContainer: '#FFD9E2',
  background: '#000000',
  onBackground: '#E5E5E5',
  surface: '#141414',
  onSurface: '#E5E5E5',
  surfaceVariant: '#1F1F1F',
  onSurfaceVariant: '#A3A3A3',
  surfaceTint: '#E50914',
  inverseSurface: '#E5E5E5',
  inverseOnSurface: '#141414',
  error: '#FF453A',
  onError: '#FFFFFF',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  outline: '#525252',
  outlineVariant: '#2B2B2B',
  scrim: '#000000',
  surfaceBright: '#333333',
  surfaceDim: '#0A0A0A',
  surfaceContainer: '#1A1A1A',
  surfaceContainerHigh: '#222222',
  surfaceContainerHighest: '#2A2A2A',
  surfaceContainerLow: '#141414',
  surfaceContainerLowest: '#080808',
  primaryFixed: '#FFCDD2',
  primaryFixedDim: '#FF8A80',
  onPrimaryFixed: '#3A0905',
  onPrimaryFixedVariant: '#8B0000',
  secondaryFixed: '#FFCDD2',
  secondaryFixedDim: '#FF8A80',
  onSecondaryFixed: '#2C0006',
  onSecondaryFixedVariant: '#5C0008',
  tertiaryFixed: '#FFD9E2',
  tertiaryFixedDim: '#FFB3C1',
  onTertiaryFixed: '#3E001A',
  onTertiaryFixedVariant: '#7A0030',
};

export const M3PaletteContext = createContext<MaterialColors>(fallbackPalette);
export const M3HostThemeContext = createContext<M3HostTheme>({
  colorScheme: 'dark',
});

export const useM3Colors = (): MaterialColors => useContext(M3PaletteContext);
export const useM3HostTheme = (): M3HostTheme => useContext(M3HostThemeContext);
