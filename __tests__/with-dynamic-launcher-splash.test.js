/**
 * Regression tests for the double-launcher-icon bug.
 *
 * v5.7.15/16 shipped TWO phone launcher entries:
 *  - com.cine.pix.MainActivity with MAIN + LAUNCHER (+ LEANBACK_LAUNCHER)
 *  - com.cine.pix.LauncherWhite alias with MAIN + LAUNCHER (enabled)
 *
 * Two failure modes had to be closed:
 *  1. The splash plugin only matched ".MainActivity", but current Expo
 *     templates emit the fully-qualified name — strip silently no-oped.
 *  2. Expo may run with-android-tv's manifest mod AFTER the splash plugin;
 *     the TV plugin re-created a MAIN+LAUNCHER filter after the strip.
 *
 * Final invariant regardless of plugin order: exactly ONE launcher component
 * (the enabled alias) carrying MAIN + LAUNCHER + LEANBACK_LAUNCHER.
 */
jest.mock('expo/config-plugins', () => ({
  withAndroidManifest: (config, fn) => fn(config),
  withAndroidStyles: (config, fn) => config,
  withAndroidColors: (config, fn) => config,
  withDangerousMod: (config, fn) => config,
}));

const MAIN = 'android.intent.action.MAIN';
const LAUNCHER = 'android.intent.category.LAUNCHER';
const LEANBACK = 'android.intent.category.LEANBACK_LAUNCHER';

const withDynamicLauncherSplash = require('../plugins/with-dynamic-launcher-splash');
const withAndroidTV = require('../plugins/with-android-tv');

const actionNames = filter =>
  (filter.action || []).map(a => a?.$?.['android:name']);
const categoryNames = filter =>
  (filter.category || []).map(c => c?.$?.['android:name']);
const isLauncherFilter = filter =>
  actionNames(filter).includes(MAIN)
  && (categoryNames(filter).includes(LAUNCHER)
    || categoryNames(filter).includes(LEANBACK));

const buildConfig = ({activityName, extraFilters = []}) => ({
  android: {package: 'com.cine.pix'},
  modResults: {
    manifest: {
      application: [
        {
          activity: [
            {
              $: {'android:name': activityName},
              'intent-filter': [
                {
                  action: [{$: {'android:name': 'android.intent.action.VIEW'}}],
                  category: [
                    {$: {'android:name': 'android.intent.category.DEFAULT'}},
                  ],
                },
                ...extraFilters,
              ],
            },
            {$: {'android:name': 'com.reactnative.googlecast.OtherActivity'}},
          ],
        },
      ],
    },
  },
});

const launcherComponents = config => {
  const app = config.modResults.manifest.application[0];
  return [
    ...app.activity
      .filter(activity => (activity['intent-filter'] || []).some(isLauncherFilter))
      .map(activity => activity.$['android:name']),
    ...(app['activity-alias'] || [])
      .filter(alias => (alias['intent-filter'] || []).some(isLauncherFilter))
      .map(alias => alias.$['android:name']),
  ];
};

const mainLauncherFilter = {
  action: [{$: {'android:name': MAIN}}],
  category: [{$: {'android:name': LAUNCHER}}],
};

describe('launcher manifest: single entry regardless of plugin order', () => {
  test('order TV -> splash (recreate-risk order): TV plugin adds LEANBACK, splash strips it, alias is the only entry', () => {
    const config = withAndroidTV(
      buildConfig({activityName: 'com.cine.pix.MainActivity', extraFilters: [mainLauncherFilter]}),
    );
    const result = withDynamicLauncherSplash(config);

    expect(launcherComponents(result)).toEqual(['.LauncherWhite']);
    const app = result.modResults.manifest.application[0];
    const alias = app['activity-alias'][0];
    expect(alias.$['android:enabled']).toBe('true');
    expect(categoryNames(alias['intent-filter'][0])).toEqual([LAUNCHER, LEANBACK]);
    // Deep-link VIEW filter survives on MainActivity.
    const mainActivity = app.activity[0];
    expect(
      mainActivity['intent-filter'].some(f => actionNames(f).includes('android.intent.action.VIEW')),
    ).toBe(true);
  });

  test('order splash -> TV: TV never recreates the stripped activity filter, only upgrades the alias', () => {
    const config = withDynamicLauncherSplash(
      buildConfig({activityName: 'com.cine.pix.MainActivity', extraFilters: [mainLauncherFilter]}),
    );
    const result = withAndroidTV(config);

    expect(launcherComponents(result)).toEqual(['.LauncherWhite']);
    const app = result.modResults.manifest.application[0];
    const mainActivity = app.activity[0];
    // No MAIN filter may reappear on the activity.
    expect(
      (mainActivity['intent-filter'] || []).some(f => actionNames(f).includes(MAIN)),
    ).toBe(false);
    const alias = app['activity-alias'][0];
    expect(categoryNames(alias['intent-filter'][0])).toContain(LAUNCHER);
    expect(categoryNames(alias['intent-filter'][0])).toContain(LEANBACK);
  });

  test('fully-qualified MainActivity (current Expo template): stripped in one pass, exactly one alias', () => {
    const result = withDynamicLauncherSplash(
      buildConfig({activityName: 'com.cine.pix.MainActivity', extraFilters: [mainLauncherFilter]}),
    );
    expect(launcherComponents(result)).toEqual(['.LauncherWhite']);
    expect(
      result.modResults.manifest.application[0]['activity-alias'][0].$['android:name'],
    ).toBe('.LauncherWhite');
  });

  test('relative .MainActivity (older template): also stripped in one pass', () => {
    const result = withDynamicLauncherSplash(
      buildConfig({activityName: '.MainActivity', extraFilters: [mainLauncherFilter]}),
    );
    expect(launcherComponents(result)).toEqual(['.LauncherWhite']);
  });

  test('launcher filters from ANY activity are stripped — alias is the sole entry', () => {
    // Intentional: even a library activity declaring MAIN+LAUNCHER must not
    // become a second app icon. The alias is the single launcher component.
    const config = buildConfig({
      activityName: 'com.other.app.MainActivity',
      extraFilters: [mainLauncherFilter],
    });
    const result = withDynamicLauncherSplash(config);
    expect(launcherComponents(result)).toEqual(['.LauncherWhite']);
  });

  test('running the splash plugin twice stays idempotent (single alias, no duplicates)', () => {
    const once = withDynamicLauncherSplash(
      buildConfig({activityName: 'com.cine.pix.MainActivity', extraFilters: [mainLauncherFilter]}),
    );
    const twice = withDynamicLauncherSplash(once);
    const app = twice.modResults.manifest.application[0];
    expect(app['activity-alias']).toHaveLength(1);
    expect(launcherComponents(twice)).toEqual(['.LauncherWhite']);
  });
});
