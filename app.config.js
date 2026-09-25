const fs = require('fs');
const path = require('path');

const androidGoogleServicesFile = './google-services.json';
const iosGoogleServicesFile = './GoogleService-Info.plist';
const hasAndroidGoogleServices = fs.existsSync(
  path.resolve(__dirname, androidGoogleServicesFile),
);
const hasIosGooglePlist = fs.existsSync(
  path.resolve(__dirname, iosGoogleServicesFile),
);
const tmdbApiKey =
  process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const proxyApiUrl =
  process.env.PROXY_API_URL ||
  process.env.EXPO_PUBLIC_PROXY_API_URL ||
  process.env.META_PROXY_URL ||
  '';

module.exports = () => {
  const IS_PLAYSTORE = process.env.APP_VARIANT === 'playstore';
  // Firebase (FCM push) is required on every distributed variant; it must not
  // depend on the Play Store toggle — CI builds run with APP_VARIANT=playstore.
  const HAS_FIREBASE = hasAndroidGoogleServices || hasIosGooglePlist;
  const PACKAGE_NAME = 'com.cine.pix';
  const APP_SCHEME = 'cinepix';
  const plugins = [
    './plugins/with-custom-native-modules.js',
    './plugins/android-native-config.js',
    './plugins/with-saf-copy-module.js',
    './plugins/with-uri-permission-module.js',
    './plugins/with-proguard-rules.js',
    './plugins/with-jvm-args.js',
    './plugins/with-android-notification-icons.js',
    './plugins/with-notifee-service.js',
    './plugins/with-android-release-gradle.js',
    './plugins/with-android-signing.js',
    './plugins/with-android-okhttp.js',
    ...(HAS_FIREBASE ? ['@react-native-firebase/app'] : []),
    ...(HAS_FIREBASE ? ['@react-native-firebase/crashlytics'] : []),
    [
      'react-native-video',
      {
        enableNotificationControls: true,
        enableAndroidPictureInPicture: true,
        androidExtensions: {
          useExoplayerRtsp: false,
          useExoplayerSmoothStreaming: true,
          useExoplayerHls: true,
          useExoplayerDash: true,
        },
      },
    ],
    [
      'react-native-google-cast',
      {
        expandedController: true,
      },
    ],
    'react-native-edge-to-edge',
    './plugins/with-dynamic-launcher-splash.js',
    [
      'expo-build-properties',
      {
        android: {
          usePrecompiledHeaders: true,
          extraMavenRepos: [
            '../../node_modules/@notifee/react-native/android/libs',
          ],
          enableProguardInReleaseBuilds: true,
          splits: {
            abi: { enable: true, universalApk: true },
          },
          buildVariants: {
            release: {
              minifyEnabled: true,
              shrinkResources: true,
              splits: {
                abi: {
                  enable: true,
                  reset: false,
                  include: ['armeabi-v7a', 'arm64-v8a'],
                },
              },
            },
            debug: { minifyEnabled: false, debuggable: true },
          },
        },
        ios: {},
      },
    ],
    'expo-font',
    'expo-status-bar',
  ];
  return {
    expo: {
      backgroundColor: '#000000',
      name: 'Cinepix',
      scheme: APP_SCHEME,
      displayName: 'Cinepix',
      icon: './assets/icon.png',
      jsEngine: 'hermes',
      newArchEnabled: true,
      autolinking: { exclude: ['expo-splash-screen', 'react-native-fullscreen-chz', 'react-native-worklets', 'react-native-reanimated'] },
      plugins,
      slug: 'cinepix',
       version: '5.7.6',
      updates: {
        // Self-hosted OTA (expo-updates protocol) served from cinepix.top.
        url: 'https://cinepix.top/ota-endpoint/index.php?action=manifest',
        fallbackToCacheTimeout: 0,
        checkAutomatically: 'ON_LOAD',
        requestHeaders: {
          'X-App-Key': '78a0e573dfd894d443685159b2e71e2f',
        },
      },
      runtimeVersion: { policy: 'appVersion' },
      userInterfaceStyle: 'dark',
      experiments: {
        reactCompiler: true,
      },
      android: {
        ...(hasAndroidGoogleServices
          ? { googleServicesFile: androidGoogleServicesFile }
          : {}),
        minSdkVersion: 28,
        package: PACKAGE_NAME,
        versionCode: 208,
        permissions: [
          'FOREGROUND_SERVICE',
          'FOREGROUND_SERVICE_DATA_SYNC',
          'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
          'ACCESS_NETWORK_STATE',
          'INTERNET',
          'WRITE_SETTINGS',
          // MovieBox-style one-tap "Allow limited / Allow all" dialog so users
          // can browse their own video files in the Downloads screen.
          'android.permission.READ_MEDIA_VIDEO',
          'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
          // Required for the one-time "All files access" toggle so downloads can
          // auto-save into Download/CineBD without the SAF picker.
          'MANAGE_EXTERNAL_STORAGE',
        ],
        blockedPermissions: [
          'android.permission.READ_EXTERNAL_STORAGE',
          'android.permission.WRITE_EXTERNAL_STORAGE',
          // Play Protect flags APKs requesting install rights / overlay / secure settings.
          // Updates are delivered via the browser + package installer UI instead.
          'android.permission.REQUEST_INSTALL_PACKAGES',
          'android.permission.SYSTEM_ALERT_WINDOW',
          'android.permission.WRITE_SETTINGS',
          // MANAGE_EXTERNAL_STORAGE is kept available (not blocked) so downloads can
          // auto-save into a public Downloads/CineBD folder after a one-time "All
          // files access" toggle — no SAF picker needed.
          ...(IS_PLAYSTORE
            ? [
              'com.google.android.gms.permission.AD_ID',
            ]
            : []),
        ],
        queries: [
          { action: 'VIEW', data: { scheme: 'http' } },
          { action: 'VIEW', data: { scheme: 'https' } },
          { action: 'VIEW', data: { scheme: 'vlc' } },
        ],
        allowBackup: true,
        adaptiveIcon: {
          foregroundImage: './assets/adaptive_icon.png',
          backgroundColor: '#0a0a0a',
        },
        launchMode: 'singleTask',
        supportsPictureInPicture: true,
      },
      ios: {
        ...(hasIosGooglePlist
          ? { googleServicesFile: iosGoogleServicesFile }
          : {}),
      },
      platforms: ['ios', 'android'],
      extra: {
        eas: {
          projectId: 'YOUR_OWN_PROJECT_ID_HERE',
        },
        hasFirebase: HAS_FIREBASE,
        isPlayStore: IS_PLAYSTORE,
        tmdbApiKey,
        proxyApiUrl,
      },
    },
  };
};
