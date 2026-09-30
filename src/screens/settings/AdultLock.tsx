import React, {useCallback, useEffect, useState} from 'react';
import {
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
        <AppText role="headlineSmallEmphasized" style={{color: colors.onSurface, marginBottom: 14}}>
          18+ লক সেটিংস
        </AppText>

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
  return (
    <View style={[st.full, {backgroundColor: colors.background}]}>
      <AppText role="headlineSmallEmphasized" style={{color: colors.onSurface, textAlign: 'center', marginTop: 60}}>
        {title}
      </AppText>
      <AppText style={{color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8, paddingHorizontal: 30}}>
        {startMode === 'setup'
          ? stage === 'enter'
            ? '৪-৮ ডিজিটের পিন দিন — এটা ছাড়া 18+ চালু হবে না'
            : 'আবার একই পিন দিন'
          : 'পিন দিন বা ফিঙ্গারপ্রিন্ট ব্যবহার করুন'}
      </AppText>

      {/* dots */}
      <View style={st.dotsRow}>
        {Array.from({length: Math.max(ADULT_PIN_MIN, pin.length || ADULT_PIN_MIN)}).map((_, i) => (
          <View
            key={i}
            style={[
              st.dot,
              {backgroundColor: i < pin.length ? colors.primary : colors.surfaceContainerHighest},
            ]}
          />
        ))}
      </View>

      {startMode === 'unlock' && pinSet && bioOn && bioAvailable && (
        <Pressable style={{alignItems: 'center', marginBottom: 8}} disabled={busy} onPress={() => tryBiometric()}>
          <MaterialCommunityIcons name="fingerprint" size={40} color={bioFailed ? colors.error : colors.primary} />
          <AppText style={{color: bioFailed ? colors.error : colors.primary, fontSize: 12}}>
            {bioFailed ? 'আবার ফিঙ্গারপ্রিন্ট দিন' : 'ফিঙ্গারপ্রিন্ট'}
          </AppText>
        </Pressable>
      )}
      {startMode === 'unlock' && pinSet && bioOn && !bioAvailable && (
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

      {startMode !== 'setup' && pin.length > 0 && pin.length < ADULT_PIN_MIN && (
        <View style={{alignItems: 'center', marginTop: 8}}>
          <Pressable
            focusable
            style={[
              st.doneBtn,
              {
                backgroundColor: colors.primaryContainer,
                borderRadius: 14,
                paddingHorizontal: 28,
                alignSelf: 'center',
              },
            ]}
            disabled={busy}
            onPress={() => submitPin(pin)}>
            <AppText
              style={{color: colors.onPrimaryContainer, fontWeight: '700'}}>
              আনলক করুন ({pin.length} ডিজিট)
            </AppText>
          </Pressable>
        </View>
      )}

      {startMode === 'setup' && pin.length >= ADULT_PIN_MIN && (
        <Pressable style={st.doneBtn} onPress={() => submitPin(pin)}>
          <AppText style={{color: colors.primary, fontWeight: '700'}}>পরবর্তী</AppText>
        </Pressable>
      )}
      {startMode !== 'setup' && pin.length >= ADULT_PIN_MIN && (
        <Pressable
          focusable
          style={[st.doneBtn, {backgroundColor: colors.primaryContainer, borderRadius: 14, paddingHorizontal: 28, alignSelf: 'center'}]}
          disabled={busy}
          onPress={() => submitPin(pin)}>
          <AppText style={{color: colors.onPrimaryContainer, fontWeight: '700'}}>আনলক করুন</AppText>
        </Pressable>
      )}
    </View>
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
          backgroundColor: colors.surfaceContainerHigh,
          transform: [{scale: isTv && focused ? 1.12 : 1}],
          borderWidth: isTv && focused ? 3 : 0,
          borderColor: isTv && focused ? colors.primary : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      {icon ? (
        <MaterialCommunityIcons name={icon} size={26} color={colors.onSurface} />
      ) : label ? (
        <AppText style={st.keyTxt}>{label}</AppText>
      ) : null}
    </Pressable>
  );
};

const st = StyleSheet.create({
  full: {flex: 1},
  dotsRow: {flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 30, marginBottom: 20},
  dot: {width: 14, height: 14, borderRadius: 7},
  pad: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, paddingHorizontal: 40},
  key: {width: 72, height: 62, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  keyTxt: {fontSize: 24, color: '#FFF'},
  doneBtn: {alignItems: 'center', padding: 14, marginTop: 8},
  row: {flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14},
});
