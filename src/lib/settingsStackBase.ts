import {useEffect} from 'react';
import {CommonActions, useNavigation} from '@react-navigation/native';

/**
 * Keeps `Settings` at the BOTTOM of the SettingsStack for every subpage that
 * can be opened from outside the Settings tab.
 *
 * Why this is needed:
 *  The Settings tab is lazy — until the user taps it, the SettingsStack
 *  navigator has never mounted. `openAdultLock()` / `openProfileEdit()` /
 *  `openLoginScreen()` dispatch
 *  `navigate('TabStack', {screen: 'SettingsStack', params: {screen: 'X'}})`
 *  and if that is the FIRST thing to ever mount SettingsStack, react-navigation
 *  derives the navigator's entire state from that param — a stack holding
 *  nothing but `X`, with no `Settings` underneath.
 *
 *  From there everything goes wrong in a way that looks like a lock bug:
 *   - the Settings tab now renders `X` (the 18+ lock) on every single visit;
 *   - `goBack()` has nothing to pop to, so it bubbles out of the tab and
 *     drops the user on Home instead of Settings;
 *   - the stack never heals, so the symptom repeats forever.
 *
 * Inserting the missing `Settings` route underneath on mount fixes all three.
 * Route keys are preserved by the router's `getRehydratedState`, so the
 * subpage that is already on screen is NOT remounted, and once `Settings` is
 * the base route the guard short-circuits — it can never run twice.
 */
export const useEnsureSettingsBase = (): void => {
  const navigation = useNavigation<any>();

  useEffect(() => {
    try {
      const state = navigation.getState?.() as
        | {routes?: Array<{name: string}>}
        | undefined;
      const routes = state?.routes;
      if (!Array.isArray(routes) || routes.length === 0) {
        return;
      }
      if (routes[0]?.name === 'Settings') {
        return; // already correct — Settings is the base route
      }
      // RESET only names routes this navigator owns, so the SettingsStack
      // handles it locally instead of letting it bubble to the root.
      navigation.dispatch(
        CommonActions.reset({
          routes: [{name: 'Settings'}, ...routes],
        }),
      );
    } catch {
      // Never let a navigation guard break the screen it is guarding.
    }
  }, [navigation]);
};

export default useEnsureSettingsBase;
