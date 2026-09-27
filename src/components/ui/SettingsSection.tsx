import React, {ReactNode} from 'react';
import {View} from 'react-native';
import Surface from './Surface';
import AppText from './Text';
import {SPACING} from '../../theme/layout';
import {useM3Colors} from '../../theme/M3PaletteContext';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

const SettingsSection = ({title, children}: SettingsSectionProps) => {
  const colors = useM3Colors();

  return (
    <View style={{marginBottom: SPACING.xxl}}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: SPACING.sm + 2,
          paddingHorizontal: SPACING.xs,
        }}>
        <View
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            backgroundColor: colors.primary,
            marginRight: SPACING.sm,
          }}
        />
        <AppText
          role="labelSmallEmphasized"
          style={{
            color: colors.primary,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}>
          {title}
        </AppText>
      </View>
      <Surface level="low" outlined className="overflow-hidden">
        {children}
      </Surface>
    </View>
  );
};

export default SettingsSection;
