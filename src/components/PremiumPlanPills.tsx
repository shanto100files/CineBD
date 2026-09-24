import React from 'react';
import {View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from './ui/Text';

interface PremiumPlanPillsProps {
  items: {
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    label: string;
    badge?: string;
  }[];
}

// Compact icon+label pills (MovieBox hero row: Premium Basic | Faster
// Downloads | Phone Logins x3 ...). Wraps to two rows on narrow screens.
const PremiumPlanPills = ({items}: PremiumPlanPillsProps) => (
  <View
    style={{
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'space-between',
    }}>
    {items.map(item => (
      <View
        key={item.label}
        style={{
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.28)',
          borderColor: 'rgba(255,230,170,0.35)',
          borderRadius: 14,
          borderWidth: 1,
          minWidth: 62,
          flex: 1,
          maxWidth: 92,
          paddingVertical: 8,
          paddingHorizontal: 4,
        }}>
        <View>
          <MaterialCommunityIcons
            name={item.icon}
            size={20}
            color="#ffe9b8"
          />
          {item.badge ? (
            <View
              style={{
                position: 'absolute',
                top: -6,
                right: -14,
                backgroundColor: '#E8B84B',
                borderRadius: 8,
                paddingHorizontal: 4,
              }}>
              <AppText style={{color: '#4a2f0d', fontSize: 9, fontWeight: '800'}}>
                {item.badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText
          style={{
            color: 'rgba(255,240,205,0.92)',
            fontSize: 10,
            fontWeight: '600',
            marginTop: 5,
            textAlign: 'center',
          }}>
          {item.label}
        </AppText>
      </View>
    ))}
  </View>
);

export default PremiumPlanPills;
