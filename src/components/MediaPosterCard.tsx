import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import {Pressable, View} from 'react-native';
import {Image} from 'expo-image';
import {useM3Colors} from '../theme/M3PaletteContext';
import AppText from './ui/Text';
import {MediaFallback} from './ui/MediaFallback';

interface MediaPosterCardProps {
  title: string;
  poster?: string;
  width: number;
  subtitle?: string;
  badge?: number | string;
  seasonBadge?: string;
  providerBadge?: string;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

const MediaPosterCard = ({
  title,
  poster,
  width,
  subtitle,
  badge,
  seasonBadge,
  providerBadge,
  selected = false,
  selectionMode = false,
  onPress,
  onLongPress,
}: MediaPosterCardProps) => {
  const colors = useM3Colors();

  return (
    <View style={{width}}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={({pressed}) => ({
          opacity: pressed ? 0.86 : 1,
          transform: [{scale: pressed ? 0.96 : 1}],
          borderRadius: 22,
          backgroundColor: selected
            ? colors.primaryContainer
            : 'transparent',
          padding: selected ? 4 : 0,
        })}>
        <View
          style={{
            backgroundColor: colors.surfaceContainerHigh,
            borderRadius: 18,
            overflow: 'hidden',
            width: selected ? width - 8 : width,
            position: 'relative',
            borderWidth: selected ? 2 : 0,
            borderColor: selected ? colors.primary : 'transparent',
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 6},
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 5,
          }}>
          {badge != null ? (
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 6,
                backgroundColor: badge === '4K' ? '#D4A017' : colors.primaryContainer,
                borderRadius: badge === '4K' ? 6 : 8,
                paddingHorizontal: badge === '4K' ? 6 : 8,
                paddingVertical: 2,
                zIndex: 10,
                borderWidth: badge === '4K' ? 0 : 1,
                borderColor: badge === '4K' ? 'transparent' : colors.outlineVariant,
                minWidth: 24,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: badge === '4K' ? '#D4A017' : undefined,
                shadowOffset: badge === '4K' ? {width: 0, height: 1} : undefined,
                shadowOpacity: badge === '4K' ? 0.4 : undefined,
                shadowRadius: badge === '4K' ? 3 : undefined,
                elevation: badge === '4K' ? 3 : undefined,
              }}>
              <AppText
                role="labelSmallEmphasized"
                style={{
                  color: badge === '4K' ? '#1A1A1A' : colors.onPrimaryContainer,
                  fontWeight: '900',
                  fontSize: badge === '4K' ? 9 : 10,
                  letterSpacing: badge === '4K' ? 0.8 : 0,
                  includeFontPadding: false,
                }}>
                {badge}
              </AppText>
            </View>
          ) : null}

          {seasonBadge ? (
            <View
              style={{
                position: 'absolute',
                top: badge != null ? 32 : 6,
                left: 6,
                backgroundColor: 'rgba(0,0,0,0.75)',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                zIndex: 9,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <AppText
                role="labelSmallEmphasized"
                style={{
                  color: '#FFFFFF',
                  fontWeight: '900',
                  fontSize: 10,
                  includeFontPadding: false,
                }}>
                {seasonBadge}
              </AppText>
            </View>
          ) : null}

          {providerBadge ? (
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                backgroundColor: 'rgba(0,0,0,0.7)',
                borderRadius: 6,
                paddingHorizontal: 5,
                paddingVertical: 2,
                zIndex: 5,
              }}>
              <AppText
                role="labelSmall"
                style={{
                  color: '#fff',
                  fontWeight: '800',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}>
                {providerBadge}
              </AppText>
            </View>
          ) : null}

          {selectionMode ? (
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                backgroundColor: selected ? colors.primary : 'rgba(0,0,0,0.55)',
                borderRadius: 12,
                width: 22,
                height: 22,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
                borderWidth: 1,
                borderColor: selected ? colors.primary : 'rgba(255,255,255,0.6)',
              }}>
              {selected ? (
                <MaterialCommunityIcons
                  name="check"
                  size={14}
                  color={colors.onPrimary}
                />
              ) : null}
            </View>
          ) : null}

          {poster ? (
            <Image
              source={poster}
              contentFit="cover"
              transition={220}
              style={{aspectRatio: 2 / 3, width: selected ? width - 8 : width}}
            />
          ) : (
            <View style={{aspectRatio: 2 / 3, width: selected ? width - 8 : width}}>
              <MediaFallback title={title} />
            </View>
          )}
        </View>
        <AppText
          role="labelMediumEmphasized"
          ellipsizeMode="tail"
          numberOfLines={1}
          style={{
            color: selected ? colors.onPrimaryContainer : colors.onSurface,
            marginTop: selected ? 4 : 7,
            paddingHorizontal: selected ? 2 : 0,
          }}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText
            role="labelSmall"
            ellipsizeMode="tail"
            numberOfLines={1}
            style={{
              color: selected
                ? colors.onPrimaryContainer
                : colors.onSurfaceVariant,
              marginTop: 1,
              paddingHorizontal: selected ? 2 : 0,
            }}>
            {subtitle}
          </AppText>
        ) : null}
      </Pressable>
    </View>
  );
};

export default React.memo(MediaPosterCard);
