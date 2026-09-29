import {SafeAreaView, RefreshControl, View, Pressable, InteractionManager, Animated, ActivityIndicator, ToastAndroid} from 'react-native';
import Slider from '../../components/Slider';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFocusEffect, useIsFocused} from '@react-navigation/native';
import HeroOptimized from '../../components/Hero';
import HeroStrip, {HeroStripItem} from '../../components/HeroStrip';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {mainStorage, settingsStorage} from '../../lib/storage';
import useContentStore from '../../lib/zustand/contentStore';
import useHeroStore from '../../lib/zustand/herostore';
import {syncFromSharedFolder} from '../../lib/sync/syncService';
import {useAuthStore} from '../../lib/zustand/authStore';
import {useEntitlementStore} from '../../lib/zustand/entitlementStore';
import {useProfileStore} from '../../lib/zustand/profileStore';
import {useAdultAds} from '../../lib/services/adService';
import {CommonActions} from '@react-navigation/native';
import {navigationRef} from '../../App';
import {getGatedInstalledProviders} from '../../lib/utils/providerGate';
import {extensionStorage} from '../../lib/storage/extensionStorage';
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
import {normalizeAppAds} from '../../lib/services/adService';
import {extensionManager} from '../../lib/services/ExtensionManager';
import {Catalog} from '../../lib/providers/types';
import Tutorial from '../../components/Touturial';
import {QueryErrorBoundary} from '../../components/ErrorBoundary';
import {StatusBar} from 'expo-status-bar';
import AppText from '../../components/ui/Text';
import {FLOATING_TAB_BAR_RESERVE} from '../../theme/layout';
import {useM3Colors} from '../../theme/M3PaletteContext';
import ContinueWatching from '../../components/ContinueWatching';
import FriendsActivityRow from '../../components/FriendsActivityRow';
import StatusBarScrim from '../../components/ui/StatusBarScrim';
import AdBox from '../../components/AdBox';
import WelcomePopup from '../../components/WelcomePopup';
import {markHomeReady} from '../../lib/bootSignal';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

// 18+ profile mid-feed ad slots: one creative after every second content
// slider, capped so low-RAM phones never carry too many ad WebViews at
// once (top + these + bottom + adult box add up fast).
const MID_AD_EVERY = 2;
const MAX_MID_ADS = 3;
const MID_AD_HEIGHT = 150;

const Home = ({navigation}: Props) => {
  const colors = useM3Colors();
  const {isPremium} = useAuthStore();
  // Ad WebViews are expensive on low-RAM phones: unmount them while another
  // screen takes focus. AdBox is fully inert: impressions count on load;
  // every navigation inside the box is cancelled — nothing ever opens
  // externally, not on tap, not on auto-redirect.
  // screen (e.g. Player) is on top so playback gets the full device resources.
  const isScreenFocused = useIsFocused();
  const [statusBarScrimVisible, setStatusBarScrimVisible] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [homeAds, setHomeAds] = useState<{enabled: boolean; top: string; bottom: string}>({enabled: false, top: '', bottom: ''});
  // Adult-profile creative: the server's dedicated 18+ direct link, shown
  // only while an adult-capable profile is active.
  const adultAd = useAdultAds();
  // Mid-feed slots between content rows: 18+ profile only, never for
  // premium, and only while this screen holds focus (same unmount policy
  // as the bottom boxes).
  const showMidAds = Boolean(adultAd) && !isPremium && isScreenFocused;

  // Memoize static values
  const disableDrawer = useMemo(
    () =>
      !settingsStorage.showHamburgerMenu() ||
      mainStorage.getBool('disableDrawer'),
    [],
  );

  const provider = useContentStore(state => state.provider);
  const installedProviders = useContentStore(state => state.installedProviders);
  const adultEnabled = settingsStorage.isAdultEnabled();
  // Profile-switch feedback: show which provider's content is loading
  // right after a profile switch, so the UI never looks frozen.
  const activeProfile = useProfileStore(state => state.activeProfile);
  const activeProfileId = useProfileStore(state => state.activeId);
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
        console.warn('[CinepixSync] Home focus sync failed:', e),
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
        extensionManager
          .fetchManifest(undefined, true)
          .then(() => extensionManager.initialize())
          .then(() => useEntitlementStore.getState().refresh()),
        syncFromSharedFolder().catch(e =>
          console.warn('[CinepixSync] Home refresh sync failed:', e),
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
  // Never auto-pick an 18+ provider while the age gate is off. Also re-pick
  // when the stored provider no longer exists in the (gated) visible list —
  // otherwise the home screen stalls on "Loading content..." forever.
  useEffect(() => {
    const currentValid =
      provider?.value &&
      installedProviders.some(p => p.value === provider.value);
    if (currentValid) return;
    const pickable = adultEnabled
      ? installedProviders
      : installedProviders.filter(p => !p.is_adult);
    if (pickable.length > 0) {
      useContentStore.setState({provider: pickable[0]});
    }
  }, [provider?.value, installedProviders, adultEnabled]);

  // Auto-install / auto-update providers from server on every app open
  const runAutoInstall = useCallback(() => {
    setAutoInstalling(true);
    extensionManager
      .fetchManifest(undefined, true)
      .then(() => extensionManager.initialize())
      .catch(() => {})
      .finally(() => setAutoInstalling(false));
  }, []);

  useEffect(() => {
    runAutoInstall();
  }, [runAutoInstall]);

  // Fetch ads (deferred until after first paint so startup stays light)
  const [adsReady, setAdsReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setAdsReady(true));
    return () => task.cancel();
  }, []);
  useEffect(() => {
    if (!adsReady) return;
    fetch('https://cinepix.top/api/app/ads', {headers: {'X-App-Key': '78a0e573dfd894d443685159b2e71e2f'}})
      .then(r => {
        if (!r.ok) {
          throw new Error(`ads request failed: ${r.status}`);
        }
        return r.json();
      })
      .then(d => setHomeAds(normalizeAppAds(d)))
      .catch(() => {});
  }, [adsReady]);

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
    markHomeReady();
  }, []);

  const activeProfileInfo = (() => {
    try {
      const p = useProfileStore.getState().activeProfile();
      return {
        family: p?.kind === 'family',
        explicitSet: !!p && p.kind !== 'family' && Array.isArray(p.providers),
      };
    } catch {
      return {family: false, explicitSet: false};
    }
  })();
  const deviceAdultOff = !settingsStorage.isAdultEnabled();
  const rawHasAdult = (() => {
    try {
      return (extensionStorage.getInstalledProviders() || []).some(p => p.is_adult);
    } catch {
      return false;
    }
  })();
  const showSwitchProfile = activeProfileInfo.family || activeProfileInfo.explicitSet;
  const showEnableAdult = deviceAdultOff && rawHasAdult;

  // Switching back to the default profile is synchronous, so keep a short
  // loader visible anyway — otherwise the user gets zero feedback that the
  // tap did anything (the content tree only mounts right after).
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const switchToDefaultProfile = () => {
    if (switchingProfile) {
      return;
    }
    // Same child-proofing as the profile switcher: family -> default can
    // expose adult content when the device toggle is on, so require the
    // 18+ lock first (switch is deferred into the unlock success path).
    try {
      const {profileSwitchNeedsLock} = require('../../lib/adultLock');
      const current = useProfileStore.getState().activeProfile();
      if (
        profileSwitchNeedsLock(
          null,
          current,
          settingsStorage.isAdultEnabled(),
        )
      ) {
        require('../../App').openAdultLock({
          mode: 'unlock',
          switchProfile: null,
        });
        return;
      }
    } catch {}
    setSwitchingProfile(true);
    setTimeout(() => {
      try {
        useProfileStore.getState().setActive(null);
        useEntitlementStore.getState().refresh();
      } finally {
        setSwitchingProfile(false);
      }
    }, 800);
  };
  // The Home age-gate button must respect the 18+ lock the same way the
  // Settings toggle does: PIN set but session locked → open the lock screen,
  // enable only after a successful unlock. Otherwise a kid could bypass the
  // entire PIN protection with one tap from Home.
  const pendingAdultEnableRef = useRef(false);
  // Unlock timestamp captured before the lock screen opened — a cancelled
  // prompt must never ride on an older session's fresh-unlock window.
  const unlockedAtBeforePromptRef = useRef(0);
  useEffect(() => {
    if (!isScreenFocused || !pendingAdultEnableRef.current) return;
    pendingAdultEnableRef.current = false;
    const {isAdultLockOpen, markUnlocked, getUnlockedAt} = require('../../lib/adultLock');
    const unlockedNow = isAdultLockOpen() && getUnlockedAt() > unlockedAtBeforePromptRef.current;
    if (unlockedNow) {
      markUnlocked();
      settingsStorage.setAdultEnabled(true);
      useContentStore.setState({installedProviders: getGatedInstalledProviders()});
      useEntitlementStore.getState().refresh();
      ToastAndroid.show('১৮+ চালু হয়েছে', ToastAndroid.SHORT);
    } else {
      ToastAndroid.show('১৮+ চালু হয়নি — পিন/ফিঙ্গারপ্রিন্ট দিয়ে আনলক করুন', ToastAndroid.LONG);
    }
  }, [isScreenFocused]);
  const enableAdult = () => {
    const {isAdultPinSet, getUnlockedAt} = require('../../lib/adultLock');
    if (isAdultPinSet()) {
      // Always prompt when enabling 18+ — a fresh unlock is required every
      // time the gate opens, regardless of the 15-min session window.
      unlockedAtBeforePromptRef.current = getUnlockedAt();
      pendingAdultEnableRef.current = true;
      require('../../App').openAdultLock({mode: 'unlock'});
      return;
    }
    settingsStorage.setAdultEnabled(true);
    useContentStore.setState({installedProviders: getGatedInstalledProviders()});
    useEntitlementStore.getState().refresh();
    ToastAndroid.show('১৮+ চালু হয়েছে', ToastAndroid.SHORT);
  };
  const retryProviderLoad = () => {
    runAutoInstall();
    useEntitlementStore.getState().refresh();
  };

  // Show loading state while providers are being installed
  if (
    !installedProviders ||
    installedProviders.length === 0 ||
    !provider?.value
  ) {
    const noVisibleProviders =
      !installedProviders ||
      installedProviders.length === 0 ||
      // Providers exist but NONE of them is usable right now (all 18+ and
      // the age gate is off): auto-pick has nothing to choose, so this must
      // render the "১৮+ চালু করুন" screen instead of an endless
      // "Loading content...".
      installedProviders.filter(p => adultEnabled || !p.is_adult).length === 0;
    // One reason line at a time (priority: profile reason > age-gate > generic).
    const reasonText = activeProfileInfo.family
      ? 'ফ্যামিলি প্রোফাইলে ১৮+ প্রোভাইডার লুকানো থাকে।'
      : activeProfileInfo.explicitSet
      ? 'সক্রিয় প্রোফাইলের প্রোভাইডার তালিকায় কিছু পাওয়া যায়নি।'
      : showEnableAdult
      ? showSwitchProfile
        ? 'ডিভাইস সেটিংসেও ১৮+ কনটেন্ট বন্ধ আছে।'
        : '১৮+ কনটেন্ট বন্ধ থাকায় প্রোভাইডারগুলো লুকানো আছে।'
      : 'প্রোভাইডার ইনস্টল করা যায়নি — সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।';
    const emptyIcon = activeProfileInfo.family
      ? 'shield-account'
      : activeProfileInfo.explicitSet
      ? 'link-off'
      : showEnableAdult
      ? 'eye-off'
      : 'television-off';
    const btnBase = {
      minHeight: 48,
      borderRadius: 999,
      paddingHorizontal: 26,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    };
    return (
      <SafeAreaView style={{flex: 1, backgroundColor: '#000'}}>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28}}>
          {autoInstalling ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <View style={{height: 18}} />
              <AppText style={{color: colors.onSurface, fontSize: 16, fontWeight: '700', textAlign: 'center'}}>
                প্রোভাইডার ইনস্টল হচ্ছে...
              </AppText>
              <View style={{height: 6}} />
              <AppText style={{color: colors.onSurfaceVariant, fontSize: 13}}>অনুগ্রহ করে অপেক্ষা করুন</AppText>
            </>
          ) : !noVisibleProviders ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <View style={{height: 18}} />
              <AppText style={{color: colors.onSurface, fontSize: 16, fontWeight: '700', textAlign: 'center'}}>Loading content...</AppText>
              <View style={{height: 6}} />
              <AppText style={{color: colors.onSurfaceVariant, fontSize: 12, textAlign: 'center'}}>অনুগ্রহ করে অপেক্ষা করুন</AppText>
            </>
          ) : (
            <>
              <View
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 22,
                  backgroundColor: colors.surfaceContainerHigh,
                  borderWidth: 1,
                  borderColor: colors.outlineVariant,
                }}>
                <MaterialCommunityIcons name={emptyIcon as any} size={44} color={colors.onSurfaceVariant} />
              </View>
              <AppText style={{color: colors.onSurface, fontSize: 19, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2}}>
                কোনো প্রোভাইডার দেখা যাচ্ছে না
              </AppText>
              <AppText style={{color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 320}}>
                {reasonText}
              </AppText>
              <View style={{marginTop: 26, width: 260}}>
                {showSwitchProfile && (
                  <Pressable
                    onPress={switchToDefaultProfile}
                    disabled={switchingProfile}
                    style={[btnBase, {backgroundColor: colors.primary, opacity: switchingProfile ? 0.7 : 1}]}>
                    {switchingProfile ? (
                      <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                      <AppText style={{color: colors.onPrimary, fontSize: 14.5, fontWeight: '700'}}>ডিফল্ট প্রোফাইলে ফিরুন</AppText>
                    )}
                  </Pressable>
                )}
                {showEnableAdult && (
                  <Pressable
                    onPress={enableAdult}
                    style={[btnBase, {backgroundColor: colors.secondaryContainer, marginTop: showSwitchProfile ? 12 : 0}]}>
                    <AppText style={{color: colors.onSecondaryContainer, fontSize: 14.5, fontWeight: '700'}}>১৮+ চালু করুন</AppText>
                  </Pressable>
                )}
                <Pressable
                  onPress={retryProviderLoad}
                  style={[btnBase, {backgroundColor: colors.surfaceContainer, borderWidth: 1, borderColor: colors.outlineVariant, marginTop: 12}]}>
                  <AppText style={{color: colors.onSurface, fontSize: 14.5, fontWeight: '700'}}>আবার চেষ্টা করুন</AppText>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

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
              contentContainerStyle={{paddingBottom: FLOATING_TAB_BAR_RESERVE}}
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

              {isLoading && provider?.value ? (
                <View
                  style={{
                    marginHorizontal: 14,
                    marginTop: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    backgroundColor: colors.surfaceContainer,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <AppText
                    style={{
                      color: colors.onSurfaceVariant,
                      fontSize: 12.5,
                      marginLeft: 10,
                      flex: 1,
                    }}>
                    {activeProfile()?.name
                      ? `${activeProfile()?.name} প্রোফাইল • ${provider.display_name || provider.value} থেকে লোড হচ্ছে...`
                      : `${provider.display_name || provider.value} থেকে লোড হচ্ছে...`}
                  </AppText>
                </View>
              ) : null}

              {!isPremium && homeAds.enabled && homeAds.top && isScreenFocused ? (
                <View style={{marginHorizontal: 14, marginTop: 8}}>
                  <AppText
                    role="labelSmallEmphasized"
                    style={{color: colors.onSurfaceVariant, marginBottom: 4, marginLeft: 4, opacity: 0.8}}>
                    এড এটিকে এড়িয়ে চলুন
                  </AppText>
                  <View style={{borderRadius: 12, overflow: 'hidden', height: 80}}>
                    <AdBox content={homeAds.top} height={80} />
                  </View>
                </View>
              ) : null}

              <View className="relative z-20 pb-8">
                {isLoading ? (
                  loadingSliders
                ) : (
                  contentSliders.map((slider, index) => (
                    <React.Fragment key={`section-${index}`}>
                      {slider}
                      {showMidAds &&
                      (index + 1) % MID_AD_EVERY === 0 &&
                      Math.floor(index / MID_AD_EVERY) < MAX_MID_ADS ? (
                        <View style={{marginHorizontal: 14, marginBottom: 16}}>
                          <AppText
                            role="labelSmallEmphasized"
                            style={{
                              color: colors.onSurfaceVariant,
                              marginBottom: 4,
                              marginLeft: 4,
                              opacity: 0.8,
                            }}>
                            ১৮+ প্রোফাইল বিজ্ঞাপন
                          </AppText>
                          <View
                            style={{
                              borderRadius: 12,
                              overflow: 'hidden',
                              height: MID_AD_HEIGHT,
                            }}>
                            <AdBox content={adultAd} height={MID_AD_HEIGHT} />
                          </View>
                        </View>
                      ) : null}
                    </React.Fragment>
                  ))
                )}
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
                    <AdBox content={homeAds.bottom} height={150} />
                  </View>
                </View>
              ) : null}

              {adultAd && isScreenFocused ? (
                <View style={{marginHorizontal: 14, marginBottom: 16}}>
                  <AppText
                    role="labelSmallEmphasized"
                    style={{color: colors.onSurfaceVariant, marginBottom: 4, marginLeft: 4, opacity: 0.8}}>
                    ১৮+ প্রোফাইল বিজ্ঞাপন
                  </AppText>
                  <View style={{borderRadius: 12, overflow: 'hidden', height: 170}}>
                    <AdBox content={adultAd} height={170} />
                  </View>
                  {!isPremium && (
                    <Pressable
                      onPress={() => {
                        try {
                          navigationRef.dispatch(
                            CommonActions.navigate('TabStack', {
                              screen: 'SettingsStack',
                              params: {screen: 'Premium'} as never,
                            }),
                          );
                        } catch {}
                      }}
                      style={{marginTop: 8, alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12}}>
                      <AppText style={{color: colors.primary, fontSize: 12, fontWeight: '700'}}>
                        ⭐ প্রিমিয়াম নিন — বিজ্ঞাপনমুক্ত দেখুন
                      </AppText>
                    </Pressable>
                  )}
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
