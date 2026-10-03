import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  ToastAndroid,
  View,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {
  ADULT_PIN_MAX,
  ADULT_PIN_MIN,
  cancelBiometricPrompt,
  clearAdultLock,
  getUnlockedAt,
  hasBiometricHardware,
  isAdultLockOpen,
  isAdultPinSet,
  isBiometricEnabled,
  markUnlocked,
  promptBiometric,
  setAdultPin,
  setBiometricEnabled,
  verifyAdultPin,
} from '../../lib/adultLock';
// getUnlockedAt is imported for the session-capture blur/focus handlers.
import {showAppDialog} from '../../lib/zustand/appDialogStore';
import {useProfileStore} from '../../lib/zustand/profileStore';
import {useEnsureSettingsBase} from '../../lib/settingsStackBase';

/**
 * 18+ Lock screen.
 *
 * Modes (driven by route.params?.mode):
 *  - 'setup'    → first-time PIN enrolment (from Settings when enabling 18+)
 *  - 'unlock'   → verify PIN/biometric to open this session
 *  - 'settings' → manage the lock: change PIN, toggle biometrics, remove lock
 *
 * Where does unlock land?
 *  - unlock WITH switchProfile (child-proofing deferred switch from the
 *    profile switcher / ProfileEdit) → the target profile is a CONTENT
 *    surface, so after the unlock we reset the whole tab stack to Home
 *    (Settings -x-). Landing back in Settings was a bug: the user unlocked
 *    to switch profiles and expected Home, and every later Settings visit
 *    re-prompted because the blurred stack kept re-locking.
 *  - plain unlock (NO switchProfile) → goBack(): this is the "enable 18+"
 *    flow started from Settings/Home with pendingAdultEnable armed — those
 *    callers apply the toggle on focus-return, so they need their screen
 *    back, not a reset to Home.
 *  - setup/settings modes → goBack() as before (they truly came from
 *    Settings; Settings regains focus and applies pendingEnable).
 */
export default function AdultLockScreen() {
  const colors = useM3Colors();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeParams: {
    mode?: 'setup' | 'unlock' | 'settings';
    switchProfile?: string | null;
    nonce?: string;
  } = route.params || {};
  const mode: 'setup' | 'unlock' | 'settings' = routeParams.mode || 'unlock';

  // Opening the lock from another tab can be the first thing that ever
  // mounts SettingsStack — make sure a Settings screen exists underneath so
  // unlock/back has somewhere to land (see settingsStackBase.ts).
  useEnsureSettingsBase();

  const pinSet = isAdultPinSet();
  const [stage, setStage] = useState<'enter' | 'confirm'>(pinSet || mode !== 'setup' ? 'enter' : 'enter');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(isBiometricEnabled());

  const startMode = mode;
  // Biometric attempts are best-effort and can fail silently (sensor busy,
  // user cancelled, lockout). Track the last failure so the UI can show a
  // retry hint instead of looking dead.
  const [bioFailed, setBioFailed] = useState(false);

  // SECURITY: the management panel (change PIN / remove lock) must sit behind
  // a LIVE unlock session. It used to open on `isAdultPinSet()` alone, so a
  // child could walk into Settings → "18+ লক" and change or delete the PIN
  // without ever being challenged. `justUnlocked` records an authentication
  // that happened in place on this screen: isAdultLockOpen() is a plain
  // getter, so without a state mirror React would not re-render to reveal the
  // panel after finishUnlock() — and finishUnlock no longer navigates away
  // for this mode (see below).
  const [justUnlocked, setJustUnlocked] = useState(false);
  const panelOpen =
    startMode === 'settings' && pinSet && (isAdultLockOpen() || justUnlocked);
  // The fingerprint button belongs on every authentication surface — unlock
  // and the (locked) settings panel alike, not unlock alone.
  const showBiometric =
    (startMode === 'unlock' || startMode === 'settings') && pinSet;

  // The 15-minute TTL is only evaluated when this screen renders, so an idle
  // session would leave the management controls usable long after it expired.
  // Tick twice a minute and collapse the panel back to the PIN pad.
  useEffect(() => {
    if (startMode !== 'settings') {
      return;
    }
    const id = setInterval(() => {
      if (!isAdultLockOpen()) {
        setJustUnlocked(false);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [startMode]);

  // Set while a programmatic navigation from finishUnlock is in flight; the
  // blur handler must not treat that navigation as "user walked away" (it
  // used to clear the fresh unlock, which re-locked Settings instantly).
  const navigatingOutRef = React.useRef(false);

  // Reset-to-Home after an unlock: Settings keeps AdultLock in its stack
  // (a react-native-screens screen stays mounted), so goBack() returned to
  // Settings instead of the content the user expects after unlocking.
  //
  // FIX-2 (2026-09-30): the previous reset attempt built a full nested
  // CommonActions.reset state (TabStack -> HomeStack). From inside the
  // SettingsStack that reset does not reliably replace the ROOT route — it
  // could throw and fall into the goBack() catch, leaving the user on
  // Settings again. CommonActions.navigate('TabStack', {screen:
  // 'HomeStack'}) is the framework-sanctioned way to reach a nested tab
  // screen: it pops the root stack to TabStack, selects the Home tab and
  // resets that tab's own stack to its Home screen (reset-on-navigate).
  const resetToHome = useCallback(() => {
    try {
      const {CommonActions, StackActions} = require('@react-navigation/native');
      // Pop any AdultLock/ProfileEdit screens stacked on Settings first.
      navigation.dispatch(StackActions.popToTop());
      navigation.dispatch(
        CommonActions.navigate('TabStack', {
          screen: 'HomeStack',
          params: {screen: 'Home'},
        }),
      );
    } catch {
      navigation.goBack();
    }
  }, [navigation]);

  const finishUnlock = useCallback(() => {
    // Deferred profile switch (child-proofing): the switcher sent us here
    // so the target profile only activates after a successful unlock.
    const targetId = routeParams.switchProfile;
    if (targetId !== undefined) {
      try {
        useProfileStore.getState().setActive(targetId);
      } catch {}
    }
    // Stamp AFTER setActive: switching profiles clears the unlock session
    // by design, and this fresh unlock must survive its own deferred switch.
    markUnlocked();
    // Settings mode authenticates IN PLACE: reveal the management panel right
    // here instead of popping back to the row the user just tapped (which
    // would make every visit a two-tap round trip).
    if (startMode === 'settings' && targetId === undefined) {
      setPin('');
      setJustUnlocked(true);
      return;
    }
    // Only the profile-switch unlock resets to Home. The PLAIN unlock (no
    // switchProfile) is the "enable 18+" flow started from Settings/Home:
    // those callers wait for focus-return with pendingAdultEnable to flip
    // the toggle, so they must get a plain goBack() instead.
    if (startMode === 'unlock' && targetId !== undefined) {
      navigatingOutRef.current = true;
      resetToHome();
      return;
    }
    // Safety net (belt-and-braces for useEnsureSettingsBase): if Settings is
    // somehow not underneath us — the lazy SettingsStack having mounted with
    // AdultLock as its ONLY route — a plain goBack() has nothing to pop and
    // bubbles out of the tab, dumping the user on Home while the Settings tab
    // stays stuck on the lock screen. Reset to a real Settings instead.
    try {
      const routes = navigation.getState?.()?.routes as
        | Array<{name?: string}>
        | undefined;
      if (
        !Array.isArray(routes) ||
        routes.length === 0 ||
        (routes.length === 1 && routes[0]?.name !== 'Settings')
      ) {
        const {CommonActions} = require('@react-navigation/native');
        navigatingOutRef.current = true;
        navigation.dispatch(CommonActions.reset({routes: [{name: 'Settings'}]}));
        return;
      }
    } catch {
      // getState unavailable — fall through to goBack().
    }
    // The unlock is already stamped; flag the exit so the blur handler knows
    // this was our own navigation, not the user abandoning the prompt.
    navigatingOutRef.current = true;
    navigation.goBack();
  }, [navigation, routeParams.switchProfile, startMode, resetToHome]);

  const tryBiometric = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    const res = await promptBiometric();
    setBusy(false);
    if (res === 'ok') {
      finishUnlock();
      return true;
    }
    if (res === 'cancel') {
      // The user dismissed the system prompt — stay quiet. Treating a
      // cancel as a failure made every abandonment look like "fingerprint
      // doesn't work".
      return false;
    }
    setBioFailed(true);
    ToastAndroid.show(
      'ফিঙ্গারপ্রিন্ট কাজ করেনি — আবার চেষ্টা করুন বা পিন দিন',
      ToastAndroid.LONG,
    );
    return false;
  }, [finishUnlock]);

  // Housekeeping when the lock screen loses focus. It deliberately does NOT
  // touch the unlock session any more.
  //
  // It used to: on blur it compared against a timestamp captured at MOUNT
  // (never re-captured on focus, despite the name), and finishUnlock()'s
  // plain goBack() path did not set navigatingOutRef — so the comparison
  // `getUnlockedAt() > hadFreshSessionAtFocus` was true on every successful
  // unlock and clearUnlockSession() fired the instant the user left the
  // screen. The 15-minute window never survived its own unlock, which is
  // exactly why the PIN was demanded again on every later profile change and
  // every trip into Settings.
  //
  // Nothing needs clearing here: markUnlocked() only ever runs on a real PIN
  // or biometric success (a cancel cannot stamp anything), the TTL is the
  // documented behaviour, and profileStore.setActive still drops the window
  // when the user switches into a kid-safe profile.
  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', () => {
      navigatingOutRef.current = false;
    });
    const unsubBlur = navigation.addListener('blur', () => {
      setPin('');
      setBusy(false);
      cancelBiometricPrompt();
    });
    return () => {
      unsubFocus();
      unsubBlur();
      cancelBiometricPrompt();
    };
  }, [navigation]);

  // Runs on EVERY open. React Navigation keeps screens mounted, so a
  // re-open can land on the same stacked instance (tabbed away earlier):
  // reset any stale typed PIN and re-arm the biometric prompt. The nonce
  // in the route params changes on each openAdultLock() call.
  useEffect(() => {
    setPin('');
    setBusy(false);
    setBioFailed(false);
    setJustUnlocked(false);
    setStage('enter');
    setFirstPin('');
    hasBiometricHardware().then(setBioAvailable);
    // Settings mode is the same authentication as unlock (it just resolves
    // into the panel instead of goBack), so it gets the biometric prompt too.
    if (
      (startMode === 'unlock' || startMode === 'settings') &&
      pinSet &&
      isBiometricEnabled() &&
      getUnlockedAt() === 0
    ) {
      (async () => {
        await tryBiometric();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams.nonce]);

  const submitPin = useCallback(
    async (entered: string) => {
      if (startMode === 'setup') {
        // Fail closed: enrolling a PIN over an EXISTING one must never happen
        // without a live unlock session. mode:'setup' is also what the
        // change-PIN row pushes, so a stale route or a bypassed settings
        // panel can never silently replace the PIN.
        if (isAdultPinSet() && !isAdultLockOpen()) {
          ToastAndroid.show('পুরনো পিন দিয়ে আগে আনলক করুন', ToastAndroid.LONG);
          setPin('');
          return;
        }
        if (stage === 'enter') {
          if (!/^\d{4,8}$/.test(entered)) {
            ToastAndroid.show(`${ADULT_PIN_MIN}-${ADULT_PIN_MAX} ডিজিটের পিন দিন`, ToastAndroid.SHORT);
            setPin('');
            return;
          }
          setFirstPin(entered);
          setStage('confirm');
          setPin('');
          return;
        }
        // confirm stage
        if (entered !== firstPin) {
          ToastAndroid.show('পিন মিলছে না — আবার দিন', ToastAndroid.SHORT);
          setStage('enter');
          setFirstPin('');
          setPin('');
          return;
        }
        setBusy(true);
        const ok = await setAdultPin(entered);
        setBusy(false);
        if (!ok) {
          ToastAndroid.show('পিন সেভ করা যায়নি', ToastAndroid.SHORT);
          return;
        }
        markUnlocked();
        ToastAndroid.show('18+ লক সেট হয়েছে', ToastAndroid.SHORT);
        finishUnlock();
        return;
      }

      // unlock / settings-verify
      setBusy(true);
      const ok = await verifyAdultPin(entered);
      setBusy(false);
      if (!ok) {
        ToastAndroid.show('ভুল পিন', ToastAndroid.SHORT);
        setPin('');
        return;
      }
      markUnlocked();
      finishUnlock();
    },
    [startMode, stage, firstPin, finishUnlock],
  );

  const pressDigit = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, ADULT_PIN_MAX);
    setPin(next);
    // Auto-submit only at max length; shorter pins submit via the button
    // below (previously 4-7 digit pins could never unlock at all).
    if (next.length === ADULT_PIN_MAX) {
      submitPin(next);
    }
  };

  const pressBackspace = () => setPin(p => p.slice(0, -1));

  const removeLock = () => {
    // Destructive action: re-check the session at press time rather than
    // trusting the render-time gate (the panel can outlive a short TTL).
    if (!isAdultLockOpen()) {
      ToastAndroid.show('পিন দিয়ে আগে আনলক করুন', ToastAndroid.LONG);
      setJustUnlocked(false);
      return;
    }
    showAppDialog({
      title: '18+ লক সরাবেন?',
      message: 'পিন মুছে যাবে এবং 18+ শুধু এজ-গেট দিয়ে নিয়ন্ত্রিত হবে।',
      variant: 'warning',
      actions: [
        {label: 'না'},
        {
          label: 'সরাও',
          variant: 'destructive',
          onPress: () => {
            clearAdultLock();
            ToastAndroid.show('লক সরানো হয়েছে', ToastAndroid.SHORT);
            navigation.goBack();
          },
        },
      ],
    });
  };

  // When the settings panel is still locked the screen IS an unlock prompt,
  // so it must not advertise itself as the management page.
  const title = panelOpen
    ? '18+ লক সেটিংস'
    : startMode === 'setup'
      ? stage === 'enter'
        ? '18+ পিন সেট করুন'
        : 'পিন আবার দিন'
      : '18+ আনলক করুন';

  // ---------------- settings mode ----------------
  // panelOpen, not `startMode === 'settings' && pinSet`: without the session
  // check the panel (and its change-PIN / remove-lock rows) was reachable
  // with no authentication at all.
  if (panelOpen) {
    return (
      <ScrollView style={{flex: 1, backgroundColor: colors.background}} contentContainerStyle={{padding: 20}}>
        <AppText role="headlineSmallEmphasized" style={{color: colors.onSurface, marginBottom: 14}}>
          18+ লক সেটিংস
        </AppText>

        <Pressable
          style={[st.row, {backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant}]}
          onPress={() => navigation.push('AdultLock', {mode: 'setup'})}>
          <MaterialCommunityIcons name="lock-reset" size={22} color={colors.primary} />
          <AppText style={{flex: 1, marginLeft: 12, color: colors.onSurface}}>পিন পরিবর্তন করুন</AppText>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </Pressable>

        <View style={[st.row, {backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant, marginTop: 10}]}>
          <MaterialCommunityIcons name="fingerprint" size={22} color={colors.primary} />
          <View style={{flex: 1, marginLeft: 12}}>
            <AppText style={{color: colors.onSurface}}>ফিঙ্গারপ্রিন্ট দিয়ে আনলক</AppText>
            {!bioAvailable && (
              <AppText style={{color: colors.onSurfaceVariant, fontSize: 11}}>
                বায়োমেট্রিক পাওয়া যায়নি — ফোনের সেটিংসে ফিঙ্গারপ্রিন্ট/ফেস এনরোল করুন
              </AppText>
            )}
          </View>
          <Switch
            value={bioOn}
            disabled={!bioAvailable}
            onValueChange={async v => {
              setBiometricEnabled(v);
              setBioOn(v);
              if (v) {
                // Prove it works right at setup — a toggle that silently
                // never fires is indistinguishable from a broken sensor.
                const res = await promptBiometric();
                if (res === 'ok') {
                  ToastAndroid.show(
                    'ফিঙ্গারপ্রিন্ট সচল — আনলকে ব্যবহার হবে',
                    ToastAndroid.SHORT,
                  );
                } else if (res === 'fail') {
                  ToastAndroid.show(
                    'পরীক্ষা করা গেল না — সেন্সর/ফোন সেটিংস দেখে আবার চেষ্টা করুন',
                    ToastAndroid.LONG,
                  );
                }
              }
            }}
          />
        </View>

        <Pressable
          style={[st.row, {backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant, marginTop: 10}]}
          onPress={removeLock}>
          <MaterialCommunityIcons name="lock-open-variant" size={22} color={colors.error} />
          <AppText style={{flex: 1, marginLeft: 12, color: colors.error}}>লক সরিয়ে ফেলুন</AppText>
        </Pressable>

        <AppText style={{color: colors.onSurfaceVariant, fontSize: 12, marginTop: 18, lineHeight: 18}}>
          পিন দিয়ে 18+ কনটেন্ট সুরক্ষিত থাকে। প্রতি ১৫ মিনিট পর আবার আনলক করতে হবে।
        </AppText>
      </ScrollView>
    );
  }

  // ---------------- pin pad (setup / unlock) ----------------
  // Wrapped in a ScrollView on purpose: title + subtitle + dots + the 4-row
  // keypad + the action button outgrow a short (or landscape) viewport, and a
  // bare <View flex:1> clipped the bottom rows. st.padWrap also CENTRES that
  // block — children used to stack against the top edge, which left a ~300dp
  // black void between the pad and the tab bar on tall phones.
  return (
    <ScrollView
      style={{flex: 1, backgroundColor: colors.background}}
      contentContainerStyle={st.padWrap}
      showsVerticalScrollIndicator={false}>
      {/* Every screen in this stack sets headerShown:false, so the lock page
          needs its own way out — otherwise hardware back is the only escape. */}
      <Pressable
        style={st.closeBtn}
        hitSlop={12}
        disabled={busy}
        onPress={() => navigation.goBack()}>
        <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
      </Pressable>

      {/* Identity mark. Without it the page was a bare title floating on
          black and read like an Android system dialog rather than the app's
          own gate — a two-ring medallion in the theme accent gives the screen
          something to belong to. */}
      <View style={st.hero}>
        <View style={[st.heroOuter, {borderColor: colors.outlineVariant}]} />
        <View
          style={[
            st.heroDisc,
            {
              backgroundColor: colors.surfaceContainerHigh,
              borderColor: colors.primary,
            },
          ]}>
          <MaterialCommunityIcons
            name={startMode === 'setup' ? 'shield-key-outline' : 'shield-lock-outline'}
            size={34}
            color={colors.primary}
          />
        </View>
      </View>

      <AppText
        role="headlineMediumEmphasized"
        style={{color: colors.onSurface, textAlign: 'center', marginTop: 20}}>
        {title}
      </AppText>
      <AppText
        role="bodyMedium"
        style={{color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8, paddingHorizontal: 20}}>
        {startMode === 'setup'
          ? stage === 'enter'
            ? '৪-৮ ডিজিটের পিন দিন — এটা ছাড়া 18+ চালু হবে না'
            : 'আবার একই পিন দিন'
          : 'পিন দিন বা ফিঙ্গারপ্রিন্ট ব্যবহার করুন'}
      </AppText>

      {/* PIN dots: a filled dot lights up in the accent with a soft glow and
          an empty one is outlined. Two flat greys read as "disabled" rather
          than "not typed yet". */}
      <View style={st.dotsRow}>
        {Array.from({length: Math.max(ADULT_PIN_MIN, pin.length || ADULT_PIN_MIN)}).map((_, i) => {
          const filled = i < pin.length;
          return (
            <View
              key={i}
              style={[
                st.dot,
                filled
                  ? {
                      backgroundColor: colors.primary,
                      shadowColor: colors.primary,
                      shadowOpacity: 0.65,
                      shadowRadius: 6,
                      shadowOffset: {width: 0, height: 0},
                      elevation: 4,
                    }
                  : {
                      backgroundColor: colors.surfaceContainerHighest,
                      borderWidth: 1,
                      borderColor: colors.outlineVariant,
                    },
              ]}
            />
          );
        })}
      </View>

      {/* Fingerprint as a real button. It used to be a bare 40px glyph with a
          label under it — nothing signalled "tap me". */}
      {showBiometric && bioOn && bioAvailable && (
        <View style={{alignItems: 'center', marginTop: 2}}>
          <Pressable
            disabled={busy}
            onPress={() => tryBiometric()}
            style={({pressed}) => [
              st.bioBtn,
              {
                backgroundColor: colors.surfaceContainerHigh,
                borderColor: bioFailed ? colors.error : colors.outlineVariant,
                opacity: pressed ? 0.78 : 1,
              },
            ]}>
            <MaterialCommunityIcons
              name="fingerprint"
              size={34}
              color={bioFailed ? colors.error : colors.primary}
            />
          </Pressable>
          <AppText
            role="labelMedium"
            style={{
              marginTop: 7,
              color: bioFailed ? colors.error : colors.onSurfaceVariant,
            }}>
            {bioFailed ? 'আবার ফিঙ্গারপ্রিন্ট দিন' : 'ফিঙ্গারপ্রিন্ট'}
          </AppText>
        </View>
      )}
      {showBiometric && bioOn && !bioAvailable && (
        <AppText
          style={{
            color: colors.onSurfaceVariant,
            fontSize: 12,
            textAlign: 'center',
            marginBottom: 8,
            paddingHorizontal: 30,
          }}>
          ফিঙ্গারপ্রিন্ট এই ডিভাইসে পাওয়া যায়নি — পিন দিয়ে আনলক করুন
        </AppText>
      )}

      {/* The keypad lives in its own panel. On a flat black page the digits
          had no affordance at all — nothing read as tappable, and the pad
          floated in the same void as the title. */}
      <View
        style={[
          st.panel,
          {backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant},
        ]}>
        <View style={st.pad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <PadKey
              key={d}
              label={d}
              onPress={() => pressDigit(d)}
              hasTVPreferredFocus={d === '5'}
            />
          ))}
          <PadKey label="" onPress={() => {}} ghost />
          <PadKey label="0" onPress={() => pressDigit('0')} />
          <PadKey
            icon="backspace-outline"
            onPress={pressBackspace}
          />
        </View>
      </View>

      {/* Fixed-height slot, not a conditional: the pad used to jump the
          moment the first digit landed (and again when cleared) because the
          button mounted/dismounted with pin.length. The CTA uses primary +
          onPrimary rather than the *Container roles: on a light seed the
          container pair washed out, while an accent fill reads as a real
          call to action. */}
      <View style={st.actionSlot}>
        {pin.length >= ADULT_PIN_MIN ? (
          busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Pressable
              focusable
              style={({pressed}) => [
                st.doneBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{scale: pressed ? 0.985 : 1}],
                },
              ]}
              onPress={() => submitPin(pin)}>
              <AppText role="labelLargeEmphasized" style={[st.doneTxt, {color: colors.onPrimary}]}>
                {startMode === 'setup' ? 'পরবর্তী' : 'আনলক করুন'}
              </AppText>
            </Pressable>
          )
        ) : null}
      </View>
    </ScrollView>
  );
}

/**
 * D-pad-friendly keypad key: Android TV Pressable needs explicit focusable,
 * and a focused key gets a primary ring + grow so the remote user always
 * knows which digit will fire. First key takes initial focus on TV.
 */
const PadKey = ({
  label,
  icon,
  onPress,
  ghost = false,
  hasTVPreferredFocus = false,
}: {
  label?: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  ghost?: boolean;
  hasTVPreferredFocus?: boolean;
}) => {
  const colors = useM3Colors();
  const isTv = Platform.isTV;
  const [focused, setFocused] = useState(false);
  if (ghost) {
    return <View style={st.key} />;
  }
  return (
    <Pressable
      focusable={isTv}
      hasTVPreferredFocus={isTv && hasTVPreferredFocus}
      onPress={onPress}
      onFocus={isTv ? () => setFocused(true) : undefined}
      onBlur={isTv ? () => setFocused(false) : undefined}
      style={({pressed}) => [
        st.key,
        {
          // Highest + an outline makes the pad legible; pressed tints a step
          // darker and shrinks so a tap feels like a physical key press.
          backgroundColor: pressed
            ? colors.surfaceContainerHighest
            : colors.surfaceContainerHigh,
          borderWidth: isTv && focused ? 3 : 1,
          borderColor: isTv && focused ? colors.primary : colors.outlineVariant,
          transform: [{scale: isTv && focused ? 1.12 : pressed ? 0.96 : 1}],
          opacity: 1,
        },
      ]}>
      {icon ? (
        <MaterialCommunityIcons name={icon} size={26} color={colors.onSurface} />
      ) : label ? (
        <AppText style={[st.keyTxt, {color: colors.onSurface}]}>{label}</AppText>
      ) : null}
    </Pressable>
  );
};

const st = StyleSheet.create({
  // justifyContent:'center' is the whole fix for the dead space: children
  // were packing against the top edge and leaving a ~300dp void below the
  // pad. paddingBottom keeps the block clear of the tab bar.
  padWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  // alignSelf, not position:'absolute' — inside a ScrollView contentContainer
  // it is unclear whether absolute offsets from the padding or border box, so
  // a plain top-left flow item is predictable.
  closeBtn: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Two concentric rings instead of a bare icon: the outer hairline separates
  // the medallion from the black page, the inner accent ring ties it to the
  // filled PIN dots below.
  hero: {
    width: 92,
    height: 92,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOuter: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 46, borderWidth: 1},
  heroDisc: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {flexDirection: 'row', justifyContent: 'center', gap: 13, marginTop: 24, marginBottom: 18},
  dot: {width: 15, height: 15, borderRadius: 8},
  // Own surface so the digits sit on something rather than floating on the
  // page. Padding is small on purpose: 3x72dp keys + 2x14dp gaps = 244dp, and
  // padWrap(16) + this panel(12) must leave a 320dp screen >= 244dp wide.
  panel: {
    width: '100%',
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  bioBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 3x72dp keys + 2x14dp gaps = 244dp. Horizontal inset lives on padWrap (16)
  // plus this panel (12) — a 320dp screen yields 320-32-24 = 264dp >= 244dp,
  // i.e. still exactly 3 columns. Do not widen the panel padding: past ~20dp
  // the grid falls back to 2 columns.
  pad: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14},
  key: {width: 72, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center'},
  // tabular-nums keeps every digit column the same width while typing.
  keyTxt: {fontSize: 25, fontWeight: '600', fontVariant: ['tabular-nums']},
  // Reserves the action row so the keypad never shifts as digits are typed.
  actionSlot: {
    height: 52,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTxt: {fontWeight: '700'},
  // Shared by the settings-mode rows: a hairline outline (painted inline from
  // the theme) turns them from grey blobs into distinct tappable cards.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
});
