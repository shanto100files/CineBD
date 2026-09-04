import {SafeAreaView, RefreshControl, View} from 'react-native';
import Slider from '../../components/Slider';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import HeroOptimized from '../../components/Hero';
import {mainStorage, settingsStorage} from '../../lib/storage';
import useContentStore from '../../lib/zustand/contentStore';
import useHeroStore from '../../lib/zustand/herostore';
import {syncFromSharedFolder} from '../../lib/sync/syncService';
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
import StatusBarScrim from '../../components/ui/StatusBarScrim';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

const Home = ({}: Props) => {
  const colors = useM3Colors();
  const [statusBarScrimVisible, setStatusBarScrimVisible] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Memoize static values
  const disableDrawer = useMemo(
    () => mainStorage.getBool('disableDrawer') || true,
    [],
  );

  const provider = useContentStore(state => state.provider);
  const installedProviders = useContentStore(state => state.installedProviders);
  const setHero = useHeroStore(state => state.setHero);

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
    return homeData.map((item, index) => {
      let posts = item.Posts;
      if (preferredLang && preferredLang !== 'All') {
        const lower = preferredLang.toLowerCase();
        const filtered = posts.filter((p: any) => p.title && p.title.toLowerCase().includes(lower));
        if (filtered.length > 0) posts = filtered;
      }
      return (
        <Slider
          isLoading={false}
          key={`content-${item.filter}-${index}`}
          title={item.title}
          posts={posts}
          filter={item.filter}
        />
      );
    });
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

  // Auto-select provider if none selected but providers are installed
  useEffect(() => {
    if (!provider?.value && installedProviders.length > 0) {
      useContentStore.setState({provider: installedProviders[0]});
    }
  }, [provider?.value, installedProviders.length]);

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

  return (
    <QueryErrorBoundary>
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
              <HeroOptimized
                isDrawerOpen={isDrawerOpen}
                onOpenDrawer={handleOpenDrawer}
              />

              <ContinueWatching />

              <View className="relative z-20 pb-8">
                {isLoading ? loadingSliders : contentSliders}
                {errorComponent}
              </View>

              <View className="h-8" />
            </ScrollView>
          </Drawer>
        </SafeAreaView>
      </GestureHandlerRootView>
    </QueryErrorBoundary>
  );
};

export default React.memo(Home);
