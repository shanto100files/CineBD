/**
 * Android TV support:
 *  - LEANBACK_LAUNCHER intent-filter so the app appears on TV home screens.
 *  - android.software.leanback feature (required=false: the same APK still
 *    installs on phones and keeps both launcher entries there).
 *  - touchscreen feature marked not-required (TV boxes have no touchscreen;
 *    installers/stores reject apps that require one).
 *  - TV banner (320x180 drawable + android:banner attr) for the TV launcher.
 *  - landscape-only screenOrientation on the main activity (TV panels are
 *    fixed landscape; RN orientation calls are skipped on TV at runtime).
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

    const activity = app?.activity?.[0];
    if (activity) {
      const filters = activity['intent-filter'] || [];
      let mainFilter = filters.find(
        f =>
          Array.isArray(f['action']) &&
          f['action'].some(
            a => a?.$?.['android:name'] === 'android.intent.action.MAIN',
          ),
      );
      if (!mainFilter) {
        mainFilter = {
          action: [{$: {'android:name': 'android.intent.action.MAIN'}}],
          category: [],
        };
        filters.push(mainFilter);
      }
      const categories = (mainFilter.category =
        mainFilter.category && Array.isArray(mainFilter.category)
          ? mainFilter.category
          : []);
      const hasCategory = name =>
        categories.some(c => c?.$?.['android:name'] === name);
      if (!hasCategory('android.intent.category.LAUNCHER')) {
        categories.push({$: {'android:name': 'android.intent.category.LAUNCHER'}});
      }
      if (!hasCategory('android.intent.category.LEANBACK_LAUNCHER')) {
        categories.push({
          $: {'android:name': 'android.intent.category.LEANBACK_LAUNCHER'},
        });
      }
      activity['intent-filter'] = filters;
    }

    return modConfig;
  });

  return config;
};

module.exports = withAndroidTV;
