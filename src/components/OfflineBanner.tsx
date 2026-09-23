import React from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useM3Colors} from '../theme/M3PaletteContext';
import {useIsOffline} from '../lib/netStatus';
import AppText from './ui/Text';

const OfflineBanner: React.FC = () => {
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  const colors = useM3Colors();
  const slide = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(slide, {
      toValue: offline ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [offline, slide]);

  if (!offline) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.banner,
        {top: insets.top, opacity: slide, transform: [{translateY: slide._value === 0 ? -8 : 0}]},
      ]}>
      <MaterialIcons name="wifi-off" size={14} color="#fbbf24" />
      <AppText role="labelMedium" style={styles.text}>
        ইন্টারনেট সংযোগ নেই — অফলাইনে চলছে · No internet connection
      </AppText>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(20,20,24,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  text: {color: '#fbbf24', fontWeight: '700'},
});

export default OfflineBanner;
