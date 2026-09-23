import {SafeAreaView, View, ScrollView, Dimensions, Pressable} from 'react-native';
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
import {getPostBadge, getSeasonBadge, getProviderBadge} from '../lib/utils/helpers';
import {getUniqueSeasons} from '../lib/utils/titleMetadata';
import {Post} from '../lib/providers/types';
import {MMKV} from '../lib/Mmkv';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import FilterChipRow from '../components/ui/FilterChipRow';
import {useIsOffline} from '../lib/netStatus';
import OfflineFriendlyState from '../components/OfflineFriendlyState';
import {
  extractTitleMeta,
  getUniqueValues,
  getUniqueYears,
  sortPosts,
  type SortMode,
} from '../lib/utils/titleMetadata';

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
  const isOffline = useIsOffline();
  const [searchEpoch, setSearchEpoch] = useState(0);
  const [selProvider, setSelProvider] = useState<string>('all');
  const [selQuality, setSelQuality] = useState<Set<string>>(new Set());
  const [selLanguage, setSelLanguage] = useState<Set<string>>(new Set());
  const [selYear, setSelYear] = useState<Set<string>>(new Set());
  const [selSeason, setSelSeason] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [showFilters, setShowFilters] = useState(true);
  const [deepPages, setDeepPages] = useState<Record<string, number>>({});
  const [deepLoading, setDeepLoading] = useState(false);
  const abortController = useRef<AbortController | null>(null);
  const resultsRef = useRef<Post[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - 56) / 3;
  const query = route.params.filter;

  const baseFiltered = useMemo(
    () => filterPosts(allPosts, query),
    [allPosts, query],
  );

  // ---- provider chips data ----
  const providerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of baseFiltered) {
      const key = p.provider || 'unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [baseFiltered]);

  // ---- title-derived filters ----
  const availQuality = useMemo(
    () => getUniqueValues(baseFiltered, 'quality'),
    [baseFiltered],
  );
  const availLanguage = useMemo(
    () => getUniqueValues(baseFiltered, 'language'),
    [baseFiltered],
  );
  const availYears = useMemo(() => getUniqueYears(baseFiltered), [baseFiltered]);
  const availSeasons = useMemo(() => getUniqueSeasons(baseFiltered), [baseFiltered]);

  const filteredPosts = useMemo(() => {
    let out = baseFiltered;
    if (selProvider !== 'all') {
      out = out.filter(p => (p.provider || 'unknown') === selProvider);
    }
    if (selQuality.size) {
      out = out.filter(p => extractTitleMeta(p).quality.some(q => selQuality.has(q)));
    }
    if (selLanguage.size) {
      out = out.filter(p => extractTitleMeta(p).language.some(l => selLanguage.has(l)));
    }
    if (selYear.size) {
      out = out.filter(p => {
        const y = extractTitleMeta(p).year;
        return y ? selYear.has(y) : false;
      });
    }
    if (selSeason.size) {
      out = out.filter(p => getUniqueSeasons([p]).some(s => selSeason.has(s)));
    }
    return sortPosts(out, sortMode);
  }, [
    baseFiltered,
    selProvider,
    selQuality,
    selLanguage,
    selYear,
    selSeason,
    sortMode,
  ]);

  const hasActiveFilters =
    selProvider !== 'all' ||
    selQuality.size > 0 ||
    selLanguage.size > 0 ||
    selYear.size > 0 ||
    selSeason.size > 0;

  const toggleFrom = (
    set: Set<string>,
    setter: (s: Set<string>) => void,
    key: string,
  ) => {
    const next = new Set(set);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setter(next);
  };

  // ---- load one more page from every provider ("show more") ----
  const loadDeeper = useCallback(async () => {
    if (deepLoading) return;
    setDeepLoading(true);
    const nextPageBy = new Map<string, number>();
    const jobs: Array<Promise<void>> = [];
    for (const prov of installedProviders) {
      const done = deepPages[prov.value] || 1;
      const nextPage = done + 1;
      nextPageBy.set(prov.value, done);
      jobs.push(
        (async () => {
          try {
            const data = await providerManager.getSearchPosts({
              searchQuery: query,
              page: nextPage,
              providerValue: prov.value,
              signal: abortController.current?.signal ?? new AbortController().signal,
            });
            if (data && data.length > 0) {
              const tagged = data.map(p => ({...p, provider: prov.value}));
              const add = (posts: Post[]) => {
                for (const p of posts) {
                  const key = p.title + '|' + p.link;
                  if (!seenRef.current.has(key)) {
                    seenRef.current.add(key);
                    resultsRef.current.push(p);
                  }
                }
              };
              add(tagged);
              setAllPosts([...resultsRef.current]);
            }
          } catch {}
        })(),
      );
    }
    await Promise.allSettled(jobs);
    setDeepPages(prev => {
      const next = {...prev};
      for (const [k, v] of nextPageBy) {
        next[k] = (next[k] || 1) + 1;
      }
      return next;
    });
    setDeepLoading(false);
  }, [deepLoading, deepPages, installedProviders, query]);

  const clearAllFilters = () => {
    setSelProvider('all');
    setSelQuality(new Set());
    setSelLanguage(new Set());
    setSelYear(new Set());
    setSelSeason(new Set());
    setSortMode('relevance');
  };

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
  }, [route.params.filter, installedProviders, searchEpoch]);

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
          seasonBadge={getSeasonBadge(item)}
          providerBadge={getProviderBadge(item)}
          onPress={() => handleItemPress(item)}
        />
      ))}
    </View>
  );

  const renderFilterHeader = () =>
    showFilters ? (
      <View>
        {providerCounts.size > 1 ? (
          <FilterChipRow
            chips={[
              {key: 'all', label: 'All', count: baseFiltered.length},
              ...Array.from(providerCounts.entries()).map(([k, v]) => ({
                key: k,
                label: getProviderBadge({provider: k} as Post) || k,
                count: v,
              })),
            ]}
            selected={selProvider}
            onToggle={k => setSelProvider(k)}
            variant="sort"
          />
        ) : null}
        <FilterChipRow
          variant="sort"
          chips={[
            {key: 'relevance', label: 'Best match'},
            {key: 'year', label: 'Year'},
            {key: 'title', label: 'A-Z'},
            {key: 'quality', label: 'Quality'},
          ]}
          selected={sortMode}
          onToggle={k => setSortMode(k as SortMode)}
        />
        {availSeasons.length > 0 ? (
          <FilterChipRow
            chips={availSeasons.map(s => ({key: s, label: s}))}
            selected={selSeason}
            onToggle={k => toggleFrom(selSeason, setSelSeason, k)}
          />
        ) : null}
        {availQuality.length > 0 ? (
          <FilterChipRow
            chips={availQuality.map(q => ({key: q, label: q}))}
            selected={selQuality}
            onToggle={k => toggleFrom(selQuality, setSelQuality, k)}
          />
        ) : null}
        {availLanguage.length > 0 ? (
          <FilterChipRow
            chips={availLanguage.map(l => ({key: l, label: l}))}
            selected={selLanguage}
            onToggle={k => toggleFrom(selLanguage, setSelLanguage, k)}
          />
        ) : null}
        {availYears.length > 0 ? (
          <FilterChipRow
            chips={availYears.slice(0, 12).map(y => ({key: y, label: y}))}
            selected={selYear}
            onToggle={k => toggleFrom(selYear, setSelYear, k)}
          />
        ) : null}
        {hasActiveFilters ? (
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              paddingHorizontal: 16,
              paddingVertical: 4,
            }}>
            <AppText style={{color: colors.onSurfaceVariant, flex: 1, fontSize: 12}}>
              Showing {filteredPosts.length} of {baseFiltered.length}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              onPress={clearAllFilters}
              style={{paddingHorizontal: 8, paddingVertical: 4}}>
              <AppText style={{color: colors.primary, fontSize: 12, fontWeight: '700'}}>
                Clear all
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
    ) : null;

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showFilters ? 'Hide filters' : 'Show filters'}
              onPress={() => setShowFilters(v => !v)}
              style={{alignItems: 'center', flexDirection: 'row', gap: 2}}>
              <AppText style={{color: colors.onSurfaceVariant, fontSize: 13}}>
                {showFilters ? 'Hide filters' : 'Filters'}
              </AppText>
              <MaterialCommunityIcons
                name={showFilters ? 'chevron-up' : 'tune'}
                size={14}
                color={colors.onSurfaceVariant}
              />
            </Pressable>
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
          {baseFiltered.length > 0 ? renderFilterHeader() : null}
          {renderGrid(filteredPosts)}
        </ScrollView>
      ) : totalVisible === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <OfflineFriendlyState onRetry={() => setSearchEpoch(e => e + 1)} />
          {!isOffline ? (
            <AppText role="bodyLarge" style={{color: colors.onSurfaceVariant}}>
              No content found
            </AppText>
          ) : null}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8, paddingBottom: 64}}
          showsVerticalScrollIndicator={false}>
          {baseFiltered.length > 0 ? renderFilterHeader() : null}
          {renderGrid(filteredPosts)}
          {!loading && filteredPosts.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load more results from all providers"
              onPress={loadDeeper}
              disabled={deepLoading}
              style={{
                alignSelf: 'center',
                marginTop: 16,
                paddingHorizontal: 24,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: colors.surfaceContainerHighest,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}>
              {deepLoading ? (
                <LoadingIndicator size={16} />
              ) : (
                <MaterialCommunityIcons
                  name="plus-circle-outline"
                  size={16}
                  color={colors.onSurfaceVariant}
                />
              )}
              <AppText style={{color: colors.onSurfaceVariant, fontWeight: '600', fontSize: 13}}>
                {deepLoading ? 'Loading...' : 'Load more from providers'}
              </AppText>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default SearchResults;
