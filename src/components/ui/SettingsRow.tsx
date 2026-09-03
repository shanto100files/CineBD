import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {ReactNode} from 'react';
import {Pressable, View} from 'react-native';
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

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      hitSlop={{top: 4, bottom: 4, left: 0, right: 0}}
      onPress={onPress}
      style={({pressed}) => ({
        backgroundColor: pressed ? colors.surfaceContainerHigh : 'transparent',
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
