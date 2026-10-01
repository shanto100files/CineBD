const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withAndroidColors,
  withAndroidStyles,
  withDangerousMod,
} = require('expo/config-plugins');

const variants = [
  {id: 'White', color: '#080C18', enabled: true},
  {id: 'Tomato', color: '#FFFF6347', enabled: false},
  {id: 'Gray', color: '#FF9E9E9E', enabled: false},
  {id: 'Blue', color: '#FF2196F3', enabled: false},
  {id: 'Lavender', color: '#FFB2A4D4', enabled: false},
];

const setStyleItem = (style, name, value) => {
  style.item = Array.isArray(style.item) ? style.item : [];
  const existing = style.item.find(item => item?.$?.name === name);
  if (existing) {
    existing._ = value;
    return;
  }
  style.item.push({$: {name}, _: value});
};

const upsertStyle = (styles, name, parent, items = []) => {
  let style = styles.find(entry => entry?.$?.name === name);
  if (!style) {
    style = {$: {name}, item: []};
    styles.push(style);
  }
  if (parent) {
    style.$.parent = parent;
  }
  for (const [itemName, value] of items) {
    setStyleItem(style, itemName, value);
  }
};

const createLauncherAlias = (packageName, variant) => ({
  $: {
    'android:name': `.Launcher${variant.id}`,
    'android:enabled': String(variant.enabled),
    'android:exported': 'true',
    'android:icon': `@drawable/ic_launcher_${variant.id.toLowerCase()}`,
    'android:roundIcon': `@drawable/ic_launcher_${variant.id.toLowerCase()}`,
    'android:targetActivity': '.MainActivity',
    'android:theme': '@style/AppTheme',
  },
  'intent-filter': [
    {
      action: [{$: {'android:name': 'android.intent.action.MAIN'}}],
      category: [{$: {'android:name': 'android.intent.category.LAUNCHER'}}],
    },
  ],
});

// The activity can be registered as `.MainActivity` (relative, older Expo
// templates) or `com.<pkg>.MainActivity` (fully-qualified, current templates).
// Only matching one form left the other intact and produced TWO launcher
// entries in the installed app: the alias plus the untouched activity.
const isMainActivity = (activity, packageName) => {
  const name = activity?.$?.['android:name'];
  return name === '.MainActivity' || name === `${packageName}.MainActivity`;
};

const removeLauncherIntent = activity => {
  activity['intent-filter'] = (activity['intent-filter'] || []).flatMap(filter => {
    const actions = (filter.action || []).map(
      action => action?.$?.['android:name'],
    );
    if (!actions.includes('android.intent.action.MAIN')) {
      return [filter];
    }
    const categories = (filter.category || []).map(
      category => category?.$?.['android:name'],
    );
    if (categories.includes('android.intent.category.LEANBACK_LAUNCHER')) {
      // Keep MAIN + LEANBACK_LAUNCHER (added by with-android-tv) so the app
      // still shows on TV home screens; drop only the phone LAUNCHER
      // category so the alias stays the sole phone launcher entry.
      filter.category = (filter.category || []).filter(
        category =>
          category?.$?.['android:name']
            !== 'android.intent.category.LAUNCHER',
      );
      return [filter];
    }
    // No TV launcher on this filter: drop the whole MAIN filter — the
    // activity-alias below provides the single phone launcher entry.
    return [];
  });
};

const withLauncherManifest = config =>
  withAndroidManifest(config, manifestConfig => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) {
      return manifestConfig;
    }
    const mainActivity = application.activity?.find(activity =>
      isMainActivity(activity, manifestConfig.android?.package),
    );
    if (mainActivity) {
      removeLauncherIntent(mainActivity);
    } else {
      console.warn(
        'with-dynamic-launcher-splash: MainActivity not found in manifest; '
          + 'leaving its launcher intent untouched',
      );
    }
    application['activity-alias'] = variants
      .filter(variant => variant.enabled)
      .map(variant => createLauncherAlias(manifestConfig.android?.package, variant));
    return manifestConfig;
  });

const withLauncherStyles = config =>
  withAndroidStyles(config, stylesConfig => {
    const styles = stylesConfig.modResults.resources.style || [];
    const baseBootTheme = styles.find(s => s?.$?.name === 'BootTheme');
    const parentTheme = baseBootTheme?.$?.parent || 'Theme.BootSplash';
    for (const variant of variants) {
      upsertStyle(styles, `BootTheme_${variant.id}`, parentTheme, [
        ['android:windowBackground', variant.color],
        ['android:windowSplashScreenBackground', variant.color],
        ['android:windowSplashScreenAnimatedIcon', '@mipmap/ic_launcher_foreground'],
        ['android:windowSplashScreenIconBackgroundColor', '@android:color/transparent'],
        ['android:windowSplashScreenBrandingImage', '@null'],
      ]);
    }
    stylesConfig.modResults.resources.style = styles;
    return stylesConfig;
  });

const withLauncherColors = config =>
  withAndroidColors(config, colorsConfig => {
    const resources = colorsConfig.modResults.resources;
    if (!resources.color) resources.color = [];
    const existing = resources.color.find(c => c?.$?.name === 'iconBackground');
    if (existing) {
      existing._ = '#0a0a0a';
    } else {
      resources.color.push({$: {name: 'iconBackground'}, _: '#0a0a0a'});
    }
    return colorsConfig;
  });

const writeLauncherResources = resRoot => {
  const drawable = path.join(resRoot, 'drawable');
  const drawableV26 = path.join(resRoot, 'drawable-v26');
  fs.mkdirSync(drawable, {recursive: true});
  fs.mkdirSync(drawableV26, {recursive: true});
  for (const variant of variants) {
    if (!variant.enabled) continue;
    const id = variant.id.toLowerCase();
    fs.writeFileSync(
      path.join(drawable, `ic_launcher_foreground_${id}.xml`),
      `<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:gravity="center"
    android:src="@mipmap/ic_launcher_foreground" />\n`,
    );
    fs.writeFileSync(
      path.join(drawableV26, `ic_launcher_${id}.xml`),
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackground" />
    <foreground android:drawable="@drawable/ic_launcher_foreground_${id}" />
</adaptive-icon>\n`,
    );
  }
};

const withLauncherResources = config =>
  withDangerousMod(config, [
    'android',
    async modConfig => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const resRoot = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
      );
      writeLauncherResources(resRoot);
      return modConfig;
    },
  ]);

module.exports = function withDynamicLauncherSplash(config) {
  config = withLauncherManifest(config);
  config = withLauncherStyles(config);
  config = withLauncherColors(config);
  return withLauncherResources(config);
};
