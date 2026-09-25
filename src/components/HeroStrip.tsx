import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {FlatList, Pressable, View} from 'react-native';
import {Image} from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {HomeStackParamList} from '../App';
import useContentStore from '../lib/zustand/contentStore';
import AppText from './ui/Text';
import {useM3Colors} from '../theme/M3PaletteContext';

export interface HeroStripItem {
  link: string;
  title?: string;
  image?: string;
  provider?: string;
}

interface HeroStripProps {
  posts: HeroStripItem[];
  activeLink: string;
  onSelect: (post: HeroStripItem) => void;
}

const ITEM_GAP = 10;
const MINI_WIDTH = 52;
const MINI_HEIGHT = 76;
const ACTIVE_WIDTH = 252;

// MovieBox-style overlap strip that floats over the bottom edge of the hero.
// The active item keeps its ORIGINAL position in the list but renders as a
// wide card and is auto-centered (carousel behaviour): selecting a mini poster
// scrolls it to the middle of the strip with smaller neighbours on both sides.
const HeroStrip = ({posts, activeLink, onSelect}: HeroStripProps) => {
  const colors = useM3Colors();
  const provider = useContentStore(state => state.provider);
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const listRef = useRef<FlatList<HeroStripItem>>(null);

  const activeIndex = useMemo(
    () => posts.findIndex(p => p.link === activeLink),
    [posts, activeLink],
  );

  // Center the active card in the strip whenever it changes (and on mount).
  useEffect(() => {
    if (activeIndex < 0) return;
    // Wait a tick so the wide-card layout for the new active item exists.
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({
          index: activeIndex,
          animated: true,
          viewPosition: 0.5, // 0.5 = center the item in the viewport
        });
      } catch {
        // Index out of range during data swaps — safe to ignore.
      }
    }, 60);
    return () => clearTimeout(t);
  }, [activeIndex]);

  const openDetails = useCallback(
    (item: HeroStripItem) => {
      if (!item.link) {
        return;
      }
      navigation.navigate('Info', {
        link: item.link,
        provider: item.provider || provider?.value,
        poster: item.image,
      });
    },
    [navigation, provider?.value],
  );

  const renderItem = useCallback(
    ({item}: {item: HeroStripItem}) => {
      const isActive = item.link === activeLink;
      if (isActive) {
        return (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 14,
              padding: 8,
              gap: 10,
              width: ACTIVE_WIDTH,
            }}>
            <Pressable onPress={() => openDetails(item)}>
              <Image
                source={{uri: item.image}}
                style={{width: 44, height: 60, borderRadius: 8}}
                contentFit="cover"
              />
            </Pressable>
            <Pressable
              onPress={() => openDetails(item)}
              style={{flex: 1, minWidth: 0}}>
              <AppText
                numberOfLines={2}
                style={{
                  color: colors.onSurface,
                  fontSize: 13,
                  fontWeight: '700',
                }}>
                {item.title}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play"
              onPress={() => openDetails(item)}
              style={({pressed}) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
              })}>
              <MaterialCommunityIcons
                name="play"
                size={20}
                color={colors.onPrimary}
              />
            </Pressable>
          </View>
        );
      }
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onPress={() => onSelect(item)}
          style={({pressed}) => ({opacity: pressed ? 0.75 : 1})}>
          <Image
            source={{uri: item.image}}
            style={{width: MINI_WIDTH, height: MINI_HEIGHT, borderRadius: 8}}
            contentFit="cover"
          />
        </Pressable>
      );
    },
    [activeLink, colors, openDetails, onSelect],
  );

  if (posts.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: 8,
      }}>
      <FlatList
        ref={listRef}
        data={posts}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => `${item.link}-${i}`}
        ItemSeparatorComponent={() => <View style={{width: ITEM_GAP}} />}
        renderItem={renderItem}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={false}
        onScrollToIndexFailed={info => {
          // Item not rendered yet — wait then retry centering it.
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: 0.5,
              });
            } catch {}
          }, 120);
        }}
      />
    </View>
  );
};

export default HeroStrip;
