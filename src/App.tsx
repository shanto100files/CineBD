import 'react-native-gesture-handler';
import React, {useEffect, useState, useCallback, memo} from 'react';
import './global.css';
import Home from './screens/home/Home';
import Info from './screens/home/Info';
import Player from './screens/home/Player';
import Settings from './screens/settings/Settings';
import WatchList from './screens/WatchList';
import Search from './screens/Search';
import ScrollList from './screens/ScrollList';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import 'react-native-reanimated';
import WebView from './screens/WebView';
import SearchResults from './screens/SearchResults';
import * as SystemUI from 'expo-system-ui';
import About, {checkForUpdate} from './screens/settings/About';
import {SystemBars} from 'react-native-edge-to-edge';
import {enableFreeze, enableScreens} from 'react-native-screens';
import Preferences from './screens/settings/Preference';
import Appearance from './screens/settings/Appearance';
import {M3ThemeProvider} from './theme/M3ThemeProvider';
import {AppState, LogBox, useWindowDimensions, View, Image, Modal, Pressable, Text, Platform} from 'react-native';
import {sendHeartbeat} from './lib/services/heartbeatService';
import {initAnalytics, resumeAnalytics, pauseAnalytics, flushBatch, trackScreen} from './lib/services/analyticsService';
import {EpisodeLink} from './lib/providers/types';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Downloads from './screens/downloads/Downloads';
import DownloadedDetails from './screens/downloads/DownloadedDetails';
import SubtitlePreference from './screens/settings/SubtitleSettings';
import Extensions from './screens/settings/Extensions';
import ProviderSelect from './screens/settings/ProviderSelect';
import TermsOfService from './screens/settings/TermsOfService';
import ReportScreen from './screens/settings/ReportScreen';
import Constants from 'expo-constants';
import {settingsStorage} from './lib/storage';
import {updateProvidersService} from './lib/services/UpdateProviders';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from './lib/client';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import notifee, {EventType} from '@notifee/react-native';
import notificationService from './lib/services/Notification';
import WafWebViewDialog from './components/WafWebViewDialog';
import ProviderSandboxHost from './components/ProviderSandboxHost';
import {syncDohSettings} from './lib/services/dohService';
import {
  reconcileCompletedDownloadOutputs,
  reconcileDownloadState,
} from './lib/downloadReconciliation';
import useDownloadsStore from './lib/zustand/downloadsStore';
import useNavigationPreferencesStore from './lib/zustand/navigationPreferencesStore';
import {
  initializeSyncService,
  publishSyncManifest,
  syncFromSharedFolder,
} from './lib/sync/syncService';
import StreamingTabBar from './components/navigation/StreamingTabBar';
import AppDialogHost from './components/AppDialogHost';
import DownloadLocationDialog from './components/DownloadLocationDialog';
import {
  getDownloadLocationDisplayValue,
  selectDownloadLocation,
} from './lib/downloadLocation';
import {
  getAnalytics,
  getCrashlytics,
  isFirebaseNativeReady,
} from './lib/utils/firebaseSafe';
import {useAuthStore} from './lib/zustand/authStore';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ProfileScreen from './screens/ProfileScreen';
import PremiumScreen from './screens/settings/PremiumScreen';
import ForceUpdateScreen from './screens/ForceUpdateScreen';
import AppText from './components/ui/Text';
import InitSplash from './components/InitSplash';
import {initializeApp, InitProgress, checkForceUpdateOnly} from './lib/services/initService';
import RNBootSplash from 'react-native-bootsplash';

enableScreens(true);
enableFreeze(true);

export type HomeStackParamList = {
  Home: undefined;
  Info: {link: string; provider?: string; poster?: string};
  ScrollList: {
    filter: string;
    title?: string;
    providerValue?: string;
    isSearch: boolean;
  };
  Webview: {link: string};
};

export type RootStackParamList = {
  TabStack:
    | {
        screen?: keyof TabStackParamList;
        params?: {
          screen?: string;
          params?: {
            screen?: string;
            params?: any;
          };
        };
      }
    | undefined;
  Player: {
    linkIndex: number;
    episodeList: EpisodeLink[];
    directUrl?: string;
    type: string;
    primaryTitle?: string;
    secondaryTitle?: string;
    poster: {
      logo?: string;
      poster?: string;
      background?: string;
    };
    file?: string;
    providerValue?: string;
    infoUrl?: string;
  };
};

export type SearchStackParamList = {
  Search: undefined;
  ScrollList: {
    filter: string;
    title?: string;
    providerValue?: string;
    isSearch: boolean;
  };
  Info: {link: string; provider?: string; poster?: string};
  SearchResults: {filter: string; availableProviders?: string[]};
  Webview: {link: string};
};

export type WatchListStackParamList = {
  WatchList: undefined;
  Info: {link: string; provider?: string; poster?: string};
};

export type SettingsStackParamList = {
  Settings: undefined;
  Appearance: undefined;
  DisableProviders: undefined;
  About: undefined;
  Preferences: undefined;
  SubTitlesPreferences: undefined;
  Extensions: undefined;
  DownloadsStack: undefined;
  ProviderSelect: undefined;
  Login: undefined;
  Register: undefined;
  Profile: undefined;
  Premium: undefined;
  TermsOfService: undefined;
  Report: undefined;
};

export type DownloadsStackParamList = {
  Downloads: undefined;
  DownloadedDetails: {groupId: string};
};

export type TabStackParamList = {
  HomeStack: undefined;
  SearchStack: undefined;
  WatchListStack: undefined;
  DownloadsStack: undefined;
  SettingsStack: undefined;
};

const Tab = createBottomTabNavigator<TabStackParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
let pendingDownloadsNavigation = false;

const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
const RootStackNav = createNativeStackNavigator<RootStackParamList>();
const SearchStackNav = createNativeStackNavigator<SearchStackParamList>();
const WatchListStackNav = createNativeStackNavigator<WatchListStackParamList>();
const DownloadsStackNav = createNativeStackNavigator<DownloadsStackParamList>();
const SettingsStackNav = createNativeStackNavigator<SettingsStackParamList>();

const stackScreenOptions = {
  headerShown: false,
  animation: 'ios_from_right' as const,
  animationDuration: 200,
  freezeOnBlur: true,
};

const HomeStackScreen = React.memo(() => (
  <HomeStackNav.Navigator screenOptions={stackScreenOptions}>
    <HomeStackNav.Screen name="Home" component={Home} />
    <HomeStackNav.Screen name="Info" component={Info} />
    <HomeStackNav.Screen name="ScrollList" component={ScrollList} />
    <HomeStackNav.Screen name="Webview" component={WebView} />
  </HomeStackNav.Navigator>
));

const SearchStackScreen = React.memo(() => (
  <SearchStackNav.Navigator screenOptions={stackScreenOptions}>
    <SearchStackNav.Screen name="Search" component={Search} />
    <SearchStackNav.Screen name="ScrollList" component={ScrollList} />
    <SearchStackNav.Screen name="Info" component={Info} />
    <SearchStackNav.Screen name="SearchResults" component={SearchResults} />
    <SearchStackNav.Screen name="Webview" component={WebView} />
  </SearchStackNav.Navigator>
));

const WatchListStackScreen = React.memo(() => (
  <WatchListStackNav.Navigator screenOptions={stackScreenOptions}>
    <WatchListStackNav.Screen name="WatchList" component={WatchList} />
    <WatchListStackNav.Screen name="Info" component={Info} />
  </WatchListStackNav.Navigator>
));

const DownloadsStackScreen = React.memo(() => (
  <DownloadsStackNav.Navigator screenOptions={stackScreenOptions}>
    <DownloadsStackNav.Screen name="Downloads" component={Downloads} />
    <DownloadsStackNav.Screen name="DownloadedDetails" component={DownloadedDetails} />
  </DownloadsStackNav.Navigator>
));

const SettingsStackScreen = React.memo(() => {
  const insets = useSafeAreaInsets();
  const subpageOptions = {contentStyle: {paddingTop: insets.top}};
  return (
    <SettingsStackNav.Navigator screenOptions={stackScreenOptions}>
      <SettingsStackNav.Screen name="Settings" component={Settings} />
      <SettingsStackNav.Screen name="Appearance" component={Appearance} options={subpageOptions} />
      <SettingsStackNav.Screen name="About" component={About} options={subpageOptions} />
      <SettingsStackNav.Screen name="Preferences" component={Preferences} options={subpageOptions} />
      <SettingsStackNav.Screen name="Extensions" component={Extensions} options={subpageOptions} />
      <SettingsStackNav.Screen name="DownloadsStack" component={DownloadsStackScreen} options={subpageOptions} />
      <SettingsStackNav.Screen name="SubTitlesPreferences" component={SubtitlePreference} options={subpageOptions} />
      <SettingsStackNav.Screen name="ProviderSelect" component={ProviderSelect} options={subpageOptions} />
      <SettingsStackNav.Screen name="Login" component={LoginScreen} options={subpageOptions} />
      <SettingsStackNav.Screen name="Register" component={RegisterScreen} options={subpageOptions} />
      <SettingsStackNav.Screen name="Profile" component={ProfileScreen} options={subpageOptions} />
      <SettingsStackNav.Screen name="Premium" component={PremiumScreen} options={subpageOptions} />
      <SettingsStackNav.Screen name="TermsOfService" component={TermsOfService} options={{headerShown: false}} />
      <SettingsStackNav.Screen name="Report" component={ReportScreen} options={{headerShown: false}} />
    </SettingsStackNav.Navigator>
  );
});

export const openDownloadsScreen = (): void => {
  if (!navigationRef.isReady()) {
    pendingDownloadsNavigation = true;
    return;
  }
  pendingDownloadsNavigation = false;
  if (settingsStorage.hideDownloadsTab()) {
    navigationRef.navigate('TabStack', {
      screen: 'SettingsStack',
      params: {screen: 'DownloadsStack'},
    });
    return;
  }
  navigationRef.navigate('TabStack', {screen: 'DownloadsStack'});
};

const App = () => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isLargeScreen = Math.min(windowWidth, windowHeight) >= 600;
  const {isLoading} = useAuthStore();
  const loadToken = useAuthStore(s => s.loadToken);
  const [initProgress, setInitProgress] = useState<InitProgress>({progress: 0, status: 'Starting...'});
  const [appReady, setAppReady] = useState(false);
  const [forceUpdateNeeded, setForceUpdateNeeded] = useState(false);
  const [securityBlocked, setSecurityBlocked] = useState(false);
  const [appShutdown, setAppShutdown] = useState(false);
  const [shutdownMessage, setShutdownMessage] = useState('');
  const [showDownloadSetup, setShowDownloadSetup] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  LogBox.ignoreLogs([
    'You have passed a style to FlashList',
    'new NativeEventEmitter()',
  ]);

  // Function to perform update check only
  const runUpdateCheck = useCallback(async () => {
    try {
      const needsUpdate = await checkForceUpdateOnly();
      if (needsUpdate) {
        setForceUpdateNeeded(true);
        // Force splash to stay visible if update needed
        setAppReady(false);
      }
    } catch (e) {
      console.warn('Update check failed:', e);
    }
  }, []);

  useEffect(() => {
    let reconciled = false;
    const reconcile = () => {
      if (reconciled) return;
      reconciled = true;
      reconcileDownloadState()
        .then(() => initializeSyncService())
        .catch(error => console.error('Download startup failed:', error));
    };

    if (useDownloadsStore.persist.hasHydrated()) {
      reconcile();
    }
    return useDownloadsStore.persist.onFinishHydration(reconcile);
  }, []);

  useEffect(() => {
    initAnalytics();
  }, []);

  // Strict foreground check: check update every time user comes back to app
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        // Re-verify update status immediately on return
        runUpdateCheck();

        reconcileCompletedDownloadOutputs().catch(() => {});
        syncFromSharedFolder().catch(() => {});
        sendHeartbeat();
        resumeAnalytics();
      } else if (state === 'background' || state === 'inactive') {
        publishSyncManifest().catch(() => {});
        pauseAnalytics();
      }
    });
    return () => subscription.remove();
  }, [runUpdateCheck]);

  useEffect(() => {
    const optIn = settingsStorage.isTelemetryOptIn();
    if (hasFirebase) {
      try {
        const crashlytics = getCrashlytics();
        if (crashlytics) crashlytics().setCrashlyticsCollectionEnabled(optIn);
        const analytics = getAnalytics();
        if (analytics) {
          analytics().setAnalyticsCollectionEnabled(optIn);
          analytics().setConsent({
            analytics_storage: optIn,
            ad_storage: optIn,
            ad_user_data: optIn,
            ad_personalization: optIn,
          });
          analytics().logAppOpen();
        }
      } catch {}
    }

    const unsubscribe = notifee.onForegroundEvent(({type, detail}) => {
      notificationService.actionHandler({type, detail});
    });

    notifee.getInitialNotification().then(initialNotification => {
      if (!initialNotification) return;
      const pressActionId = initialNotification.pressAction?.id;
      return notificationService.actionHandler({
        type: pressActionId && pressActionId !== 'default' ? EventType.ACTION_PRESS : EventType.PRESS,
        detail: initialNotification,
      });
    }).catch(error =>
        console.warn('Failed to handle initial notification:', error),
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    updateProvidersService.startAutomaticUpdateCheck();
    syncDohSettings().catch(e =>
      console.warn('[DoH] Failed to sync settings:', e),
    );
    loadToken();
    SystemUI.setBackgroundColorAsync('#000000').catch(() => {});
    return () => updateProvidersService.stopAutomaticUpdateCheck();
  }, []);

  // Unified Initial Load
  useEffect(() => {
    let initDone = false;

    const startInit = async () => {
      try {
        const res = await initializeApp(setInitProgress);
        initDone = true;

        if (res?.blocked) {
          setShutdownMessage(res.reason || 'Access denied.');
          setForceUpdateNeeded(true);
          setAppReady(true);
        } else if (res?.forceUpdate) {
          setForceUpdateNeeded(true);
          setAppReady(true);
        } else {
          setAppReady(true);
        }
      } catch (err: any) {
        initDone = true;
        console.error('App.tsx: Init failed', err);
        setAppReady(true);
      }
    };

    startInit();

    const safetyTimer = setTimeout(() => {
      if (!initDone) {
        console.warn('App.tsx: Safety timeout reached');
        setAppReady(true);
      }
    }, 12000);

    return () => clearTimeout(safetyTimer);
  }, []);

  // Force resolve auth loading if it takes too long
  useEffect(() => {
    const t = setTimeout(() => {
      const state = useAuthStore.getState();
      if (state.isLoading) {
        console.warn('App.tsx: Auth isLoading timed out, force clearing');
        useAuthStore.setState({isLoading: false} as any);
      }
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  // Periodic update check — every 30 min while app is active
  useEffect(() => {
    if (!appReady) return;
    const interval = setInterval(async () => {
      try {
        const needsUpdate = await checkForceUpdateOnly();
        if (needsUpdate) {
          setForceUpdateNeeded(true);
          setAppReady(false);
        }
      } catch {}
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [appReady]);

  // Check download location on app start — show setup dialog if not configured
  useEffect(() => {
    if (!appReady) return;
    const config = settingsStorage.getDownloadLocationConfig();
    if (!config && Platform.OS === 'android') {
      // Small delay to let app fully render
      const timer = setTimeout(() => setShowDownloadSetup(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [appReady]);

  const handleSelectDownloadFolder = async () => {
    setIsPickingFolder(true);
    setShowDownloadSetup(false);
    try {
      const pickedLocation = await selectDownloadLocation();
      if (pickedLocation) {
        settingsStorage.setDownloadLocation(pickedLocation);
      }
    } catch (error) {
      console.log('Error picking download folder:', error);
    } finally {
      setIsPickingFolder(false);
    }
  };

  const hideDownloadsTab = useNavigationPreferencesStore(state => state.hideDownloadsTab);

  // Hide native splash after React has mounted InitSplash
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const hideNativeSplash = useCallback(() => {
    if (!nativeSplashHidden) {
      setNativeSplashHidden(true);
      RNBootSplash.hide({fade: true}).catch(() => {});
    }
  }, [nativeSplashHidden]);

  // Priority Rendering Logic
  if (appShutdown) {
    return (
      <View style={{flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 32}}>
        <Image source={require('../assets/logo.png')} style={{width: 120, height: 120, marginBottom: 24}} resizeMode="contain" />
        <AppText role="headlineMedium" style={{color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12}}>Maintenance</AppText>
        <AppText role="bodyMedium" style={{color: '#999', textAlign: 'center'}}>{shutdownMessage}</AppText>
      </View>
    );
  }

  // Force Update takes precedence over everything
  if (forceUpdateNeeded) {
    return <ForceUpdateScreen killSwitchBlocked={!!shutdownMessage} reason={shutdownMessage} />;
  }

  if (securityBlocked) {
    return (
      <View style={{flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 32}}>
        <AppText role="headlineMedium" style={{color: '#fff', textAlign: 'center'}}>Security Block</AppText>
      </View>
    );
  }

  // Splash Screen showing during check
  if (!appReady || isLoading) {
    return (
      <InitSplash
        progress={isLoading ? 100 : initProgress.progress}
        status={isLoading ? 'Loading profile...' : initProgress.status}
        onForceReady={() => setAppReady(true)}
        onMounted={hideNativeSplash}
      />
    );
  }

  const hasFirebase = Boolean(Constants?.expoConfig?.extra?.hasFirebase) && isFirebaseNativeReady();

  const TabStack = React.memo(() => (
    <Tab.Navigator
      detachInactiveScreens={true}
      tabBar={props => <StreamingTabBar {...props} />}
      screenOptions={{
        animation: 'shift',
        popToTopOnBlur: false,
        tabBarPosition: isLargeScreen ? 'left' : 'bottom',
        headerShown: false,
        // freezeOnBlur must stay OFF: with freeze enabled the inactive
        // Settings screen intercepts tab taps (known react-native-screens
        // issue) — Home/Search taps open Settings content instead.
        freezeOnBlur: false,
        tabBarHideOnKeyboard: true,
      }}>
      <Tab.Screen
        name="HomeStack"
        component={HomeStackScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({focused, color, size}) => (
            <MaterialCommunityIcons name={focused ? 'home-variant' : 'home-variant-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="SearchStack"
        component={SearchStackScreen}
        options={{
          title: 'Search',
          tabBarIcon: ({focused, color, size}) => (
            <MaterialCommunityIcons name="magnify" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="WatchListStack"
        component={WatchListStackScreen}
        options={{
          title: 'Watch List',
          tabBarIcon: ({focused, color, size}) => (
            <MaterialCommunityIcons name={focused ? 'bookmark' : 'bookmark-outline'} color={color} size={size} />
          ),
        }}
      />
      {!hideDownloadsTab && (
        <Tab.Screen
          name="DownloadsStack"
          component={DownloadsStackScreen}
          options={{
            title: 'Downloads',
            tabBarIcon: ({focused, color, size}) => (
              <MaterialCommunityIcons name={focused ? 'download' : 'download-outline'} color={color} size={size} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="SettingsStack"
        component={SettingsStackScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({focused, color, size}) => (
            <MaterialCommunityIcons name={focused ? 'cog' : 'cog-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  ));

  return (
    <SafeAreaProvider>
      <SystemBars style="light" />
      <M3ThemeProvider>
        <AppDialogHost />
        <DownloadLocationDialog
          visible={showDownloadSetup}
          primary=""
          selecting={isPickingFolder}
          onCancel={() => setShowDownloadSetup(false)}
          onSelectFolder={handleSelectDownloadFolder}
        />
        <GlobalErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <View className="flex-1 bg-black">
              <NavigationContainer
                ref={navigationRef}
                onReady={async () => {
                  if (pendingDownloadsNavigation) {
                    openDownloadsScreen();
                  }
                   // Track initial screen
                  if (hasFirebase) {
                    try {
                      const route = navigationRef.getCurrentRoute();
                      if (route?.name) {
                        const analytics = getAnalytics();
                        if (analytics) {
                          await analytics().logScreenView({
                            screen_name: route.name,
                            screen_class: 'Navigation',
                          });
                        }
                      }
                    } catch {}
                  }
                }}
                onStateChange={() => {
                  try {
                    const route = navigationRef.getCurrentRoute();
                    if (route?.name) {
                      trackScreen(route.name);
                    }
                  } catch {}
                }}
                theme={{
                  fonts: {
                    regular: {fontFamily: 'Inter_400Regular', fontWeight: '400'},
                    medium: {fontFamily: 'Inter_500Medium', fontWeight: '500'},
                    bold: {fontFamily: 'Inter_700Bold', fontWeight: '700'},
                    heavy: {fontFamily: 'Inter_800ExtraBold', fontWeight: '800'},
                  },
                  dark: true,
                  colors: {background: 'transparent', card: 'black', primary: '#E4E4E4', text: 'white', border: 'black', notification: '#E4E4E4'},
                }}>
                <RootStackNav.Navigator
                  screenOptions={{
                    headerShown: false,
                    animation: 'ios_from_right',
                    animationDuration: 200,
                    freezeOnBlur: true,
                    contentStyle: {backgroundColor: 'transparent'},
                  }}>
                  <RootStackNav.Screen name="TabStack" component={TabStack} />
                  <RootStackNav.Screen
                    name="Player"
                    component={Player}
                    options={{
                      orientation: 'landscape',
                      statusBarHidden: true,
                      navigationBarHidden: true,
                      autoHideHomeIndicator: true,
                    }}
                  />
                </RootStackNav.Navigator>
              </NavigationContainer>
              <WafWebViewDialog />
              <ProviderSandboxHost />
              <PremiumActivatedAlert />
            </View>
          </QueryClientProvider>
        </GlobalErrorBoundary>
      </M3ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;

function PremiumActivatedAlert() {
  const premiumJustActivated = useAuthStore(s => s.premiumJustActivated);
  const dismissPremiumAlert = useAuthStore(s => s.dismissPremiumAlert);
  const user = useAuthStore(s => s.user);

  return (
    <Modal visible={premiumJustActivated} transparent animationType="fade">
      <Pressable style={{flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'center', alignItems:'center', padding:32}} onPress={dismissPremiumAlert}>
        <Pressable style={{backgroundColor:'#1a1d27', borderRadius:20, padding:32, alignItems:'center', maxWidth:340, width:'100%', borderWidth:1, borderColor:'#fbbf24'}}>
          <Text style={{fontSize:48, marginBottom:12}}>🎉</Text>
          <Text style={{color:'#fbbf24', fontSize:22, fontWeight:'800', marginBottom:8}}>Welcome Premium!</Text>
          <Text style={{color:'#fff', fontSize:15, fontWeight:'600', marginBottom:4}}>Hi {user?.username || 'there'}!</Text>
          <Text style={{color:'#9ca3af', fontSize:13, textAlign:'center', marginBottom:20}}>
            Your account has been upgraded to Premium. Enjoy ad-free streaming, all providers and more!
          </Text>
          <Pressable onPress={dismissPremiumAlert} style={{backgroundColor:'#fbbf24', borderRadius:12, paddingVertical:12, paddingHorizontal:32}}>
            <Text style={{color:'#000', fontSize:15, fontWeight:'700'}}>Awesome!</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
