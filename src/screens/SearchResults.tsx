import {SafeAreaView, View, FlatList, Dimensions} from 'react-native';
import MediaPosterCard from '../components/MediaPosterCard';
import React, {useEffect, useState, useRef, useCallback, useMemo} from 'react';
import {NativeStackScreenProps, NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SearchStackParamList, HomeStackParamList} from '../App';
import {providerManager} from '../lib/services/ProviderManager';
import useContentStore from '../lib/zustand/contentStore';
import AppText from '../components/ui/Text';
import LoadingIndicator from '../components/ui/LoadingIndicator';
import {useM3Colors} from '../theme/M3PaletteContext';
import {useNavigation} from '@react-navigation/native';
import {getPostBadge} from '../lib/utils/helpers';
import {Post} from '../lib/providers/types';

type Props = NativeStackScreenProps<SearchStackParamList, 'SearchResults'>;

const SearchResults = ({route}: Props): React.ReactElement => {
  const colors = useM3Colors();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const installedProviders = useContentStore(state => state.installedProviders);
  const provider = useContentStore(state => state.provider);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const abortController = useRef<AbortController | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - 48) / 3;

  useEffect(() => {
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();
    const signal = abortController.current.signal;
    setAllPosts([]);
    setLoading(true);

    const seen = new Set<string>();
    const results: Post[] = [];

    const fetchAll = async () => {
      const promises = installedProviders.map(async item => {
        try {
          const data = await providerManager.getSearchPosts({
            searchQuery: route.params.filter,
            page: 1,
            providerValue: item.value,
            signal,
          });
          if (signal.aborted) return;
          if (data && data.length > 0) {
            for (const p of data) {
              const key = p.title + '|' + p.link;
              if (!seen.has(key)) {
                seen.add(key);
                results.push({...p, provider: item.value});
              }
            }
          }
        } catch {}
      });
      await Promise.allSettled(promises);
      if (!signal.aborted) {
        setAllPosts(results);
        setLoading(false);
      }
    };

    fetchAll();

    return () => {
      if (abortController.current) {
        abortController.current.abort();
        abortController.current = null;
      }
    };
  }, [route.params.filter, installedProviders]);

  const handleItemPress = useCallback(
    (item: Post) => {
      navigation.navigate('Info', {
        link: item.link,
        provider: item.provider || provider?.value,
        poster: item?.image,
      });
    },
    [navigation, provider?.value],
  );

  const renderItem = useCallback(
    ({item}: {item: Post}) => (
      <MediaPosterCard
        title={item.title}
        poster={item.image}
        width={cardWidth}
        badge={getPostBadge(item)}
        onPress={() => handleItemPress(item)}
      />
    ),
    [handleItemPress, cardWidth],
  );

  const keyExtractor = useCallback((item: Post, index: number) => `${item.link}-${index}`, []);

  return (
    <SafeAreaView className="h-full w-full bg-m3-background">
      <View className="mt-6 px-4 flex flex-row justify-between items-center gap-x-3">
        <AppText
          style={{color: colors.onBackground, flex: 1, fontSize: 18, fontWeight: '600', letterSpacing: 0.15}}>
          {loading ? 'Searching for' : 'Searched for'}{' '}
          <AppText style={{color: colors.primary, fontSize: 18, fontWeight: '600'}}>
            "{route?.params?.filter}"
          </AppText>
        </AppText>
        {!loading && (
          <AppText style={{color: colors.onSurfaceVariant, fontSize: 13}}>
            {allPosts.length} results
          </AppText>
        )}
        {loading && (
          <View className="flex justify-center items-center h-20">
            <LoadingIndicator size={32} />
          </View>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <LoadingIndicator size={40} />
        </View>
      ) : allPosts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText role="bodyLarge" style={{color: colors.onSurfaceVariant}}>
            No content found
          </AppText>
        </View>
      ) : (
        <FlatList
          data={allPosts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={3}
          contentContainerStyle={{paddingHorizontal: 16, paddingTop: 12, paddingBottom: 64}}
          columnWrapperStyle={{gap: 12, marginBottom: 12}}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={18}
          updateCellsBatchingPeriod={50}
          windowSize={10}
          initialNumToRender={18}
        />
      )}
    </SafeAreaView>
  );
};

export default SearchResults;
