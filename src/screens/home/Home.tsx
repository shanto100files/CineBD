import {SafeAreaView, RefreshControl, View, Pressable, InteractionManager, Animated} from 'react-native';
import Slider from '../../components/Slider';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useFocusEffect, useIsFocused} from '@react-navigation/native';
import HeroOptimized from '../../components/Hero';
import HeroStrip, {HeroStripItem} from '../../components/HeroStrip';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {mainStorage, settingsStorage} from '../../lib/storage';
import useContentStore from '../../lib/zustand/contentStore';
import useHeroStore from '../../lib/zustand/herostore';
import {syncFromSharedFolder} from '../../lib/sync/syncService';
import {useAuthStore} from '../../lib/zustand/authStore';
import {
  useHomePageData,
  getRandomHeroPost,
  clearHeroCache,
} from '../../lib/hooks/useHomePageData';
import ProviderDrawer from '../../components/ProviderDrawer';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {HomeStackParamList} from '../../App';
import {Drawer} from 'react-native-drawer-layout';
import {GestureHandlerRootView, ScrollView} from 'react-native-gesture-handler';
import {providerManager} from '../../lib/services/ProviderManager';
import {extensionManager} from '../../lib/services/ExtensionManager';
import {Catalog} from '../../lib/providers/types';
import Tutorial from '../../components/Touturial';
import {QueryErrorBoundary} from '../../components/ErrorBoundary';
import {StatusBar} from 'expo-status-bar';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import ContinueWatching from '../../components/ContinueWatching';
import FriendsActivityRow from '../../components/FriendsActivityRow';
import StatusBarScrim from '../../components/ui/StatusBarScrim';
import {WebView} from 'react-native-webview';
import WelcomePopup from '../../components/WelcomePopup';
import {markHomeReady} from '../../lib/bootSignal';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

const Home = ({navigation}: Props) => {
  const colors = useM3Colors();
  const {isPremium} = useAuthStore();
  // Ad WebViews are expensive on low-RAM phones: unmount them while another
  // screen (e.g. Player) is on top so playback gets the full device resources.
  const isScreenFocused = useIsFocused();
  const [statusBarScrimVisible, setStatusBarScrimVisible] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [homeAds, setHomeAds] = useState<{enabled: boolean; top: string; bottom: string}>({enabled: false, top: '', bottom: ''});

  // Memoize static values
  const disableDrawer = useMemo(
    () => mainStorage.getBool('disableDrawer') || true,
    [],
  );

  const provider = useContentStore(state => state.provider);
  const installedProviders = useContentStore(state => state.installedProviders);
  const adultEnabled = settingsStorage.isAdultEnabled();
  const setHero = useHeroStore(state => state.setHero);
  const hero = useHeroStore(state => state.hero);

  // React Query for home page data with better error handling
  const {
    data: homeData = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useHomePageData({
    provider,
    enabled: !!provider?.value,
  });

  // Memoized scroll handler
  const handleScroll = useCallback((event: any) => {
    setStatusBarScrimVisible(event.nativeEvent.contentOffset.y > 12);
  }, []);

  const handleOpenDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const handleCloseDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const handleDrawerClose = useCallback(() => setIsDrawerOpen(false), []);

  // Stable hero post calculation - uses provider value for caching
  const heroPost = useMemo(() => {
    if (!homeData || homeData.length === 0) {
      return null;
    }
    return getRandomHeroPost(homeData, provider?.value);
  }, [homeData, provider?.value]);

  // Update hero only when hero post actually changes
  React.useEffect(() => {
    if (heroPost) {
      setHero(heroPost);
    } else {
      setHero({link: '', image: '', title: ''});
    }
  }, [heroPost, setHero]);

  // Pool of posters for the MovieBox-style hero overlap strip: deduped,
  // image-carrying posts from every home section (max 12 keeps the strip snappy).
  const heroPool = useMemo<HeroStripItem[]>(() => {
    const seen = new Set<string>();
    const pool: HeroStripItem[] = [];
    for (const section of homeData) {
      for (const post of section.Posts || []) {
        if (!post?.link || !post?.image || seen.has(post.link)) {
          continue;
        }
        seen.add(post.link);
        pool.push({
          link: post.link,
          title: post.title,
          image: post.image,
          provider: post.provider,
        });
        if (pool.length >= 12) {
          return pool;
        }
      }
    }
    return pool;
  }, [homeData]);

  useFocusEffect(
    useCallback(() => {
      syncFromSharedFolder().catch(e =>
        console.warn('[VegaSync] Home focus sync failed:', e),
      );
    }, []),
  );

  // Optimized refresh handler
  const handleRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      // Clear hero cache to get a new random hero on refresh
      clearHeroCache(provider?.value);
      await Promise.allSettled([
        refetch(),
        syncFromSharedFolder().catch(e =>
          console.warn('[VegaSync] Home refresh sync failed:', e),
        ),
      ]);
    } catch (refreshError) {
      console.error('Error refreshing home data:', refreshError);
    } finally {
      setManualRefreshing(false);
    }
  }, [refetch, provider?.value]);

  // Catalog now runs in the provider sandbox, so it resolves asynchronously.
  const [skeletonCatalog, setSkeletonCatalog] = useState<Catalog[]>([]);

  useEffect(() => {
    if (!provider?.value) {
      setSkeletonCatalog([]);
      return;
    }
    let cancelled = false;
    providerManager
      .getCatalog({providerValue: provider.value})
      .then(catalog => {
        if (!cancelled) {
          setSkeletonCatalog(catalog);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSkeletonCatalog([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [provider?.value]);

  // Memoized loading skeleton
  const loadingSliders = useMemo(
    () =>
      skeletonCatalog.map((item, index) => (
        <Slider
          isLoading={true}
          key={`loading-${item.filter}-${index}`}
          title={item.title}
          posts={[]}
          filter={item.filter}
        />
      )),
    [skeletonCatalog],
  );

  const preferredLang = settingsStorage.getPreferredLanguage();
  const contentSliders = useMemo(() => {
    return homeData
      .filter(item => item.Posts && item.Posts.length > 0)
      .map((item, index) => {
        let posts = item.Posts;
        if (preferredLang && preferredLang !== 'All') {
          const lower = preferredLang.toLowerCase();
          const filtered = posts.filter((p: any) => p.title && p.title.toLowerCase().includes(lower));
          if (filtered.length > 0) posts = filtered;
        }
        if (posts.length === 0) return null;
        return (
          <Slider
            isLoading={false}
            key={`content-${item.provider || provider?.value}-${item.filter}-${index}`}
            title={item.title}
            posts={posts}
            filter={item.filter}
            providerValue={item.provider}
          />
        );
      })
      .filter(Boolean);
  }, [homeData, preferredLang]);

  // Memoized error message - only show if there is no cached data and an error occurred
  const errorComponent = useMemo(() => {
    if (homeData.length > 0 || isLoading || !error) {
      return null;
    }

    return (
      <View className="m-4 min-h-64 flex-1 items-center justify-center rounded-3xl bg-m3-error-container p-4">
        <AppText
          role="titleMediumEmphasized"
          className="text-center text-m3-on-error-container">
          {error?.message || 'Failed to load content'}
        </AppText>
        <AppText
          role="bodyMedium"
          className="mt-1 text-center text-m3-on-error-container">
          Pull to refresh and try again
        </AppText>
      </View>
    );
  }, [error, isLoading, homeData.length]);

  const [autoInstalling, setAutoInstalling] = useState(false);

  // Auto-select provider if none selected but providers are installed.
  // Never auto-pick an 18+ provider while the age gate is off.
  useEffect(() => {
    if (provider?.value) return;
    const pickable = adultEnabled
      ? installedProviders
      : installedProviders.filter(p => !p.is_adult);
    if (pickable.length > 0) {
      useContentStore.setState({provider: pickable[0]});
    }
  }, [provider?.value, installedProviders, adultEnabled]);

  // Auto-install / auto-update providers from server on every app open
  useEffect(() => {
    if (autoInstalling) return;
    setAutoInstalling(true);
    extensionManager
      .fetchManifest(undefined, true)
      .then(() => extensionManager.initialize())
      .catch(() => {})
      .finally(() => setAutoInstalling(false));
  }, []);

  // Fetch ads (deferred until after first paint so startup stays light)
  const [adsReady, setAdsReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setAdsReady(true));
    return () => task.cancel();
  }, []);
  useEffect(() => {
    if (!adsReady) return;
    fetch('https://cinepix.top/api/app/ads', {headers: {'X-App-Key': '78a0e573dfd894d443685159b2e71e2f'}})
      .then(r => r.json())
      .then(d => setHomeAds(d))
      .catch(() => {});
  }, [adsReady]);

  // Show loading state while providers are being installed
  if (
    !installedProviders ||
    installedProviders.length === 0 ||
    !provider?.value
  ) {
    return (
      <SafeAreaView style={{flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 24}}>
        {autoInstalling ? (
          <>
            <AppText style={{color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center'}}>Installing providers...</AppText>
            <View style={{height: 16}} />
            <AppText style={{color: '#888', fontSize: 13}}>Please wait</AppText>
          </>
        ) : (
          <>
            <AppText style={{color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center'}}>Loading content...</AppText>
            <View style={{height: 16}} />
            <AppText style={{color: '#666', fontSize: 12, textAlign: 'center'}}>Pull to refresh</AppText>
          </>
        )}
      </SafeAreaView>
    );
  }

  // Startup fast path: render an empty shell first so the splash overlay can
  // fade to a *visible* screen instead of a black one, then mount the heavy
  // tree (hero + sliders + ads) right after. Cache-backed content appears
  // immediately afterwards because React Query's initialData is already there.
  const [deferredMount, setDeferredMount] = useState(true);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setDeferredMount(false));
    return () => task.cancel();
  }, []);

  // Signal App to fade the splash: the shell painted, heavy content follows.
  useEffect(() => {
    if (!deferredMount) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      markHomeReady();
    });
    return () => cancelAnimationFrame(frame);
  }, [deferredMount]);

  if (deferredMount) {
    return (
      <SafeAreaView style={{flex: 1, backgroundColor: '#000'}}>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <QueryErrorBoundary>
      <WelcomePopup />
      <GestureHandlerRootView style={{flex: 1}}>
        <StatusBarScrim visible={statusBarScrimVisible} />
        <SafeAreaView className="flex-1 bg-m3-background">
          <Drawer
            open={isDrawerOpen}
            onOpen={handleOpenDrawer}
            onClose={handleCloseDrawer}
            drawerPosition="left"
            drawerType="front"
            drawerStyle={{width: 200, backgroundColor: 'transparent'}}
            swipeEdgeWidth={disableDrawer ? 0 : 70}
            swipeEnabled={!disableDrawer}
            renderDrawerContent={() =>
              !disableDrawer ? (
                <ProviderDrawer onClose={handleDrawerClose} />
              ) : null
            }>
            <StatusBar style="light" />

            <ScrollView
              onScroll={handleScroll}
              scrollEventThrottle={16} // Optimize scroll performance
              showsVerticalScrollIndicator={false}
              className="bg-m3-background"
              refreshControl={
                <RefreshControl
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                  progressBackgroundColor={colors.surfaceContainer}
                  refreshing={manualRefreshing}
                  onRefresh={handleRefresh}
                />
              }>
              <View>
                <HeroOptimized
                  isDrawerOpen={isDrawerOpen}
                  onOpenDrawer={handleOpenDrawer}
                  disableDrawer={disableDrawer}
                />

                {/* Overlap strip floating over the hero's bottom edge */}
                <View style={{marginTop: -34, marginHorizontal: 14, zIndex: 30}}>
                  <HeroStrip
                    posts={heroPool}
                    activeLink={hero?.link || ''}
                    onSelect={item => setHero(item as any)}
                  />
                </View>
              </View>

              <ContinueWatching />

              <FriendsActivityRow />

              {!isPremium && homeAds.enabled && homeAds.top && isScreenFocused ? (
                <View style={{marginHorizontal: 14, marginTop: 8}}>
                  <AppText
                    role="labelSmallEmphasized"
                    style={{color: colors.onSurfaceVariant, marginBottom: 4, marginLeft: 4, opacity: 0.8}}>
                    এড এটিকে এড়িয়ে চলুন
                  </AppText>
                  <View style={{borderRadius: 12, overflow: 'hidden', height: 80}}>
                    {homeAds.top.startsWith('http') ? (
                      <WebView source={{uri: homeAds.top}} style={{flex: 1, backgroundColor: '#0a0a0a'}} scrollEnabled={false} />
                    ) : (
                      <WebView source={{html: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;min-height:80px;">${homeAds.top}</body></html>`}} style={{flex: 1, backgroundColor: '#0a0a0a'}} scrollEnabled={false} />
                    )}
                  </View>
                </View>
              ) : null}

              <View className="relative z-20 pb-8">
                {isLoading ? loadingSliders : contentSliders}
                {errorComponent}
              </View>

              <View className="h-8" />

              {!isPremium && homeAds.enabled && homeAds.bottom && isScreenFocused ? (
                <View style={{marginHorizontal: 14, marginBottom: 16}}>
                  <AppText
                    role="labelSmallEmphasized"
                    style={{color: colors.onSurfaceVariant, marginBottom: 4, marginLeft: 4, opacity: 0.8}}>
                    এড এটিকে এড়িয়ে চলুন
                  </AppText>
                  <View style={{borderRadius: 12, overflow: 'hidden', height: 150}}>
                    {homeAds.bottom.startsWith('http') ? (
                      <WebView source={{uri: homeAds.bottom}} style={{flex: 1, backgroundColor: '#0a0a0a'}} scrollEnabled={false} />
                    ) : (
                      <WebView source={{html: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;min-height:150px;">${homeAds.bottom}</body></html>`}} style={{flex: 1, backgroundColor: '#0a0a0a'}} scrollEnabled={false} />
                    )}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </Drawer>
        </SafeAreaView>
      </GestureHandlerRootView>
    </QueryErrorBoundary>
  );
};

export default React.memo(Home);
