import {View, TouchableOpacity, Pressable, useWindowDimensions} from 'react-native';
import React, {useEffect, useState, useRef, useMemo} from 'react';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {HomeStackParamList, SearchStackParamList} from '../App';
import {Post} from '../lib/providers/types';
import {Image} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import useContentStore from '../lib/zustand/contentStore';
import {settingsStorage} from '../lib/storage';
import {FlashList} from '@shopify/flash-list';
import SkeletonLoader from '../components/Skeleton';
import {MediaImage} from '../components/ui/MediaFallback';
import FilterChipRow from '../components/ui/FilterChipRow';
import {
  extractTitleMeta,
  getUniqueSeasons,
  getUniqueValues,
  getUniqueYears,
  sortPosts,
  type SortMode,
} from '../lib/utils/titleMetadata';
import {providerManager} from '../lib/services/ProviderManager';
import IconButton from '../components/ui/IconButton';
import AppText from '../components/ui/Text';
import {getPostBadge, getSeasonBadge} from '../lib/utils/helpers';
import {useIsOffline} from '../lib/netStatus';
import OfflineFriendlyState from '../components/OfflineFriendlyState';

type Props = NativeStackScreenProps<HomeStackParamList, 'ScrollList'>;

type ListItem = Post | {id: string; isSkeleton: true};

const GRID_POSTER_WIDTH = 100;
const GRID_POSTER_HEIGHT = 150;
const LIST_POSTER_WIDTH = 70;
const LIST_POSTER_HEIGHT = 100;
// Screen container uses p-4 and each grid cell uses m-3 on both sides.
const GRID_SCREEN_PADDING = 16;
const GRID_ITEM_MARGIN = 12;
const GRID_POSTER_ASPECT_RATIO = GRID_POSTER_HEIGHT / GRID_POSTER_WIDTH;

const ScrollList = ({route}: Props): React.ReactElement => {
  const {width: windowWidth} = useWindowDimensions();
  const navigation =
    useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
  const [posts, setPosts] = useState<Post[]>([]);
  const isOffline = useIsOffline();
  const [reloadKey, setReloadKey] = useState(0);
  const {filter, providerValue} = route.params;
  const [page, setPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEnd, setIsEnd] = useState<boolean>(false);
  const provider = useContentStore(state => state.provider);
  const [viewType, setViewType] = useState<number>(
    settingsStorage.getListViewType(),
  );

  // ---- client-side filters (title-derived metadata) ----
  const [selQuality, setSelQuality] = useState<Set<string>>(new Set());
  const [selLanguage, setSelLanguage] = useState<Set<string>>(new Set());
  const [selYear, setSelYear] = useState<Set<string>>(new Set());
  const [selSeason, setSelSeason] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [showFilters, setShowFilters] = useState(true);

  const availQuality = useMemo(() => getUniqueValues(posts, 'quality'), [posts]);
  const availLanguage = useMemo(
    () => getUniqueValues(posts, 'language'),
    [posts],
  );
  const availYears = useMemo(() => getUniqueYears(posts), [posts]);
  const availSeasons = useMemo(() => getUniqueSeasons(posts), [posts]);

  const filteredPosts = useMemo(() => {
    let out = posts;
    if (selQuality.size) {
      out = out.filter(
        p => extractTitleMeta(p).quality.some(q => selQuality.has(q)),
      );
    }
    if (selLanguage.size) {
      out = out.filter(
        p => extractTitleMeta(p).language.some(l => selLanguage.has(l)),
      );
    }
    if (selYear.size) {
      out = out.filter(p => {
        const y = extractTitleMeta(p).year;
        return y ? selYear.has(y) : false;
      });
    }
    if (selSeason.size) {
      out = out.filter(p =>
        getUniqueSeasons([p]).some(s => selSeason.has(s)),
      );
    }
    return sortPosts(out, sortMode);
  }, [
    posts,
    selQuality,
    selLanguage,
    selYear,
    selSeason,
    sortMode,
  ]);

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

  const hasActiveFilters =
    selQuality.size > 0 ||
    selLanguage.size > 0 ||
    selYear.size > 0 ||
    selSeason.size > 0;

  // Derive the grid from the available width instead of hardcoding 3 columns.
  // With a fixed column count, wide screens stretch each cell far past the
  // poster width, which is what produced the large gaps between posters.
  const gridAvailableWidth = windowWidth - GRID_SCREEN_PADDING * 2;
  const gridColumns = Math.max(
    3,
    Math.floor(gridAvailableWidth / (GRID_POSTER_WIDTH + GRID_ITEM_MARGIN * 2)),
  );
  const gridPosterWidth =
    gridAvailableWidth / gridColumns - GRID_ITEM_MARGIN * 2;
  const gridPosterHeight = gridPosterWidth * GRID_POSTER_ASPECT_RATIO;
  const numColumns = viewType === 1 ? gridColumns : 1;

  // Add abort controller to cancel API requests when unmounting
  const abortController = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  const isLoadingMore = useRef(false);

  // Set up cleanup effect that runs on component unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    // Clean up the previous controller if it exists
    if (abortController.current) {
      abortController.current.abort();
    }

    // Create a new controller for this effect
    abortController.current = new AbortController();
    const signal = abortController.current.signal;

    const fetchPosts = async () => {
      // Don't fetch if we're already at the end
      if (isEnd) return;

      try {
        // Prevent concurrent loading calls
        if (isLoadingMore.current) return;
        isLoadingMore.current = true;

        setIsLoading(true);

        // Skip if component unmounted or request was aborted
        if (!isMounted.current || signal.aborted) return;

        const getNewPosts = route.params.isSearch
          ? providerManager.getSearchPosts({
              searchQuery: filter,
              page,
              providerValue: providerValue || provider.value,
              signal,
            })
          : providerManager.getPosts({
              filter,
              page,
              providerValue: providerValue || provider.value,
              signal,
            });

        const newPosts = await getNewPosts;

        // Skip if component unmounted or request was aborted
        if (!isMounted.current || signal.aborted) return;

        if (!newPosts || newPosts.length === 0) {
          console.log('end', page);
          setIsEnd(true);
          setIsLoading(false);
          isLoadingMore.current = false;
          return;
        }

        // Upstream providers sometimes repeat the same items on every page.
        // Only append genuinely new links, and stop paginating when a page
        // brings nothing new — otherwise the "All" grid fills with duplicates.
        const seen = new Set(posts.map(p => p.link));
        const fresh = newPosts.filter(p => p?.link && !seen.has(p.link));
        if (fresh.length === 0) {
          setIsEnd(true);
        } else {
          setPosts(prev => [...prev, ...fresh]);
        }
      } catch (error) {
        // Skip handling if component unmounted or request was aborted
        if (!isMounted.current || (error as any)?.name === 'AbortError') return;
        console.error('Error fetching posts:', error);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
          isLoadingMore.current = false;
        }
      }
    };

    fetchPosts();
  }, [page, route.params, filter, provider.value, reloadKey]);

  const onEndReached = async () => {
    // Don't trigger more loading if we're already loading or at the end
    if (isLoading || isEnd || isLoadingMore.current) {
      return;
    }
    setIsLoading(true);
    setPage(prevPage => prevPage + 1);
  };

  const skeletons: ListItem[] = Array.from({
    length: viewType === 1 ? gridColumns * 3 : 6,
  }).map((_, i) => ({id: `skeleton-${i}`, isSkeleton: true}));
  const shownPosts = hasActiveFilters || sortMode !== 'relevance' ? filteredPosts : posts;
  const listData: ListItem[] =
    posts.length === 0 && isLoading ? skeletons : shownPosts;

  const renderSkeletonItem = () => (
    <View
      className={
        viewType === 1
          ? 'flex flex-col m-3 items-center'
          : 'flex-row m-3 items-center'
      }>
      <SkeletonLoader
        height={viewType === 1 ? gridPosterHeight : LIST_POSTER_HEIGHT}
        width={viewType === 1 ? gridPosterWidth : LIST_POSTER_WIDTH}
        marginVertical={0}
      />
      <SkeletonLoader
        height={viewType === 1 ? 12 : 18}
        width={viewType === 1 ? gridPosterWidth : '65%'}
        marginVertical={viewType === 1 ? 8 : 0}
        style={viewType === 1 ? undefined : {marginLeft: 12}}
      />
    </View>
  );

  // The footer sits outside the grid, so it is not laid out into columns.
  // Render a full row of placeholders instead of a single stray one.
  const renderLoadingMoreSkeletons = () => (
    <View className={viewType === 1 ? 'flex-row flex-wrap' : ''}>
      {Array.from({length: viewType === 1 ? gridColumns : 2}).map((_, i) => (
        <View key={`footer-skeleton-${i}`}>{renderSkeletonItem()}</View>
      ))}
    </View>
  );

    const renderFilterHeader = () => (
      <View>
        <FilterChipRow
          variant="sort"
          chips={[
            {key: 'relevance', label: 'Latest'},
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
        <FilterChipRow
          chips={availQuality.map(q => ({key: q, label: q}))}
          selected={selQuality}
          onToggle={k => toggleFrom(selQuality, setSelQuality, k)}
        />
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
            <AppText style={{color: '#A3A3A3', flex: 1, fontSize: 12}}>
              Showing {shownPosts.length} of {posts.length}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              onPress={() => {
                setSelQuality(new Set());
                setSelLanguage(new Set());
                setSelYear(new Set());
                setSelSeason(new Set());
              }}
              style={{paddingHorizontal: 8, paddingVertical: 4}}>
              <AppText style={{color: '#E50914', fontSize: 12, fontWeight: '700'}}>
                Clear all
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
    );

  return (
    <View className="h-full w-full bg-m3-background p-4">
      <View className="w-full px-4 font-semibold my-6 flex-row justify-between items-center">
        <AppText
          role="headlineLargeEmphasized"
          className="flex-1 text-m3-on-background">
          {route.params.title}
        </AppText>
        <IconButton
          icon={viewType === 1 ? 'view-grid-outline' : 'view-list-outline'}
          label={viewType === 1 ? 'Switch to list view' : 'Switch to grid view'}
          onPress={() => {
            const newViewType = viewType === 1 ? 2 : 1;
            setViewType(newViewType);
            settingsStorage.setListViewType(newViewType);
          }}
        />
        <IconButton
          icon="tune"
          label={showFilters ? 'Hide filters' : 'Show filters'}
          onPress={() => setShowFilters(v => !v)}
        />
      </View>
      <View className="flex-1 w-full">
        <FlashList
          ListHeaderComponent={posts.length > 0 ? renderFilterHeader : null}
          ListFooterComponent={
            <View className={posts.length > 0 && isLoading ? 'mb-16' : ''}>
              {posts.length > 0 && isLoading
                ? renderLoadingMoreSkeletons()
                : null}
              <View className="h-32" />
            </View>
          }
          data={listData}
          numColumns={numColumns}
          key={`view-type-${viewType}-${numColumns}`}
          contentContainerStyle={{paddingBottom: 80}}
          keyExtractor={(item, i) =>
            'isSkeleton' in item ? item.id : `${item.title}-${i}`
          }
          renderItem={({item}) => {
            if ('isSkeleton' in item) {
              return renderSkeletonItem();
            }

            const badge = getPostBadge(item);
            const seasonBadge = getSeasonBadge(item);

            return (
              <TouchableOpacity
                className={
                  viewType === 1
                    ? 'flex flex-col m-3 items-center'
                    : 'flex-row m-3 items-center'
                }
                onPress={() =>
                  navigation.navigate('Info', {
                    link: item.link,
                    provider: route.params.providerValue || provider.value,
                    poster: item?.image,
                  })
                }>
                <View style={{position: 'relative'}}>
                  <MediaImage
                    className="rounded-md"
                    uri={item.image}
                    title={item.title || 'Cinepix'}
                    style={
                      viewType === 1
                        ? {width: gridPosterWidth, height: gridPosterHeight}
                        : {width: LIST_POSTER_WIDTH, height: LIST_POSTER_HEIGHT}
                    }
                  />
                  {badge ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        backgroundColor: badge === '4K' ? '#D4A017' : '#e11d48',
                        borderRadius: badge === '4K' ? 4 : 4,
                        paddingHorizontal: badge === '4K' ? 5 : 6,
                        paddingVertical: 1,
                        zIndex: 10,
                        minWidth: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: badge === '4K' ? '#D4A017' : undefined,
                        shadowOffset: badge === '4K' ? {width: 0, height: 1} : undefined,
                        shadowOpacity: badge === '4K' ? 0.4 : undefined,
                        shadowRadius: badge === '4K' ? 3 : undefined,
                        elevation: badge === '4K' ? 3 : undefined,
                      }}>
                      <AppText
                        style={{
                          color: badge === '4K' ? '#1A1A1A' : '#fff',
                          fontWeight: '900',
                          fontSize: 9,
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
                        top: badge ? 26 : 4,
                        left: 4,
                        backgroundColor: 'rgba(0,0,0,0.75)',
                        borderRadius: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        zIndex: 9,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.25)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <AppText
                        style={{
                          color: '#FFFFFF',
                          fontWeight: '900',
                          fontSize: 9,
                          includeFontPadding: false,
                        }}>
                        {seasonBadge}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <AppText
                  role={viewType === 1 ? 'bodySmall' : 'bodyLargeEmphasized'}
                  numberOfLines={2}
                  style={viewType === 1 ? {width: gridPosterWidth} : undefined}
                  className={
                    viewType === 1
                      ? 'text-m3-on-surface text-center'
                      : 'ml-3 w-72 text-m3-on-surface'
                  }>
                  {item.title}
                </AppText>
              </TouchableOpacity>
            );
          }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
        />
        {!isLoading && posts.length === 0 ? (
          <View className="w-full h-full flex items-center justify-center">
            <OfflineFriendlyState onRetry={() => setReloadKey(k => k + 1)} />
            {!isOffline ? (
              <AppText
                role="titleLargeEmphasized"
                className="text-center text-m3-on-surface-variant">
                No Content Found
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default ScrollList;
