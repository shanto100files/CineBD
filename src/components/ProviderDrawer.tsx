import {Platform, Text, ScrollView, View} from 'react-native';
import React from 'react';
import useContentStore from '../lib/zustand/contentStore';
import {MaterialIcons} from '@expo/vector-icons';
import {useM3Colors} from '../theme/M3PaletteContext';
import TvFocusable from './ui/TvFocusable';

const isTv = Platform.isTV;

const ProviderDrawer = ({onClose}: {onClose: () => void}) => {
  const provider = useContentStore(state => state.provider);
  const setProvider = useContentStore(state => state.setProvider);
  const installedProviders = useContentStore(
    state => state.installedProviders,
  );
  const colors = useM3Colors();
  const primary = colors.primary;

  return (
    <View className="flex-1" style={{backgroundColor: 'rgba(0,0,0,0.8)'}}>
      <View className="mt-10 px-4 pb-4 border-b border-white/10">
        <Text className="text-white text-2xl font-bold">Select Provider</Text>
        <Text className="text-gray-400 mt-1 text-sm">Content source</Text>
        {/* TV: the drawer had no close affordance — without this the D-pad
            user could get stuck once the drawer opens. It takes the initial
            focus so BACK-out of the drawer is one OK press away. */}
        {isTv ? (
          <TvFocusable
            onPress={onClose}
            hasTVPreferredFocus
            accessibilityRole="button"
            accessibilityLabel="ড্রয়ার বন্ধ করুন"
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 8,
            }}>
            <MaterialIcons name="arrow-back" size={16} color="#FFF" />
            <Text className="text-white ml-2 text-sm">বন্ধ করুন</Text>
          </TvFocusable>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1 px-2">
        {installedProviders.map(item => (
          <TvFocusable
            key={item.value}
            onPress={() => {
              setProvider(item);
              onClose();
            }}
            accessibilityRole="button"
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 16,
                marginVertical: 4,
                borderRadius: 8,
              },
              provider.value === item.value
                ? {backgroundColor: 'rgba(255,255,255,0.1)'}
                : null,
            ]}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <MaterialIcons
                name="movie"
                size={20}
                color={provider.value === item.value ? primary : '#888'}
              />
              <Text
                className={`ml-3 text-base ${
                  provider.value === item.value
                    ? 'text-white font-medium'
                    : 'text-gray-400'
                }`}>
                {item.display_name}
              </Text>
            </View>
            {provider.value === item.value && (
              <MaterialIcons name="check" size={20} color={primary} />
            )}
          </TvFocusable>
        ))}
        <View className="h-16" />
      </ScrollView>
    </View>
  );
};

export default ProviderDrawer;
