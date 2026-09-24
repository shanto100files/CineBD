import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {Pressable, useWindowDimensions, View} from 'react-native';
import {FlatList} from 'react-native-gesture-handler';
import React, {memo, useCallback} from 'react';
import type {Post} from '../lib/providers/types';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {HomeStackParamList} from '../App';
import useContentStore from '../lib/zustand/contentStore';
import SkeletonLoader from './Skeleton';
import MediaPosterCard from './MediaPosterCard';
import {useM3Colors} from '../theme/M3PaletteContext';
import {getPostBadge, getSeasonBadge, getProviderBadge} from '../lib/utils/helpers';

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

  const renderItem = useCallback(
    ({item}: {item: Post}) => (
      <MediaPosterCard
        title={item.title}
        poster={item.image}
        width={124}
        badge={getPostBadge(item)}
        seasonBadge={getSeasonBadge(item)}
        providerBadge={getProviderBadge(item)}
        onPress={() => handleItemPress(item)}
      />
    ),
    [handleItemPress],
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
            style={{
              color: colors.onBackground,
              flex: 1,
              fontSize: 16.5,
              fontWeight: '700',
              letterSpacing: 0.2,
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
          {Array.from({length: 20}).map((_, index) => (
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
          showsHorizontalScrollIndicator={false}
          data={posts}
          horizontal
          scrollEnabled={canScroll}
          bounces={false}
          overScrollMode="never"
          nestedScrollEnabled={true}
          panGestureHandlerProps={{
            activeOffsetX: [-15, 15],
            failOffsetY: [-10, 10],
          }}
          contentContainerStyle={{
            paddingBottom: 4,
            paddingHorizontal: 20,
          }}
          ItemSeparatorComponent={() => <View style={{width: ITEM_GAP}} />}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={8}
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
