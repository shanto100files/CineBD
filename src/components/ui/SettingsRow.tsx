import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {ReactNode, useState} from 'react';
import {Platform, Pressable, View} from 'react-native';
import {useM3Colors} from '../../theme/M3PaletteContext';
import AppText from './Text';

interface SettingsRowProps {
  title: string;
  description?: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor?: string;
  iconBg?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  divider?: boolean;
}

const SettingsRow = ({
  title,
  description,
  icon,
  iconColor,
  iconBg,
  onPress,
  trailing,
  divider = true,
}: SettingsRowProps) => {
  const colors = useM3Colors();
  // Android TV: Pressable is not focusable by default — opt in and paint a
  // clear focus ring so D-pad navigation is visible.
  const isTv = Platform.isTV;
  const [tvFocused, setTvFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      focusable={isTv && !!onPress}
      hitSlop={{top: 4, bottom: 4, left: 0, right: 0}}
      onPress={onPress}
      onFocus={isTv ? () => setTvFocused(true) : undefined}
      onBlur={isTv ? () => setTvFocused(false) : undefined}
      style={({pressed}) => ({
        backgroundColor:
          pressed || tvFocused ? colors.surfaceContainerHigh : 'transparent',
        borderLeftWidth: isTv && tvFocused ? 4 : 0,
        borderLeftColor: isTv && tvFocused ? colors.primary : 'transparent',
      })}>
      <View
        style={{
          minHeight: 60,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomColor: colors.outlineVariant,
          borderBottomWidth: divider ? 1 : 0,
        }}>
        {icon ? (
          <View
            style={{
              marginRight: 14,
              height: 40,
              width: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              backgroundColor: iconBg ?? colors.primaryContainer,
            }}>
            <MaterialCommunityIcons
              name={icon}
              size={20}
              color={iconColor ?? colors.onPrimaryContainer}
              pointerEvents="none"
            />
          </View>
        ) : null}
        <View style={{flex: 1, marginRight: 8}}>
          <AppText
            role="bodyLargeEmphasized"
            style={{color: colors.onSurface, fontWeight: '600'}}>
            {title}
          </AppText>
          {description ? (
            <AppText
              role="bodySmall"
              style={{marginTop: 2, color: colors.onSurfaceVariant}}>
              {description}
            </AppText>
          ) : null}
        </View>
        {trailing ??
          (onPress ? (
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.outline}
              pointerEvents="none"
            />
          ) : null)}
      </View>
    </Pressable>
  );
};

export default SettingsRow;
