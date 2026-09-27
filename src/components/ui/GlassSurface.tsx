import {BlurView} from 'expo-blur';
import React from 'react';
import {Platform, StyleSheet, View, ViewProps} from 'react-native';
import {GLASS_BORDER, GLASS_TINT} from '../../theme/layout';
import {M3_SHAPES} from '../../theme/shapes';

const ANDROID_TINT = 'rgba(14, 14, 16, 0.72)';

interface GlassSurfaceProps extends ViewProps {
  radius?: number;
  intensity?: number;
  bordered?: boolean;
  tint?: string;
  children?: React.ReactNode;
}

const GlassSurface = ({
  radius = M3_SHAPES.extraLarge,
  intensity = 60,
  bordered = true,
  tint = GLASS_TINT,
  style,
  children,
  ...rest
}: GlassSurfaceProps) => (
  <View
    {...rest}
    style={[
      {
        borderRadius: radius,
        borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
        borderColor: GLASS_BORDER,
        elevation: 6,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 6},
        shadowOpacity: 0.4,
        shadowRadius: 14,
      },
      style,
    ]}>
    {Platform.OS === 'ios' ? (
      <BlurView
        blurMethod="dimezisBlurView"
        intensity={intensity}
        style={StyleSheet.absoluteFill}
        tint="dark"
      />
    ) : null}
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, {backgroundColor: Platform.OS === 'ios' ? tint : ANDROID_TINT}]}
    />
    {children}
  </View>
);

export default GlassSurface;
