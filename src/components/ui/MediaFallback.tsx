import {Image} from 'expo-image';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import React from 'react';
import {Platform, StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AppText from './Text';

const PALETTE: Array<[string, string, string]> = [
  ['#2A1B3D', '#44318D', '#D4A017'],
  ['#1B2A3D', '#2D548D', '#4FC3F7'],
  ['#3D1B1B', '#8D3132', '#E53935'],
  ['#1B3D2A', '#318D52', '#4CAF50'],
  ['#3D2A1B', '#8D6232', '#FFB300'],
  ['#241B3D', '#4A2D8D', '#9575CD'],
];

const hashString = (input: string): number => {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

const initialsOf = (title: string): string => {
  const words = (title || 'Cinepix')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return 'C';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
};

/**
 * Professional branded poster/backdrop fallback.
 * Deterministic monogram + film icon on a subtle gradient derived from
 * the title hash — replaces remote placehold.jp images.
 */
export const MediaFallback = ({
  title,
  width,
  height,
  variant = 'poster',
}: {
  title: string;
  width?: number | string;
  height?: number | string;
  variant?: 'poster' | 'backdrop';
}) => {
  const [bg1, bg2, accent] = PALETTE[hashString(title) % PALETTE.length];
  const isBackdrop = variant === 'backdrop';

  return (
    <LinearGradient
      colors={[bg1, bg2]}
      style={[
        styles.container,
        {width: width ?? '100%', height: height ?? '100%'},
      ]}>
      {isBackdrop ? null : (
        <View style={[styles.halo, {backgroundColor: accent, opacity: 0.14}]} />
      )}
      <MaterialCommunityIcons
        name="movie-open-play-outline"
        size={isBackdrop ? 44 : 30}
        color={accent}
        style={styles.icon}
      />
      <AppText
        role={isBackdrop ? 'displayMedium' : 'titleLarge'}
        style={[styles.initials, {color: accent}]}>
        {initialsOf(title)}
      </AppText>
    </LinearGradient>
  );
};

/**
 * Drop-in image with branded fallback.
 * Renders MediaFallback while the source is missing or fails to load.
 */
export const MediaImage = ({
  uri,
  title,
  style,
  contentFit = 'cover',
  variant = 'poster',
}: {
  uri?: string;
  title: string;
  style?: any;
  contentFit?: 'cover' | 'contain' | 'fill';
  variant?: 'poster' | 'backdrop';
}) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (!uri || failed) {
    return (
      <MediaFallback
        title={title}
        width={style?.width}
        height={style?.height}
        variant={variant}
      />
    );
  }
  return (
    <Image
      source={{uri}}
      style={style}
      contentFit={contentFit}
      onError={() => setFailed(true)}
      transition={150}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141414',
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    width: '86%',
    height: '86%',
    borderRadius: 999,
  },
  icon: {
    marginBottom: 6,
  },
  initials: {
    fontWeight: '900',
    letterSpacing: 2,
    opacity: 0.95,
  },
});

export default MediaFallback;
