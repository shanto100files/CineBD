import React, {ReactNode} from 'react';
import {View} from 'react-native';
import Surface from './Surface';
import AppText from './Text';
import {useM3Colors} from '../../theme/M3PaletteContext';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

const SettingsSection = ({title, children}: SettingsSectionProps) => {
  const colors = useM3Colors();

  return (
    <View style={{marginBottom: 24}}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 10,
          paddingHorizontal: 4,
        }}>
        <View
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            backgroundColor: colors.primary,
            marginRight: 8,
          }}
        />
        <AppText
          role="labelLarge"
          style={{
            color: colors.primary,
            fontWeight: '700',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            fontSize: 11,
          }}>
          {title}
        </AppText>
      </View>
      <Surface level="low" className="overflow-hidden">
        {children}
      </Surface>
    </View>
  );
};

export default SettingsSection;
