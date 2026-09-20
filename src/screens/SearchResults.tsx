import {SafeAreaView, View, ScrollView, Dimensions} from 'react-native';
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
import {getPostBadge, getProviderBadge} from '../lib/utils/helpers';
import {Post} from '../lib/providers/types';
import {MMKV} from '../lib/Mmkv';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type Props = NativeStackScreenProps<SearchStackParamList, 'SearchResults'>;

const CACHE_KEY_PREFIX = 'search_cache_';
const CACHE_TTL = 5 * 60 * 1000;
const CONCURRENCY = 2;

function getCachedResults(query: string): Post[] | null {
  try {
    const key = CACHE_KEY_PREFIX + query.toLowerCase().trim();
    const raw = MMKV.getString(key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.time > CACHE_TTL) {
      MMKV.delete(key);
      return null;
    }
    return cached.posts;
  } catch {
    return null;
  }
}

function setCachedResults(query: string, posts: Post[]): void {
  try {
    const key = CACHE_KEY_PREFIX + query.toLowerCase().trim();
    MMKV.set(key, JSON.stringify({posts, time: Date.now()}));
  } catch {}
}

async function fetchInstantResults(query: string, signal: AbortSignal): Promise<Post[]> {
  try {
    const url = 'https://cinepix.top/api/app/mn-search?q=' + encodeURIComponent(query);
    const res = await fetch(url, {signal});
    const data = await res.json();
    if (data.posts && Array.isArray(data.posts)) {
      return data.posts.map((p: any) => ({
        title: p.title || '',
        image: p.image || '',
        link: p.link || '',
        type: p.type || 'movie',
        provider: 'movienest',
      }));
    }
  } catch {}
  return [];
}

async function searchProvidersConcurrently(
  providers: any[],
  query: string,
  signal: AbortSignal,
  onBatch: (posts: Post[]) => void,
  concurrency: number,
): Promise<void> {
  let index = 0;

  async function runWorker() {
    while (index < providers.length && !signal.aborted) {
      const i = index++;
      const item = providers[i];
      try {
        const data = await providerManager.getSearchPosts({
          searchQuery: query,
          page: 1,
          providerValue: item.value,
          signal,
        });
        if (signal.aborted) return;
        if (data && data.length > 0) {
          onBatch(data.map(p => ({...p, provider: item.value})));
        }
      } catch {}
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, providers.length); i++) {
    workers.push(runWorker());
  }
  await Promise.allSettled(workers);
}

const NSFW_REGEX = /\b(porn|xxx|sex|nude|naked|erotic|adult|18\+|uncensored|hentai|leaked|mms|scandal|bf|gf|hot|sexy|desi\s*mms|dirty|lust|seduce|stepmom|stepsis|massage|creampie|blowjob|handjob|gangbang|threesome|milf|camgirl|onlyfans|playboy|penthouse)\b/i;

function filterPosts(posts: Post[], query: string): Post[] {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  return posts.filter(p => {
    if (!q) return true;
    const title = (p.title || '').toLowerCase();
    const fullMatch = title.includes(q);
    if (fullMatch) return true;
    const wordMatches = words.filter(w => w.length > 2 && title.includes(w)).length;
    return wordMatches >= Math.ceil(words.length * 0.6);
  });
}

const SearchResults = ({route}: Props): React.ReactElement => {
  const colors = useM3Colors();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const installedProviders = useContentStore(state => state.installedProviders);
  const provider = useContentStore(state => state.provider);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const abortController = useRef<AbortController | null>(null);
  const resultsRef = useRef<Post[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - 56) / 3;
  const query = route.params.filter;

  const filteredPosts = useMemo(
    () => filterPosts(allPosts, query),
    [allPosts, query],
  );

  useEffect(() => {
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();
    const signal = abortController.current.signal;

    resultsRef.current = [];
    seenRef.current = new Set();

    const addUnique = (posts: Post[]) => {
      let added = false;
      for (const p of posts) {
        const key = p.title + '|' + p.link;
        if (!seenRef.current.has(key)) {
          seenRef.current.add(key);
          resultsRef.current.push(p);
          added = true;
        }
      }
      return added;
    };

    const run = async () => {
      const cached = getCachedResults(query);
      if (cached && cached.length > 0) {
        resultsRef.current = [...cached];
        seenRef.current = new Set(cached.map(p => p.title + '|' + p.link));
        setAllPosts(cached);
        setLoading(false);
        return;
      }

      setLoading(true);

      const instantResults = await fetchInstantResults(query, signal);
      if (signal.aborted) return;
      if (instantResults.length > 0) {
        addUnique(instantResults);
        setAllPosts([...resultsRef.current]);
      }

      let updateTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingUpdate = false;

      const flushUpdate = () => {
        updateTimer = null;
        if (!signal.aborted && resultsRef.current.length > 0) {
          setAllPosts([...resultsRef.current]);
        }
      };

      const throttledUpdate = () => {
        if (updateTimer) {
          pendingUpdate = true;
          return;
        }
        flushUpdate();
        updateTimer = setTimeout(() => {
          updateTimer = null;
          if (pendingUpdate) {
            pendingUpdate = false;
            flushUpdate();
          }
        }, 300);
      };

      await searchProvidersConcurrently(
        installedProviders,
        query,
        signal,
        (batch) => {
          if (addUnique(batch)) {
            throttledUpdate();
          }
        },
        CONCURRENCY,
      );

      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }
      if (!signal.aborted) {
        setAllPosts([...resultsRef.current]);
        setLoading(false);
        setCachedResults(query, resultsRef.current);
      }
    };

    run();

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

  const keyExtractor = useCallback((item: Post, index: number) => `${item.link}-${index}`, []);

  const totalVisible = filteredPosts.length;

  const renderGrid = (posts: Post[]) => (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}>
      {posts.map((item, index) => (
        <MediaPosterCard
          key={keyExtractor(item, index)}
          title={item.title}
          poster={item.image}
          width={cardWidth}
          badge={getPostBadge(item)}
          providerBadge={getProviderBadge(item)}
          onPress={() => handleItemPress(item)}
        />
      ))}
    </View>
  );

  return (
    <SafeAreaView className="h-full w-full bg-m3-background">
      <View className="mt-6 px-4">
        <View className="flex flex-row justify-between items-center gap-x-3 mb-2">
          <AppText
            style={{color: colors.onBackground, flex: 1, fontSize: 18, fontWeight: '600', letterSpacing: 0.15}}>
            {loading ? 'Searching for' : 'Searched for'}{' '}
            <AppText style={{color: colors.primary, fontSize: 18, fontWeight: '600'}}>
              "{route?.params?.filter}"
            </AppText>
          </AppText>
          {!loading && (
            <AppText style={{color: colors.onSurfaceVariant, fontSize: 13}}>
              {totalVisible} results
            </AppText>
          )}
        </View>
      </View>

      {loading && allPosts.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <LoadingIndicator size={40} />
        </View>
      ) : loading && allPosts.length > 0 ? (
        <ScrollView
          contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8, paddingBottom: 64}}
          showsVerticalScrollIndicator={false}>
          {renderGrid(filteredPosts)}
        </ScrollView>
      ) : totalVisible === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText role="bodyLarge" style={{color: colors.onSurfaceVariant}}>
            No content found
          </AppText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8, paddingBottom: 64}}
          showsVerticalScrollIndicator={false}>
          {renderGrid(filteredPosts)}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default SearchResults;
