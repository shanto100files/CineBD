/**
 * Regression tests for the double-launcher-icon bug.
 *
 * The live APK shipped TWO phone launcher entries:
 *  - com.cine.pix.MainActivity with MAIN + LAUNCHER (+ LEANBACK_LAUNCHER)
 *  - com.cine.pix.LauncherWhite alias with MAIN + LAUNCHER (enabled)
 *
 * The splash plugin only stripped the launcher intent when the activity was
 * registered as `.MainActivity`, but current Expo templates emit the
 * fully-qualified `com.cine.pix.MainActivity`, so the strip silently no-oped.
 * These tests pin both name forms and the TV-launcher preservation.
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

const actionNames = filter =>
  (filter.action || []).map(a => a?.$?.['android:name']);
const categoryNames = filter =>
  (filter.category || []).map(c => c?.$?.['android:name']);

const buildConfig = ({activityName, extraFilters = []}) => {
  const config = {
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
  };
  return config;
};

describe('with-dynamic-launcher-splash manifest mod', () => {
  test('fully-qualified MainActivity (current Expo template): phone launcher stripped from activity, TV launcher kept, exactly one alias', () => {
    const config = buildConfig({
      activityName: 'com.cine.pix.MainActivity',
      extraFilters: [
        {
          action: [{$: {'android:name': MAIN}}],
          category: [
            {$: {'android:name': LAUNCHER}},
            {$: {'android:name': LEANBACK}},
          ],
        },
      ],
    });

    const result = withDynamicLauncherSplash(config);
    const app = result.modResults.manifest.application[0];
    const mainActivity = app.activity[0];

    const mainFilters = mainActivity['intent-filter'].filter(filter =>
      actionNames(filter).includes(MAIN),
    );
    expect(mainFilters).toHaveLength(1);
    expect(categoryNames(mainFilters[0])).toEqual([LEANBACK]);

    // The VIEW (deep link) filter must survive untouched.
    expect(actionNames(mainActivity['intent-filter'][0])).toEqual([
      'android.intent.action.VIEW',
    ]);

    const aliases = app['activity-alias'];
    expect(aliases).toHaveLength(1);
    expect(aliases[0].$['android:name']).toBe('.LauncherWhite');
    expect(aliases[0].$['android:enabled']).toBe('true');
    expect(aliases[0].$['android:targetActivity']).toBe('.MainActivity');
    expect(actionNames(aliases[0]['intent-filter'][0])).toEqual([MAIN]);
    expect(categoryNames(aliases[0]['intent-filter'][0])).toEqual([LAUNCHER]);
  });

  test('relative .MainActivity (older template): whole MAIN filter removed, alias created', () => {
    const config = buildConfig({
      activityName: '.MainActivity',
      extraFilters: [
        {
          action: [{$: {'android:name': MAIN}}],
          category: [{$: {'android:name': LAUNCHER}}],
        },
      ],
    });

    const result = withDynamicLauncherSplash(config);
    const mainActivity = result.modResults.manifest.application[0].activity[0];

    expect(
      mainActivity['intent-filter'].some(filter =>
        actionNames(filter).includes(MAIN),
      ),
    ).toBe(false);

    const aliases = result.modResults.manifest.application[0]['activity-alias'];
    expect(aliases).toHaveLength(1);
    expect(categoryNames(aliases[0]['intent-filter'][0])).toEqual([LAUNCHER]);
  });

  test('activities from other packages are never stripped', () => {
    const launcherFilter = {
      action: [{$: {'android:name': MAIN}}],
      category: [{$: {'android:name': LAUNCHER}}],
    };
    const config = buildConfig({
      activityName: 'com.other.app.MainActivity',
      extraFilters: [launcherFilter],
    });

    const result = withDynamicLauncherSplash(config);
    const mainActivity = result.modResults.manifest.application[0].activity[0];

    expect(mainActivity['intent-filter']).toContain(launcherFilter);
  });

  test('net result: exactly one phone-launcher MAIN+LAUNCHER component', () => {
    // Mirrors the shipped v5.7.15 manifest exactly.
    const config = buildConfig({
      activityName: 'com.cine.pix.MainActivity',
      extraFilters: [
        {
          action: [{$: {'android:name': MAIN}}],
          category: [
            {$: {'android:name': LAUNCHER}},
            {$: {'android:name': LEANBACK}},
          ],
        },
      ],
    });

    const result = withDynamicLauncherSplash(config);
    const app = result.modResults.manifest.application[0];

    const launchables = [
      ...app.activity
        .filter(activity =>
          (activity['intent-filter'] || []).some(
            filter =>
              actionNames(filter).includes(MAIN) &&
              categoryNames(filter).includes(LAUNCHER),
          ),
        )
        .map(activity => activity.$['android:name']),
      ...(app['activity-alias'] || [])
        .filter(alias =>
          (alias['intent-filter'] || []).some(
            filter =>
              actionNames(filter).includes(MAIN) &&
              categoryNames(filter).includes(LAUNCHER),
          ),
        )
        .map(alias => alias.$['android:name']),
    ];

    expect(launchables).toEqual(['.LauncherWhite']);
  });
});
