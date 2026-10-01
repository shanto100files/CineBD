/**
 * Android TV support:
 *  - LEANBACK_LAUNCHER category on the existing launcher entry (the alias
 *    from with-dynamic-launcher-splash) so the app appears on TV home
 *    screens. Never creates its own launcher entry.
 *  - android.software.leanback feature (required=false: the same APK still
 *    installs on phones).
 *  - touchscreen feature marked not-required (TV boxes have no touchscreen;
 *    installers/stores reject apps that require one).
 *  - TV banner (320x180 drawable + android:banner attr) for the TV launcher.
 */
const fs = require('fs');
const path = require('path');
const {withAndroidManifest, withDangerousMod} = require('expo/config-plugins');

const withAndroidTV = config => {
  // 1) Copy the TV banner drawable into the generated android project.
  config = withDangerousMod(config, [
    'android',
    async modConfig => {
      const platformProjectRoot = modConfig.modRequest?.platformProjectRoot; // <project>/android
      const projectRoot = modConfig.modRequest?.projectRoot; // <project>
      if (!platformProjectRoot || !projectRoot) {
        console.warn('with-android-tv: modRequest paths missing, banner skipped');
        return modConfig;
      }
      const resDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'res');
      const drawableDir = path.join(resDir, 'drawable');
      const bannerSrc = path.join(projectRoot, 'assets', 'tv-banner.png');
      if (fs.existsSync(bannerSrc)) {
        fs.mkdirSync(drawableDir, {recursive: true});
        fs.copyFileSync(bannerSrc, path.join(drawableDir, 'tv_banner.png'));
      } else {
        console.warn('with-android-tv: assets/tv-banner.png not found, banner skipped');
      }
      return modConfig;
    },
  ]);

  // 2) Manifest mods: features + banner + LEANBACK_LAUNCHER intent-filter.
  config = withAndroidManifest(config, modConfig => {
    const manifest = modConfig.modResults;
    const app = manifest.manifest.application?.[0];
    if (app?.$) {
      app.$['android:banner'] = '@drawable/tv_banner';
      if (app.activity && app.activity[0]?.$) {
        app.activity[0].$['android:banner'] = '@drawable/tv_banner';
      }
    }

    const usesFeature = manifest.manifest['uses-feature'] || [];
    const upsertFeature = (name, required) => {
      const existing = usesFeature.find(f => f?.$?.['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = required;
      } else {
        usesFeature.push({
          $: {'android:name': name, 'android:required': required},
        });
      }
    };
    upsertFeature('android.software.leanback', 'false');
    upsertFeature('android.hardware.touchscreen', 'false');
    manifest.manifest['uses-feature'] = usesFeature;

    // Add LEANBACK_LAUNCHER to every existing MAIN launcher entry — activities
    // AND activity-aliases (the single launcher component is the
    // LauncherWhite alias created by with-dynamic-launcher-splash).
    // This must NEVER create a MAIN filter or add the phone LAUNCHER
    // category: Expo may run this mod AFTER the splash plugin stripped the
    // launcher intents, and re-creating them produced a second launcher icon
    // on phones (the v5.7.15/16 double-app bug).
    const isLauncherFilter = filter =>
      filter.action?.some(
        a => a?.$?.['android:name'] === 'android.intent.action.MAIN',
      )
      && filter.category?.some(c =>
        ['android.intent.category.LAUNCHER', 'android.intent.category.LEANBACK_LAUNCHER']
          .includes(c?.$?.['android:name']),
      );
    const ensureLeanback = component => {
      for (const filter of component['intent-filter'] || []) {
        if (!isLauncherFilter(filter)) {
          continue;
        }
        filter.category = Array.isArray(filter.category)
          ? filter.category
          : [];
        if (
          !filter.category.some(
            c => c?.$?.['android:name']
              === 'android.intent.category.LEANBACK_LAUNCHER',
          )
        ) {
          filter.category.push({
            $: {'android:name': 'android.intent.category.LEANBACK_LAUNCHER'},
          });
        }
      }
    };
    for (const activity of app?.activity || []) {
      ensureLeanback(activity);
    }
    for (const alias of app?.['activity-alias'] || []) {
      ensureLeanback(alias);
    }

    return modConfig;
  });

  return config;
};

module.exports = withAndroidTV;
