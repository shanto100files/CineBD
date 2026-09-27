import {BlurView} from 'expo-blur';
import React from 'react';
import {StyleSheet, View, ViewProps} from 'react-native';
import {GLASS_BORDER, GLASS_TINT} from '../../theme/layout';
import {M3_SHAPES} from '../../theme/shapes';

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
    <BlurView
      blurMethod="dimezisBlurView"
      intensity={intensity}
      style={StyleSheet.absoluteFill}
      tint="dark"
    />
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, {backgroundColor: tint}]}
    />
    {children}
  </View>
);

export default GlassSurface;
