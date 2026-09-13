const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withAndroidColors,
  withAndroidStyles,
  withDangerousMod,
} = require('expo/config-plugins');

const variants = [
  {id: 'White', color: '#FFFFFFFF', enabled: true},
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

const removeLauncherIntent = activity => {
  activity['intent-filter'] = (activity['intent-filter'] || []).filter(
    filter =>
      !filter.action?.some(
        action => action?.$?.['android:name'] === 'android.intent.action.MAIN',
      ),
  );
};

const withLauncherManifest = config =>
  withAndroidManifest(config, manifestConfig => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) {
      return manifestConfig;
    }
    const mainActivity = application.activity?.find(
      activity => activity?.$?.['android:name'] === '.MainActivity',
    );
    if (mainActivity) {
      removeLauncherIntent(mainActivity);
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
