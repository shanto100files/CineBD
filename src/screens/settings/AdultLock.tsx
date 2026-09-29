import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
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
import {settingsStorage} from '../../lib/storage';
import {
  ADULT_PIN_MAX,
  ADULT_PIN_MIN,
  cancelBiometricPrompt,
  clearAdultLock,
  hasBiometricHardware,
  isAdultPinSet,
  isBiometricEnabled,
  markUnlocked,
  promptBiometric,
  setAdultPin,
  setBiometricEnabled,
  verifyAdultPin,
} from '../../lib/adultLock';
import {showAppDialog} from '../../lib/zustand/appDialogStore';
import {useProfileStore} from '../../lib/zustand/profileStore';

/**
 * 18+ Lock screen.
 *
 * Modes (driven by route.params?.mode):
 *  - 'setup'    → first-time PIN enrolment (from Settings when enabling 18+)
 *  - 'unlock'   → verify PIN/biometric to open this session
 *  - 'settings' → manage the lock: change PIN, toggle biometrics, remove lock
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
  // Visual wrong-PIN feedback: flash the dots red briefly instead of
  // relying on the toast alone.
  const [pinError, setPinError] = useState(false);
  const errTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashPinError = useCallback(() => {
    setPinError(true);
    if (errTimer.current) {
      clearTimeout(errTimer.current);
    }
    errTimer.current = setTimeout(() => setPinError(false), 650);
  }, []);
  useEffect(
    () => () => {
      if (errTimer.current) {
        clearTimeout(errTimer.current);
      }
    },
    [],
  );

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
    navigation.goBack();
  }, [navigation, routeParams.switchProfile]);

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

  // Runs on EVERY open. React Navigation keeps screens mounted, so a
  // re-open can land on the same stacked instance (tabbed away earlier):
  // reset any stale typed PIN and re-arm the biometric prompt. The nonce
  // in the route params changes on each openAdultLock() call.
  useEffect(() => {
    setPin('');
    setBusy(false);
    setBioFailed(false);
    setStage('enter');
    setFirstPin('');
    hasBiometricHardware().then(setBioAvailable);
    if (startMode === 'unlock' && pinSet && isBiometricEnabled()) {
      (async () => {
        await tryBiometric();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams.nonce]);

  // Leaving the lock screen (tab switch, covered, popped): drop typed
  // digits and dismiss any in-flight system prompt — it belongs to the
  // Activity and could otherwise complete an abandoned unlock/switch later.
  // Returning (focus): start clean and re-arm the biometric prompt, so a
  // prompt cancelled by tabbing away comes back instead of staying dead.
  useEffect(() => {
    const rearm = () => {
      setPin('');
      setBioFailed(false);
      if (startMode === 'unlock' && pinSet && isBiometricEnabled()) {
        (async () => {
          await tryBiometric();
        })();
      }
    };
    const unsubFocus = navigation.addListener('focus', rearm);
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
  }, [navigation, startMode, tryBiometric]);

  const submitPin = useCallback(
    async (entered: string) => {
      if (startMode === 'setup') {
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
          flashPinError();
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
        flashPinError();
        setPin('');
        return;
      }
      markUnlocked();
      finishUnlock();
    },
    [startMode, stage, firstPin, finishUnlock, flashPinError],
  );

  const pressDigit = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, ADULT_PIN_MAX);
    setPin(next);
    if (pinError) {
      setPinError(false);
    }
    // Auto-submit only at max length; shorter pins submit via the button
    // below (previously 4-7 digit pins could never unlock at all).
    if (next.length === ADULT_PIN_MAX) {
      submitPin(next);
    }
  };

  const pressBackspace = () => setPin(p => p.slice(0, -1));

  const removeLock = () => {
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

  const title =
    startMode === 'setup'
      ? stage === 'enter'
        ? '18+ পিন সেট করুন'
        : 'পিন আবার দিন'
      : startMode === 'settings'
        ? '18+ লক সেটিংস'
        : '18+ আনলক করুন';

  // ---------------- settings mode ----------------
  if (startMode === 'settings' && pinSet) {
    return (
      <ScrollView style={{flex: 1, backgroundColor: colors.background}} contentContainerStyle={{padding: 20}}>
        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 16}}>
          <View style={[st.badgeSmall, {backgroundColor: colors.primaryContainer}]}>
            <MaterialCommunityIcons name="shield-lock-outline" size={24} color={colors.onPrimaryContainer} />
          </View>
          <AppText role="headlineSmallEmphasized" style={{color: colors.onSurface, marginLeft: 12, flex: 1}}>
            18+ লক সেটিংস
          </AppText>
        </View>

        <Pressable
          style={[st.row, {backgroundColor: colors.surfaceContainerHigh}]}
          onPress={() => navigation.push('AdultLock', {mode: 'setup'})}>
          <MaterialCommunityIcons name="lock-reset" size={22} color={colors.primary} />
          <AppText style={{flex: 1, marginLeft: 12, color: colors.onSurface}}>পিন পরিবর্তন করুন</AppText>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </Pressable>

        <View style={[st.row, {backgroundColor: colors.surfaceContainerHigh, marginTop: 10}]}>
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
          style={[st.row, {backgroundColor: colors.surfaceContainerHigh, marginTop: 10}]}
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
  const canSubmit = pin.length >= ADULT_PIN_MIN;
  const subtitleText =
    startMode === 'setup'
      ? stage === 'enter'
        ? '৪-৮ ডিজিটের পিন দিন — এটা ছাড়া 18+ চালু হবে না'
        : 'আবার একই পিন দিন'
      : 'পিন দিন বা ফিঙ্গারপ্রিন্ট ব্যবহার করুন';

  return (
    <View style={[st.full, {backgroundColor: colors.background}]}>
      {/* Ambient brand glow — keeps the plain black screen from feeling flat */}
      <View
        pointerEvents="none"
        style={[st.glow, {top: -110, right: -80, backgroundColor: colors.primary, opacity: 0.08}]}
      />
      <View
        pointerEvents="none"
        style={[st.glow, {bottom: 30, left: -110, backgroundColor: colors.primary, opacity: 0.05}]}
      />

      <ScrollView
        contentContainerStyle={st.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Icon badge */}
        <View style={[st.badge, {backgroundColor: colors.primaryContainer}]}>
          <MaterialCommunityIcons name="shield-lock-outline" size={38} color={colors.onPrimaryContainer} />
        </View>

        <AppText
          role="headlineMediumEmphasized"
          style={{color: colors.onSurface, textAlign: 'center', marginTop: 18}}>
          {title}
        </AppText>
        <AppText
          style={{
            color: colors.onSurfaceVariant,
            textAlign: 'center',
            marginTop: 8,
            paddingHorizontal: 44,
            fontSize: 13.5,
            lineHeight: 20,
          }}>
          {subtitleText}
        </AppText>

        {/* dots */}
        <View style={st.dotsRow}>
          {Array.from({length: Math.max(ADULT_PIN_MIN, pin.length || ADULT_PIN_MIN)}).map((_, i) => {
            const filled = i < pin.length;
            const accent = pinError ? colors.error : colors.primary;
            return (
              <View
                key={i}
                style={[
                  st.dot,
                  {
                    backgroundColor: filled ? accent : 'transparent',
                    borderColor: pinError ? colors.error : filled ? accent : colors.outlineVariant,
                    transform: [{scale: filled ? 1 : 0.85}],
                  },
                ]}
              />
            );
          })}
        </View>

        {startMode === 'unlock' && pinSet && bioOn && bioAvailable ? (
          <Pressable
            disabled={busy}
            onPress={() => tryBiometric()}
            style={({pressed}) => [
              st.bioBtn,
              {
                backgroundColor: colors.surfaceContainerHigh,
                borderColor: bioFailed ? colors.error : colors.primary,
                opacity: busy ? 0.6 : pressed ? 0.7 : 1,
              },
            ]}>
            <MaterialCommunityIcons
              name="fingerprint"
              size={28}
              color={bioFailed ? colors.error : colors.primary}
            />
            <AppText
              style={{
                marginLeft: 10,
                color: bioFailed ? colors.error : colors.onSurface,
                fontSize: 13.5,
                fontWeight: '600',
              }}>
              {bioFailed ? 'আবার ফিঙ্গারপ্রিন্ট দিন' : 'ফিঙ্গারপ্রিন্ট দিয়ে আনলক'}
            </AppText>
          </Pressable>
        ) : startMode === 'unlock' && pinSet && bioOn && !bioAvailable ? (
          <AppText style={[st.bioHint, {color: colors.onSurfaceVariant}]}>
            ফিঙ্গারপ্রিন্ট এই ডিভাইসে পাওয়া যায়নি — পিন দিয়ে আনলক করুন
          </AppText>
        ) : null}

        {/* keypad */}
        <View style={st.pad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <Pressable
              key={d}
              disabled={busy}
              onPress={() => pressDigit(d)}
              style={({pressed}) => [
                st.key,
                {
                  backgroundColor: colors.surfaceContainerHigh,
                  opacity: pressed ? 0.55 : 1,
                  transform: [{scale: pressed ? 0.94 : 1}],
                },
              ]}>
              <AppText style={[st.keyTxt, {color: colors.onSurface}]}>{d}</AppText>
            </Pressable>
          ))}
          <View style={[st.key, {backgroundColor: 'transparent'}]} />
          <Pressable
            disabled={busy}
            onPress={() => pressDigit('0')}
            style={({pressed}) => [
              st.key,
              {
                backgroundColor: colors.surfaceContainerHigh,
                opacity: pressed ? 0.55 : 1,
                transform: [{scale: pressed ? 0.94 : 1}],
              },
            ]}>
            <AppText style={[st.keyTxt, {color: colors.onSurface}]}>0</AppText>
          </Pressable>
          <Pressable
            disabled={busy || pin.length === 0}
            onPress={pressBackspace}
            onLongPress={() => setPin('')}
            style={({pressed}) => [
              st.key,
              {opacity: pin.length === 0 ? 0.25 : pressed ? 0.55 : 1},
            ]}>
            <MaterialCommunityIcons name="backspace-outline" size={26} color={colors.onSurface} />
          </Pressable>
        </View>

        {/* Primary action — always visible, disabled until the PIN is long enough */}
        <Pressable
          disabled={!canSubmit || busy}
          onPress={() => submitPin(pin)}
          style={({pressed}) => [
            st.cta,
            {
              backgroundColor: colors.primary,
              opacity: !canSubmit || busy ? 0.35 : pressed ? 0.85 : 1,
            },
          ]}>
          <MaterialCommunityIcons
            name={startMode === 'setup' ? 'arrow-right-bold' : 'lock-open-variant'}
            size={20}
            color={colors.onPrimary}
          />
          <AppText style={[st.ctaTxt, {color: colors.onPrimary}]}>
            {startMode === 'setup' ? 'পরবর্তী' : 'আনলক করুন'}
          </AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  full: {flex: 1},
  glow: {position: 'absolute', width: 280, height: 280, borderRadius: 140},
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 6,
  },
  badge: {width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center'},
  badgeSmall: {width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center'},
  dotsRow: {flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 30, marginBottom: 24},
  dot: {width: 15, height: 15, borderRadius: 8, borderWidth: 1.5},
  bioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1.5,
    marginBottom: 24,
  },
  bioHint: {textAlign: 'center', fontSize: 12, marginBottom: 22, paddingHorizontal: 44, lineHeight: 18},
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 13,
    paddingHorizontal: 34,
    marginBottom: 28,
  },
  key: {width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center'},
  keyTxt: {fontSize: 25, fontWeight: '500'},
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    width: 272,
    borderRadius: 999,
  },
  ctaTxt: {fontSize: 15.5, fontWeight: '800'},
  row: {flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14},
});
