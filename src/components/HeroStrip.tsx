import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FlatList, Platform, Pressable, View} from 'react-native';
import {Image} from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {HomeStackParamList} from '../App';
import useContentStore from '../lib/zustand/contentStore';
import AppText from './ui/Text';
import GlassSurface from './ui/GlassSurface';
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

const isTv = Platform.isTV;

type M3Colors = ReturnType<typeof useM3Colors>;

// TV: Pressable is not focusable by default — every interactive hero item
// opts in explicitly and paints a focus-driven ring (transparent when
// blurred so there is no layout shift when the border appears).
const HeroActiveCard = ({
  item,
  colors,
  onOpen,
}: {
  item: HeroStripItem;
  colors: M3Colors;
  onOpen: (item: HeroStripItem) => void;
}) => {
  const [focusedPart, setFocusedPart] = useState<'poster' | 'play' | null>(
    null,
  );
  const ring = (part: 'poster' | 'play') => ({
    borderWidth: isTv ? 3 : 0,
    borderColor:
      isTv && focusedPart === part ? colors.primary : 'transparent',
    borderRadius: 8,
  });
  return (
    <GlassSurface
      radius={14}
      intensity={70}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        gap: 10,
        width: ACTIVE_WIDTH,
      }}>
      <Pressable
        focusable={isTv}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={() => onOpen(item)}
        onFocus={isTv ? () => setFocusedPart('poster') : undefined}
        onBlur={isTv ? () => setFocusedPart(null) : undefined}
        style={ring('poster')}>
        <Image
          source={{uri: item.image}}
          style={{width: 44, height: 60, borderRadius: 8}}
          contentFit="cover"
        />
      </Pressable>
      {/* Title mirrors the poster action but stays out of the D-pad
          traversal so focus does not ping-pong inside the active card. */}
      <Pressable onPress={() => onOpen(item)} style={{flex: 1, minWidth: 0}}>
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
        focusable={isTv}
        accessibilityRole="button"
        accessibilityLabel="Play"
        onPress={() => onOpen(item)}
        onFocus={isTv ? () => setFocusedPart('play') : undefined}
        onBlur={isTv ? () => setFocusedPart(null) : undefined}
        style={({pressed}) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
          borderWidth: isTv ? 3 : 0,
          borderColor:
            isTv && focusedPart === 'play' ? colors.primary : 'transparent',
        })}>
        <MaterialCommunityIcons
          name="play"
          size={20}
          color={colors.onPrimary}
        />
      </Pressable>
    </GlassSurface>
  );
};

const HeroMiniCard = ({
  item,
  colors,
  onSelect,
}: {
  item: HeroStripItem;
  colors: M3Colors;
  onSelect: (item: HeroStripItem) => void;
}) => {
  const [tvFocused, setTvFocused] = useState(false);
  return (
    <Pressable
      focusable={isTv}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => onSelect(item)}
      onFocus={isTv ? () => setTvFocused(true) : undefined}
      onBlur={isTv ? () => setTvFocused(false) : undefined}
      style={({pressed}) => ({
        opacity: pressed ? 0.75 : 1,
        borderRadius: 8,
        borderWidth: isTv ? 3 : 0,
        borderColor:
          isTv && tvFocused ? colors.primary : 'transparent',
      })}>
      <Image
        source={{uri: item.image}}
        style={{width: MINI_WIDTH, height: MINI_HEIGHT, borderRadius: 8}}
        contentFit="cover"
      />
    </Pressable>
  );
};

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
          <HeroActiveCard item={item} colors={colors} onOpen={openDetails} />
        );
      }
      return <HeroMiniCard item={item} colors={colors} onSelect={onSelect} />;
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
