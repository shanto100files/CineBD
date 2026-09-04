import React, {useEffect, useState} from 'react';
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
import 'react-native-gesture-handler';
import WebView from './screens/WebView';
import SearchResults from './screens/SearchResults';
import * as SystemUI from 'expo-system-ui';
// import DisableProviders from './screens/settings/DisableProviders';
import About, {checkForUpdate} from './screens/settings/About';
import BootSplash from 'react-native-bootsplash';
import {SystemBars} from 'react-native-edge-to-edge';
import {enableFreeze, enableScreens} from 'react-native-screens';
import Preferences from './screens/settings/Preference';
import Appearance from './screens/settings/Appearance';
import {M3ThemeProvider} from './theme/M3ThemeProvider';
import {AppState, LogBox, useWindowDimensions, View, ActivityIndicator, Image} from 'react-native';
import {sendHeartbeat} from './lib/services/heartbeatService';
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
import {
  getAnalytics,
  getCrashlytics,
  isFirebaseNativeReady,
} from './lib/utils/firebaseSafe';
import {useAuthStore} from './lib/zustand/authStore';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ProfileScreen from './screens/ProfileScreen';
import ForceUpdateScreen from './screens/ForceUpdateScreen';
import AppText from './components/ui/Text';
import InitSplash from './components/InitSplash';
import {initializeApp, InitProgress} from './lib/services/initService';

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
  LogBox.ignoreLogs([
    'You have passed a style to FlashList',
    'new NativeEventEmitter()',
  ]);
  const HomeStack = createNativeStackNavigator<HomeStackParamList>();
  const Stack = createNativeStackNavigator<RootStackParamList>();
  const SearchStack = createNativeStackNavigator<SearchStackParamList>();
  const WatchListStack = createNativeStackNavigator<WatchListStackParamList>();
  const DownloadsStack = createNativeStackNavigator<DownloadsStackParamList>();
  const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
  const hasFirebase =
    Boolean(Constants?.expoConfig?.extra?.hasFirebase) &&
    isFirebaseNativeReady();

  // const showTabBarLables = settingsStorage.showTabBarLabels();

  useEffect(() => {
    let reconciled = false;
    const reconcile = () => {
      if (reconciled) {
        return;
      }
      reconciled = true;
      reconcileDownloadState()
        .then(() => initializeSyncService())
        .catch(error => console.error('Download startup failed:', error));
    };

    if (useDownloadsStore.persist.hasHydrated()) {
      reconcile();
      return;
    }
    return useDownloadsStore.persist.onFinishHydration(reconcile);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        reconcileCompletedDownloadOutputs().catch(error =>
          console.warn('Download foreground reconciliation failed:', error),
        );
        syncFromSharedFolder().catch(error =>
          console.warn('[VegaSync] Foreground sync failed:', error),
        );
      } else {
        publishSyncManifest().catch(error =>
          console.warn('[VegaSync] Background publish failed:', error),
        );
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        syncFromSharedFolder().catch(error =>
          console.warn('[VegaSync] Periodic sync failed:', error),
        );
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const optIn = settingsStorage.isTelemetryOptIn();
    if (hasFirebase) {
      try {
        const crashlytics = getCrashlytics();
        crashlytics && crashlytics().setCrashlyticsCollectionEnabled(optIn);
      } catch {}
      try {
        const analytics = getAnalytics();
        analytics && analytics().setAnalyticsCollectionEnabled(optIn);
      } catch {}
      try {
        const analytics = getAnalytics();
        analytics &&
          analytics().setConsent({
            analytics_storage: optIn,
            ad_storage: optIn,
            ad_user_data: optIn,
            ad_personalization: optIn,
          });
      } catch {}

      // Mark app open
      try {
        const analytics = getAnalytics();
        analytics && analytics().logAppOpen();
      } catch {}
      // Example user property: theme
      try {
        const analytics = getAnalytics();
        analytics &&
          analytics().setUserProperty('theme_preference', 'fixed-neutral');
      } catch {}

      // Initial Crashlytics log
      try {
        const crashlytics = getCrashlytics();
        crashlytics && crashlytics().log('App mounted');
      } catch {}
    }

    const unsubscribe = notifee.onForegroundEvent(({type, detail}) => {
      notificationService.actionHandler({type, detail});
    });
    notifee
      .getInitialNotification()
      .then(initialNotification => {
        if (!initialNotification) {
          return;
        }
        const pressActionId = initialNotification.pressAction?.id;
        return notificationService.actionHandler({
          type:
            pressActionId && pressActionId !== 'default'
              ? EventType.ACTION_PRESS
              : EventType.PRESS,
          detail: initialNotification,
        });
      })
      .catch(error =>
        console.warn('Failed to handle initial notification:', error),
      );
    return () => {
      unsubscribe();
    };
  }, []);

  // Initialize update service
  useEffect(() => {
    // Start automatic update checking at app startup
    updateProvidersService.startAutomaticUpdateCheck();

    // Cleanup on unmount
    return () => {
      updateProvidersService.stopAutomaticUpdateCheck();
    };
  }, []);

  // Initialize DNS over HTTPS
  useEffect(() => {
    syncDohSettings().catch(e =>
      console.warn('[DoH] Failed to sync settings:', e),
    );
  }, []);

  useEffect(() => {
    loadToken();
  }, []);

  useEffect(() => {
    const checkForceUpdate = async () => {
      try {
        const {default: axios} = await import('axios');
        const {default: Application} = await import('expo-application');
        const {runSecurityCheck} = await import('./lib/security/securityCheck');
        const security = await runSecurityCheck();
        if (security.isRooted) {
          setSecurityBlocked(true);
          return;
        }
        const res = await axios.get('https://cinepix.top/api/app/versioncheck', {timeout: 8000});
        const {min_version, force_update} = res.data;
        if (force_update) {
          const current = Application.nativeApplicationVersion || '0.0.0';
          const needs = compareVersionsLocal(current, min_version);
          if (needs) setForceUpdateNeeded(true);
        }
      } catch {}
    };
    checkForceUpdate();
  }, []);

  function compareVersionsLocal(local: string, min: string): boolean {
    const l = local.split('.').map(Number);
    const m = min.split('.').map(Number);
    if (l[0] > m[0]) return false;
    if (l[0] < m[0]) return true;
    if (l[1] > m[1]) return false;
    if (l[1] < m[1]) return true;
    return l[2] < m[2];
  }

  // Initialize app: install providers, setup home, etc.
  useEffect(() => {
    initializeApp(setInitProgress)
      .then(() => setAppReady(true))
      .catch(() => setAppReady(true)); // Even on error, show app
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (useAuthStore.getState().isLoading) {
        useAuthStore.setState({isLoading: false} as any);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync('#000000').catch(() => {});
  }, []);

  useEffect(() => {
    sendHeartbeat();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') sendHeartbeat();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      BootSplash.hide({fade: true}).catch(() => {});
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      BootSplash.hide({fade: true}).catch(() => {});
    }
  }, [isLoading]);

  // Initialize shared folder sync
  useEffect(() => {
    initializeSyncService().catch(e =>
      console.warn('[VegaSync] Startup sync failed:', e),
    );

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        syncFromSharedFolder().catch(e =>
          console.warn('[VegaSync] Foreground sync failed:', e),
        );
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        publishSyncManifest().catch(e =>
          console.warn('[VegaSync] Background publish failed:', e),
        );
      }
    });

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        syncFromSharedFolder().catch(e =>
          console.warn('[VegaSync] Periodic sync failed:', e),
        );
      }
    }, 30000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const isPlayStore = Constants.expoConfig?.extra?.isPlayStore;
    if (!isPlayStore && settingsStorage.isAutoCheckUpdateEnabled()) {
      checkForUpdate(() => {}, settingsStorage.isAutoDownloadEnabled(), false);
    }
  }, []);

  // Show init splash while app is initializing
  if (!appReady || isLoading) {
    return (
      <InitSplash
        progress={isLoading ? 100 : initProgress.progress}
        status={isLoading ? 'Loading profile...' : initProgress.status}
      />
    );
  }

  // Force update screen
  if (forceUpdateNeeded) {
    return <ForceUpdateScreen />;
  }

  // Security blocked screen (rooted device)
  if (securityBlocked) {
    return (
      <View style={{flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 32}}>
        <Image source={require('../assets/logo.png')} style={{width: 120, height: 120, marginBottom: 24}} resizeMode="contain" />
        <AppText role="headlineMedium" style={{color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12}}>Security Warning</AppText>
        <AppText role="bodyMedium" style={{color: '#999', textAlign: 'center', lineHeight: 22}}>
          This app cannot run on a rooted or modified device. Please use a non-rooted device to continue.
        </AppText>
      </View>
    );
  }

  function HomeStackScreen() {
    return (
      <HomeStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'ios_from_right',
          animationDuration: 200,
          freezeOnBlur: true,
        }}>
        <HomeStack.Screen name="Home" component={Home} />
        <HomeStack.Screen name="Info" component={Info} />
        <HomeStack.Screen name="ScrollList" component={ScrollList} />
        <HomeStack.Screen name="Webview" component={WebView} />
      </HomeStack.Navigator>
    );
  }

  function SearchStackScreen() {
    return (
      <SearchStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'ios_from_right',
          animationDuration: 200,
          freezeOnBlur: true,
        }}>
        <SearchStack.Screen name="Search" component={Search} />
        <SearchStack.Screen name="ScrollList" component={ScrollList} />
        <SearchStack.Screen name="Info" component={Info} />
        <SearchStack.Screen name="SearchResults" component={SearchResults} />
        <HomeStack.Screen name="Webview" component={WebView} />
      </SearchStack.Navigator>
    );
  }

  function WatchListStackScreen() {
    return (
      <WatchListStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'ios_from_right',
          animationDuration: 200,
          freezeOnBlur: true,
        }}>
        <WatchListStack.Screen name="WatchList" component={WatchList} />
        <WatchListStack.Screen name="Info" component={Info} />
      </WatchListStack.Navigator>
    );
  }

  function SettingsStackScreen() {
    const insets = useSafeAreaInsets();
    const subpageOptions = {
      contentStyle: {paddingTop: insets.top},
    };

    return (
      <SettingsStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'ios_from_right',
          animationDuration: 200,
          freezeOnBlur: true,
        }}>
        <SettingsStack.Screen name="Settings" component={Settings} />
        <SettingsStack.Screen
          name="Appearance"
          component={Appearance}
          options={subpageOptions}
        />
        {/* <SettingsStack.Screen
          name="DisableProviders"
          component={DisableProviders}
        /> */}
        <SettingsStack.Screen
          name="About"
          component={About}
          options={subpageOptions}
        />
        <SettingsStack.Screen
          name="Preferences"
          component={Preferences}
          options={subpageOptions}
        />
        <SettingsStack.Screen
          name="Extensions"
          component={Extensions}
          options={subpageOptions}
        />
        <SettingsStack.Screen
          name="DownloadsStack"
          component={DownloadsStackScreen}
          options={subpageOptions}
        />
        <SettingsStack.Screen
          name="SubTitlesPreferences"
          component={SubtitlePreference}
          options={subpageOptions}
        />
        <SettingsStack.Screen
          name="ProviderSelect"
          component={ProviderSelect}
          options={subpageOptions}
        />
        <SettingsStack.Screen
          name="Login"
          component={LoginScreen}
          options={subpageOptions}
        />
        <SettingsStack.Screen
          name="Register"
          component={RegisterScreen}
          options={subpageOptions}
        />
        <SettingsStack.Screen
          name="Profile"
          component={ProfileScreen}
          options={subpageOptions}
        />
      </SettingsStack.Navigator>
    );
  }

  function DownloadsStackScreen() {
    return (
      <DownloadsStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'ios_from_right',
          animationDuration: 200,
          freezeOnBlur: true,
        }}>
        <DownloadsStack.Screen name="Downloads" component={Downloads} />
        <DownloadsStack.Screen
          name="DownloadedDetails"
          component={DownloadedDetails}
        />
      </DownloadsStack.Navigator>
    );
  }
  function TabStack() {
    const hideDownloadsTab = useNavigationPreferencesStore(
      state => state.hideDownloadsTab,
    );
    return (
      <Tab.Navigator
        detachInactiveScreens={true}
        tabBar={props => <StreamingTabBar {...props} />}
        screenOptions={{
          animation: 'shift',
          popToTopOnBlur: false,
          tabBarPosition: isLargeScreen ? 'left' : 'bottom',
          headerShown: false,
          freezeOnBlur: true,
          tabBarHideOnKeyboard: true,
        }}>
        <Tab.Screen
          name="HomeStack"
          component={HomeStackScreen}
          options={{
            title: 'Home',
            tabBarIcon: ({focused, color, size}) => (
              <MaterialCommunityIcons
                name={focused ? 'home-variant' : 'home-variant-outline'}
                color={color}
                size={size}
              />
            ),
          }}
        />
        <Tab.Screen
          name="SearchStack"
          component={SearchStackScreen}
          options={{
            title: 'Search',
            tabBarIcon: ({focused, color, size}) => (
              <MaterialCommunityIcons
                name={focused ? 'magnify' : 'magnify'}
                color={color}
                size={size}
              />
            ),
          }}
        />
        <Tab.Screen
          name="WatchListStack"
          component={WatchListStackScreen}
          options={{
            title: 'Watch List',
            tabBarIcon: ({focused, color, size}) => (
              <MaterialCommunityIcons
                name={focused ? 'bookmark' : 'bookmark-outline'}
                color={color}
                size={size}
              />
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
                <MaterialCommunityIcons
                  name={focused ? 'download' : 'download-outline'}
                  color={color}
                  size={size}
                />
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
              <MaterialCommunityIcons
                name={focused ? 'cog' : 'cog-outline'}
                color={color}
                size={size}
              />
            ),
          }}
        />
      </Tab.Navigator>
    );
  }

  return (
    <SafeAreaProvider>
      <SystemBars style="light" />
      <M3ThemeProvider>
        <AppDialogHost />
        <GlobalErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <View className="flex-1 bg-black">
              <NavigationContainer
                ref={navigationRef}
                onReady={async () => {
                  if (pendingDownloadsNavigation) {
                    openDownloadsScreen();
                  }
                  // Hide bootsplash
                  await BootSplash.hide({fade: true});
                  // Track initial screen
                  if (hasFirebase) {
                    try {
                      const route = navigationRef.getCurrentRoute();
                      if (route?.name) {
                        const analytics = getAnalytics();
                        analytics &&
                          (await analytics().logScreenView({
                            screen_name: route.name,
                            screen_class: 'Navigation',
                          }));
                      }
                    } catch {}
                  }
                }}
                onStateChange={async () => {
                  if (hasFirebase) {
                    try {
                      const route = navigationRef.getCurrentRoute();
                      if (route?.name) {
                        const analytics = getAnalytics();
                        analytics &&
                          (await analytics().logScreenView({
                            screen_name: route.name,
                            screen_class: 'Navigation',
                          }));
                      }
                    } catch {}
                  }
                }}
                theme={{
                  fonts: {
                    regular: {
                      fontFamily: 'Inter_400Regular',
                      fontWeight: '400',
                    },
                    medium: {
                      fontFamily: 'Inter_500Medium',
                      fontWeight: '500',
                    },
                    bold: {
                      fontFamily: 'Inter_700Bold',
                      fontWeight: '700',
                    },
                    heavy: {
                      fontFamily: 'Inter_800ExtraBold',
                      fontWeight: '800',
                    },
                  },
                  dark: true,
                  colors: {
                    background: 'transparent',
                    card: 'black',
                    primary: '#E4E4E4',
                    text: 'white',
                    border: 'black',
                    notification: '#E4E4E4',
                  },
                }}>
                <Stack.Navigator
                  screenOptions={{
                    headerShown: false,
                    animation: 'ios_from_right',
                    animationDuration: 200,
                    freezeOnBlur: true,
                    contentStyle: {backgroundColor: 'transparent'},
                  }}>
                  <Stack.Screen name="TabStack" component={TabStack} />
                  <Stack.Screen
                    name="Player"
                    component={Player}
                    options={{
                      orientation: 'landscape',
                      statusBarHidden: true,
                      navigationBarHidden: true,
                      autoHideHomeIndicator: true,
                    }}
                  />
                </Stack.Navigator>
              </NavigationContainer>
              {/* Global WAF / captcha solving dialog, triggered by providers via
                providerContext.openWebView */}
              <WafWebViewDialog />
              {/* Isolated realm that runs untrusted provider code. Must stay
                mounted for the app lifetime: every provider call is dispatched
                into it. */}
              <ProviderSandboxHost />
            </View>
          </QueryClientProvider>
        </GlobalErrorBoundary>
      </M3ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;
