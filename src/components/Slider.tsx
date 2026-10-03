import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import {FlatList} from 'react-native-gesture-handler';
import React, {memo, useCallback, useRef} from 'react';
import type {Post} from '../lib/providers/types';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {HomeStackParamList} from '../App';
import {useFocusEffect} from '@react-navigation/native';
import useContentStore from '../lib/zustand/contentStore';
import SkeletonLoader from './Skeleton';
import MediaPosterCard from './MediaPosterCard';
import {useM3Colors} from '../theme/M3PaletteContext';
import {getPostBadge, getSeasonBadge} from '../lib/utils/helpers';

import AppText from './ui/Text';

const Slider = ({
  isLoading,
  title,
  posts,
  filter,
  providerValue,
  isSearch = false,
  error,
}: {
  isLoading: boolean;
  title: string;
  posts: Post[];
  filter: string;
  providerValue?: string;
  isSearch?: boolean;
  error?: string;
}): React.ReactElement => {
  const provider = useContentStore(state => state.provider);
  const colors = useM3Colors();
  const {width: screenWidth} = useWindowDimensions();
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [isSelected, setSelected] = React.useState('');
  const ITEM_WIDTH = 124;
  const ITEM_GAP = 14;
  const contentWidth = posts.length * ITEM_WIDTH + (posts.length - 1) * ITEM_GAP + 40;
  const canScroll = contentWidth > screenWidth;

  const handleMorePress = useCallback(() => {
    navigation.navigate('ScrollList', {
      title: title,
      filter: filter,
      providerValue: providerValue,
      isSearch: isSearch,
    });
  }, [navigation, title, filter, providerValue, isSearch]);

  const handleItemPress = useCallback(
    (item: Post) => {
      setSelected('');
      navigation.navigate('Info', {
        link: item.link,
        provider: item.provider || providerValue || provider?.value,
        poster: item?.image,
      });
    },
    [navigation, providerValue, provider?.value],
  );

  // === TV D-pad support ===
  const listRef = useRef<any>(null);
  const lastFocusIndexRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const itemStride = ITEM_WIDTH + ITEM_GAP;
  const isTv = Platform.isTV;
  const {width: viewportWidth} = useWindowDimensions();

  // Row-to-row focus memory: remember which card the D-pad left off at so
  // moving down a row and back up lands on the same poster.
  useFocusEffect(
    useCallback(() => {
      return () => {
        lastFocusIndexRef.current = 0;
      }; // reset when the whole Home screen loses focus
    }, []),
  );

  const handleCardTvFocus = useCallback(
    (index: number) => {
      lastFocusIndexRef.current = index;
      // Follow-focus: keep the focused poster comfortably on screen.
      const currentOffset = currentOffsetRef.current;
      const itemLeft = index * itemStride;
      const itemRight = itemLeft + ITEM_WIDTH;
      const margin = ITEM_WIDTH;
      if (itemLeft < currentOffset + margin) {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, itemLeft - margin),
          animated: true,
        });
      } else if (itemRight > currentOffset + viewportWidth - margin) {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, itemRight - viewportWidth + margin),
          animated: true,
        });
      }
    },
    [itemStride, viewportWidth],
  );

  const renderItem = useCallback(
    ({item, index}: {item: Post; index: number}) => (
      <MediaPosterCard
        title={item.title}
        poster={item.image}
        width={124}
        badge={getPostBadge(item)}
        seasonBadge={getSeasonBadge(item)}
        durationBadge={item.duration}
        onPress={() => handleItemPress(item)}
        onTvFocus={isTv ? () => handleCardTvFocus(index) : undefined}
        hasTVPreferredFocus={isTv && index === lastFocusIndexRef.current}
      />
    ),
    [handleItemPress, isTv, handleCardTvFocus],
  );

  const keyExtractor = useCallback((item: Post) => item.link, []);

  return (
    <Pressable onPress={() => setSelected('')} style={{gap: 10, marginTop: 20}}>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
        }}>
        <View style={{alignItems: 'center', flexDirection: 'row', flex: 1, gap: 8, minWidth: 0, marginRight: 12}}>
          <View
            style={{
              backgroundColor: colors.primary,
              borderRadius: 2,
              height: 18,
              width: 3,
            }}
          />
          <AppText
            numberOfLines={1}
            role="titleMediumEmphasized"
            style={{
              color: colors.onBackground,
              flex: 1,
              minWidth: 0,
            }}>
            {title}
          </AppText>
        </View>
        {filter !== 'recent' && (
          <Pressable
            accessibilityRole="button"
            onPress={handleMorePress}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            style={({pressed}) => ({
              alignItems: 'center',
              flexDirection: 'row',
              flexShrink: 0,
              gap: 2,
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: 4,
              paddingVertical: 8,
            })}>
            <AppText
              numberOfLines={1}
              style={{color: colors.primary, fontSize: 14, fontWeight: '700'}}>
              All
            </AppText>
            <MaterialCommunityIcons
              name="chevron-right"
              color={colors.primary}
              size={16}
              style={{height: 16, width: 16}}
            />
          </Pressable>
        )}
      </View>
      {isLoading ? (
        <View className="flex flex-row gap-2 overflow-hidden">
          {/* 20 placeholders per row x ~16 loading rows x 2 loaders each was
              ~640 shimmer components (1280 extra native views + 640 running
              animations) mounted on the loading frame. The strip is clipped
              by `overflow-hidden` anyway, so 8 fills the viewport and stops
              there. */}
          {Array.from({length: 8}).map((_, index) => (
            <View
              className="gap-2 flex mb-3 justify-center"
              style={{marginLeft: index === 0 ? 18 : 0, marginRight: 12}}
              key={index}>
              <SkeletonLoader height={186} width={124} />
              <SkeletonLoader height={14} width={110} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={posts}
          horizontal
          scrollEnabled={canScroll}
          bounces={false}
          overScrollMode="never"
          nestedScrollEnabled={true}
          contentContainerStyle={{
            paddingBottom: 4,
            paddingHorizontal: 20,
          }}
          ItemSeparatorComponent={() => <View style={{width: ITEM_GAP}} />}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onScroll={
            isTv
              ? (e: any) => {
                  currentOffsetRef.current =
                    e?.nativeEvent?.contentOffset?.x ?? 0;
                }
              : undefined
          }
          scrollEventThrottle={isTv ? 100 : undefined}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={6}
          removeClippedSubviews={true}
          getItemLayout={(_, index) => ({length: ITEM_WIDTH + ITEM_GAP, offset: (ITEM_WIDTH + ITEM_GAP) * index, index})}
          ListFooterComponent={
            !isLoading && error ? (
              <View className="flex flex-row w-96 justify-center h-10 items-center">
                <AppText
                  role="bodyMedium"
                  className="text-center text-m3-error">
                  {error}
                </AppText>
              </View>
            ) : !isLoading && posts.length === 0 ? (
              <View className="flex flex-row w-96 justify-center h-10 items-center">
                <AppText
                  role="bodyMedium"
                  className="text-center text-m3-on-surface-variant">
                  No content found
                </AppText>
              </View>
            ) : null
          }
        />
      )}
    </Pressable>
  );
};

export default memo(Slider);
