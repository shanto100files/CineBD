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

// MovieBox-style overlap strip that floats over the bottom edge of the hero.
// The active item renders as a wide card (mini poster + title + play circle);
// the remaining items render as small posters. Tapping a mini poster swaps the
// hero (via the hero store, wired by Home); the play circle opens the details
// page.
const HeroStrip = ({posts, activeLink, onSelect}: HeroStripProps) => {
  const colors = useM3Colors();
  const provider = useContentStore(state => state.provider);
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const listRef = useRef<FlatList<HeroStripItem>>(null);

  // Active item first so it always renders as the wide card on the left.
  const ordered = useMemo(() => {
    const active = posts.find(p => p.link === activeLink);
    const rest = posts.filter(p => p.link !== activeLink);
    return active ? [active, ...rest] : posts;
  }, [posts, activeLink]);

  useEffect(() => {
    listRef.current?.scrollToOffset({offset: 0, animated: true});
  }, [activeLink]);

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
    ({item, index}: {item: HeroStripItem; index: number}) => {
      if (index === 0 && item.link === activeLink) {
        return (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surfaceContainerHigh,
              borderRadius: 14,
              padding: 8,
              gap: 10,
              width: 252,
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
        data={ordered}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => `${item.link}-${i}`}
        ItemSeparatorComponent={() => <View style={{width: ITEM_GAP}} />}
        renderItem={renderItem}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={false}
      />
    </View>
  );
};

export default React.memo(HeroStrip);
