import {
  DevSettings,
  ToastAndroid,
  View,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import React, {useCallback, useMemo} from 'react';
import {
  settingsStorage,
  clearAllMMKVStorage,
  ProviderExtension,
} from '../../lib/storage';
import * as Updates from 'expo-updates';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import useContentStore from '../../lib/zustand/contentStore';
import {
  NativeStackScreenProps,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {SettingsStackParamList, TabStackParamList} from '../../App';
import {MaterialIcons} from '@expo/vector-icons';
import Animated, {FadeInDown, FadeInUp, Layout} from 'react-native-reanimated';
import {useNavigation} from '@react-navigation/native';
import RenderProviderFlagIcon from '../../components/RenderProviderFLagIcon';
import useNavigationPreferencesStore from '../../lib/zustand/navigationPreferencesStore';
import DnsPreference from './components/DnsPreference';
import IconButton from '../../components/ui/IconButton';
import SettingsRow from '../../components/ui/SettingsRow';
import SettingsSection from '../../components/ui/SettingsSection';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {showAppDialog} from '../../lib/zustand/appDialogStore';
import {clearAppCache} from '../../lib/clearAppCache';
import {useAuthStore} from '../../lib/zustand/authStore';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Settings'>;

const AnimatedSection = ({
  delay,
  children,
}: {
  delay: number;
  children: React.ReactNode;
}) => (
  <Animated.View
    entering={FadeInDown.duration(200).delay(delay)}
    layout={Layout.duration(150)}>
    {children}
  </Animated.View>
);

const Settings = ({navigation}: Props) => {
  const tabNavigation =
    useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const colors = useM3Colors();
  const {user, isPremium, isLoggedIn, logout} = useAuthStore();
  const provider = useContentStore(state => state.provider);
  const setProvider = useContentStore(state => state.setProvider);
  const installedProviders = useContentStore(state => state.installedProviders);
  const hideDownloadsTab = useNavigationPreferencesStore(
    state => state.hideDownloadsTab,
  );

  const handleProviderSelect = useCallback(
    (item: ProviderExtension) => {
      setProvider(item);
      // Add haptic feedback
      if (settingsStorage.isHapticFeedbackEnabled()) {
        ReactNativeHapticFeedback.trigger('virtualKey', {
          enableVibrateFallback: true,
          ignoreAndroidSystemSettings: false,
        });
      }
      // Navigate to home screen
      tabNavigation.navigate('HomeStack');
    },
    [setProvider, tabNavigation],
  );

  const renderProviderItem = useCallback(
    (item: ProviderExtension, isSelected: boolean) => (
      <View
        key={item.value}
        style={{
          backgroundColor: isSelected ? colors.secondaryContainer : '#2A2A2A',
          borderColor: isSelected ? colors.primary : '#5A5A5A',
          borderRadius: 20,
          borderWidth: isSelected ? 2 : 1,
          height: 84,
          marginRight: 12,
          overflow: 'hidden',
          width: 132,
        }}>
        <TouchableOpacity
          activeOpacity={0.65}
          onPress={() => handleProviderSelect(item)}
          style={{flex: 1}}>
          <View className="flex-col items-center justify-center h-full p-3">
            <RenderProviderFlagIcon type={item.type} />
            <AppText
              numberOfLines={1}
              role="labelMediumEmphasized"
              style={{
                color: isSelected
                  ? colors.onSecondaryContainer
                  : colors.onSurface,
                marginTop: 9,
                textAlign: 'center',
              }}>
              {item.display_name}
            </AppText>
            {isSelected && (
              <View style={{position: 'absolute', right: 8, top: 8}}>
                <MaterialIcons
                  name="check-circle"
                  size={18}
                  color={colors.onSecondaryContainer}
                />
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    ),
    [colors, handleProviderSelect],
  );

  const providersList = useMemo(
    () =>
      installedProviders.map(item =>
        renderProviderItem(item, provider.value === item.value),
      ),
    [installedProviders, provider.value, renderProviderItem],
  );

  const clearCacheHandler = useCallback(async () => {
    if (settingsStorage.isHapticFeedbackEnabled()) {
      ReactNativeHapticFeedback.trigger('virtualKey', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    }
    await clearAppCache();
    ToastAndroid.show('App cache cleared', ToastAndroid.SHORT);
  }, []);

  const eraseAllLocalData = useCallback(async () => {
    clearAllMMKVStorage();
    if (Updates.isEnabled) {
      await Updates.reloadAsync();
      return;
    }
    DevSettings.reload('All MMKV storage erased');
  }, []);

  const confirmEraseAllLocalData = useCallback(() => {
    showAppDialog({
      title: 'Erase all local data?',
      message:
        'This permanently erases every Vega MMKV store, including settings, installed provider data, Watchlist, Continue watching, download records, and cached state. This cannot be undone. Downloaded media files on disk are not deleted.',
      variant: 'error',
      actions: [
        {label: 'Cancel'},
        {
          label: 'Erase everything',
          variant: 'destructive',
          onPress: eraseAllLocalData,
        },
      ],
    });
  }, [eraseAllLocalData]);

  return (
    <Animated.ScrollView
      className="h-full w-full bg-m3-background"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bounces={true}
      overScrollMode="always"
      entering={FadeInUp.springify()}
      layout={Layout.springify()}
      contentContainerStyle={{
        paddingTop: 15,
        paddingBottom: 40,
        flexGrow: 1,
      }}>
      <View style={{paddingHorizontal: 20}}>
        <Animated.View entering={FadeInUp.springify()} style={{marginBottom: 28}}>
          <AppText
            role="headlineLargeEmphasized"
            style={{color: colors.onBackground, fontSize: 32, fontWeight: '800'}}>
            Settings
          </AppText>
          <View
            style={{
              marginTop: 6,
              height: 3,
              width: 40,
              borderRadius: 2,
              backgroundColor: colors.primary,
            }}
          />
        </Animated.View>

        {/* Account section */}
        <AnimatedSection delay={50}>
          {isLoggedIn ? (
            <View
              style={{
                borderRadius: 20,
                overflow: 'hidden',
                marginBottom: 24,
                backgroundColor: colors.surfaceContainerLow,
                borderWidth: 1,
                borderColor: colors.outlineVariant,
              }}>
              {/* Premium user header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  gap: 14,
                }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: colors.primaryContainer,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: colors.primary,
                  }}>
                  <MaterialIcons
                    name="person"
                    size={26}
                    color={colors.onPrimaryContainer}
                  />
                </View>
                <View style={{flex: 1}}>
                  <AppText
                    role="bodyLarge"
                    style={{color: colors.onSurface, fontWeight: '700', fontSize: 16}}>
                    {user?.username || 'Unknown'}
                  </AppText>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3}}>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: isPremium ? colors.primaryContainer : colors.surfaceContainerHigh,
                      }}>
                      <AppText
                        role="labelSmall"
                        style={{
                          color: isPremium ? colors.primary : colors.onSurfaceVariant,
                          fontWeight: '700',
                          fontSize: 10,
                          letterSpacing: 0.5,
                        }}>
                        {isPremium ? '★ PREMIUM' : 'FREE'}
                      </AppText>
                    </View>
                  </View>
                </View>
              </View>
              <View style={{height: 1, backgroundColor: colors.outlineVariant}} />
              <SettingsRow
                title="Profile"
                icon="person"
                iconBg={colors.primaryContainer}
                iconColor={colors.primary}
                onPress={() => navigation.navigate('Profile')}
              />
              <SettingsRow
                title="Logout"
                icon="logout"
                iconBg={colors.errorContainer}
                iconColor={colors.error}
                divider={false}
                onPress={() => {
                  showAppDialog({
                    title: 'Logout?',
                    message: 'You will need to login again to access your account.',
                    variant: 'warning',
                    actions: [
                      {label: 'Cancel'},
                      {
                        label: 'Logout',
                        variant: 'destructive',
                        onPress: () => {
                          logout();
                        },
                      },
                    ],
                  });
                }}
              />
            </View>
          ) : (
            <SettingsSection title="Account">
              <SettingsRow
                title="Login"
                description="Login to sync watchlist & continue watching"
                icon="login"
                iconBg={colors.primaryContainer}
                iconColor={colors.primary}
                onPress={() => navigation.navigate('Login')}
              />
              <SettingsRow
                title="Register"
                description="Create a new account"
                icon="person-add"
                iconBg={colors.tertiaryContainer}
                iconColor={colors.onTertiaryContainer}
                divider={false}
                onPress={() => navigation.navigate('Register')}
              />
            </SettingsSection>
          )}
        </AnimatedSection>

        <AnimatedSection delay={80}>
          <SettingsSection title="Language">
            <SettingsRow
              title="Preferred Language"
              description={settingsStorage.getPreferredLanguage()}
              icon="translate"
              onPress={() => {
                const langs = ['Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'All'];
                showAppDialog({
                  title: 'Select Language',
                  message: 'Filter home content by language',
                  actions: langs.map(l => ({
                    label: l,
                    onPress: () => {
                      settingsStorage.setPreferredLanguage(l);
                      ToastAndroid.show(`Language set to ${l}`, ToastAndroid.SHORT);
                    },
                  })),
                });
              }}
            />
          </SettingsSection>
        </AnimatedSection>

        {/* Content provider section - Admin only */}
        {user?.is_admin && (
        <AnimatedSection delay={100}>
          <View style={{marginBottom: 24}}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 10,
                paddingHorizontal: 4,
              }}>
              <View
                style={{
                  width: 3,
                  height: 14,
                  borderRadius: 2,
                  backgroundColor: colors.primary,
                  marginRight: 8,
                }}
              />
              <AppText
                role="labelLarge"
                style={{
                  color: colors.primary,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  fontSize: 11,
                }}>
                Active Provider
              </AppText>
            </View>
            <View
              style={{
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
                borderRadius: 20,
                borderWidth: 1,
                height: 108,
                justifyContent: 'center',
              }}>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                style={{flexGrow: 0}}
                contentContainerStyle={{
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  gap: 10,
                }}>
                {providersList}
                {installedProviders.length === 0 && (
                  <AppText
                    role="bodyMedium"
                    style={{color: colors.onSurfaceVariant}}>
                    No providers installed
                  </AppText>
                )}
              </ScrollView>
            </View>
          </View>
          <SettingsSection title="Provider tools">
            <SettingsRow
              title="Home Provider"
              description={settingsStorage.getHomeProvider() || 'All providers (aggregated)'}
              icon="home-outline"
              iconBg={colors.primaryContainer}
              iconColor={colors.onPrimaryContainer}
              onPress={() => navigation.navigate('ProviderSelect')}
            />
            <SettingsRow
              title="Provider Manager"
              description="Install, update, and test provider extensions"
              icon="puzzle-outline"
              iconBg={colors.secondaryContainer}
              iconColor={colors.onSecondaryContainer}
              divider={false}
              onPress={() => navigation.navigate('Extensions')}
            />
          </SettingsSection>
        </AnimatedSection>
        )}

        {/* Network Section */}
        <AnimatedSection delay={150}>
          <SettingsSection title="Network">
            <DnsPreference />
          </SettingsSection>
        </AnimatedSection>

        {/* Main options section */}
        <AnimatedSection delay={200}>
          <SettingsSection title="Options">
            <SettingsRow
              title="Appearance"
              icon="palette-outline"
              iconBg={'#3D1F5C'}
              iconColor={'#CE93D8'}
              onPress={() => navigation.navigate('Appearance')}
            />
            <SettingsRow
              title="Subtitle Style"
              icon="subtitles-outline"
              iconBg={'#1A3A4A'}
              iconColor={'#80DEEA'}
              onPress={() => navigation.navigate('SubTitlesPreferences')}
            />
            {hideDownloadsTab && (
              <SettingsRow
                title="Downloads"
                icon="download-circle-outline"
                iconBg={'#1A3A2A'}
                iconColor={'#80CBC4'}
                onPress={() => navigation.navigate('DownloadsStack')}
              />
            )}
            <SettingsRow
              title="Preferences"
              icon="tune-variant"
              iconBg={'#3A2A1A'}
              iconColor={'#FFCC80'}
              divider={false}
              onPress={() => navigation.navigate('Preferences')}
            />
          </SettingsSection>
        </AnimatedSection>

        {/* Data Management section */}
        <AnimatedSection delay={300}>
          <SettingsSection title="Data Management">
            <SettingsRow
              title="Clear Cache"
              icon="broom"
              iconBg={colors.surfaceContainerHighest}
              iconColor={colors.onSurfaceVariant}
              trailing={
                <IconButton
                  icon="delete-outline"
                  label="Clear cache"
                  onPress={clearCacheHandler}
                />
              }
            />
            <SettingsRow
              title="Erase all local data"
              description="Permanently removes all settings and data"
              icon="delete-alert-outline"
              iconBg={colors.errorContainer}
              iconColor={colors.error}
              divider={false}
              onPress={confirmEraseAllLocalData}
            />
          </SettingsSection>
        </AnimatedSection>

        <AnimatedSection delay={400}>
          <SettingsSection title="Help & Support">
            <SettingsRow
              title="Report Bug / Request"
              description="Report issues or request content"
              icon="alert-circle-outline"
              iconBg={colors.errorContainer}
              iconColor={colors.error}
              onPress={() => navigation.navigate('Report')}
            />
            <SettingsRow
              title="ব্যবহারবিধি"
              description="Terms of Service"
              icon="file-document-outline"
              iconBg={'#1A3A2A'}
              iconColor={'#80CBC4'}
              divider={false}
              onPress={() => navigation.navigate('TermsOfService')}
            />
          </SettingsSection>
        </AnimatedSection>

        <AnimatedSection delay={450}>
          <SettingsSection title="About">
            <SettingsRow
              title="About CineBD"
              icon="information-outline"
              iconBg={colors.primaryContainer}
              iconColor={colors.onPrimaryContainer}
              onPress={() => navigation.navigate('About')}
            />
            <SettingsRow
              title="Cinepix.top"
              description="Visit our website"
              icon="web"
              iconBg={'#1A2A3A'}
              iconColor={'#90CAF9'}
              divider={false}
              onPress={() => Linking.openURL('https://cinepix.top')}
            />
          </SettingsSection>
        </AnimatedSection>
      </View>
    </Animated.ScrollView>
  );
};

export default Settings;
