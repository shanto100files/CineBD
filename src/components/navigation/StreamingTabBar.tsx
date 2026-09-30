import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import {StackActions} from '@react-navigation/native';
import {BlurView} from 'expo-blur';
import React, {useCallback, useRef, useState} from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {navigationRef} from '../../App';
import {settingsStorage} from '../../lib/storage';
import {
  FLOATING_TAB_BAR_MARGIN,
  FLOATING_TAB_BAR_RADIUS,
  GLASS_BORDER,
  GLASS_TINT,
} from '../../theme/layout';
import {useM3Colors} from '../../theme/M3PaletteContext';
import AppText from '../ui/Text';
import {AnimatedTabIcon, type AnimatedTabIconName} from './AnimatedTabIcon';

const TAB_ICONS: Record<string, AnimatedTabIconName> = {
  HomeStack: 'home',
  SearchStack: 'search',
  WatchListStack: 'watchlist',
  DownloadsStack: 'download',
  SettingsStack: 'settings',
};

// Root screen of each stack - tapping an already-active tab pops back here.
const TAB_ROOT_SCREENS: Record<string, string> = {
  HomeStack: 'Home',
  SearchStack: 'Search',
  WatchListStack: 'WatchList',
  DownloadsStack: 'Downloads',
  SettingsStack: 'Settings',
};

const ANDROID_TINT = 'rgba(14, 14, 16, 0.72)';

type TvTabPressableRef = React.ComponentRef<typeof Pressable> | null;

type TvTabItemProps = {
  routeKey: string;
  routeName: string;
  label: string;
  icon: AnimatedTabIconName;
  focused: boolean;
  accessibilityLabel?: string;
  registerRef: (key: string, el: TvTabPressableRef) => void;
  onFocusItem: (key: string | null) => void;
  onPressItem: (key: string, name: string) => void;
  colors: ReturnType<typeof useM3Colors>;
};

// Single tab in the TV top bar. Pressable is not focusable on Android TV by
// default — opt in explicitly and paint a clear D-pad focus ring.
const TvTabItem = ({
  routeKey,
  routeName,
  label,
  icon,
  focused,
  accessibilityLabel,
  registerRef,
  onFocusItem,
  onPressItem,
  colors,
}: TvTabItemProps) => {
  const [tvFocused, setTvFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? {selected: true} : undefined}
      accessibilityLabel={accessibilityLabel}
      focusable
      ref={el => {
        registerRef(routeKey, el);
      }}
      onFocus={() => {
        setTvFocused(true);
        onFocusItem(routeKey);
      }}
      onBlur={() => {
        setTvFocused(false);
        onFocusItem(null);
      }}
      onPress={() => onPressItem(routeKey, routeName)}
      style={({pressed}) => ({
        alignItems: 'center',
        backgroundColor: focused
          ? colors.secondaryContainer
          : tvFocused || pressed
            ? colors.surfaceContainerHigh
            : 'transparent',
        borderColor: tvFocused ? colors.primary : 'transparent',
        borderRadius: 14,
        borderWidth: 2,
        flexDirection: 'row',
        gap: 8,
        height: 40,
        paddingHorizontal: 14,
      })}>
      <AnimatedTabIcon
        name={icon}
        active={focused}
        color={
          focused
            ? colors.onSecondaryContainer
            : tvFocused
              ? colors.onSurface
              : colors.onSurfaceVariant
        }
        size={20}
      />
      <AppText
        role={focused ? 'labelMediumEmphasized' : 'labelMedium'}
        numberOfLines={1}
        style={{
          color: focused
            ? colors.onSecondaryContainer
            : tvFocused
              ? colors.onSurface
              : colors.onSurfaceVariant,
        }}>
        {label}
      </AppText>
    </Pressable>
  );
};

type TvTabBarProps = {
  state: BottomTabBarProps['state'];
  descriptors: BottomTabBarProps['descriptors'];
  navigation: BottomTabBarProps['navigation'];
};

// Android TV top navigation bar: a D-pad-first horizontal tab strip. Focus
// (not tap) drives it — LEFT/RIGHT moves between tabs, OK activates, and BACK
// returns focus from the content area to the bar. The active tab is always
// visible (pill) and the D-pad-focused tab shows a ring on top.
const TvTabBar = ({state, descriptors, navigation}: TvTabBarProps) => {
  const colors = useM3Colors();
  const insets = useSafeAreaInsets();
  const itemRefs = useRef<Record<string, TvTabPressableRef>>({});
  const [dpadFocusedKey, setDpadFocusedKey] = useState<string | null>(null);
  const backSubRef = useRef<{remove: () => void} | null>(null);

  const activeRouteKey = state.routes[state.index]?.key;

  const registerRef = useCallback((key: string, el: TvTabPressableRef) => {
    if (el) {
      itemRefs.current[key] = el;
    } else {
      delete itemRefs.current[key];
    }
  }, []);

  const focusTab = useCallback((key: string) => {
    itemRefs.current[key]?.focus();
  }, []);

  // BACK with the bar unfocused pulls focus back to the active tab instead of
  // exiting; the active tab is highlighted so the ring is unambiguous.
  const requestFocusFromContent = useCallback(() => {
    const key = activeRouteKey ?? state.routes[0]?.key;
    if (key) {
      focusTab(key);
      return true;
    }
    return false;
  }, [activeRouteKey, focusTab, state.routes]);

  React.useEffect(() => {
    if (!Platform.isTV) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Only intercept when no tab item currently holds D-pad focus.
      if (dpadFocusedKey) {
        return false;
      }
      const root = navigationRef.getParent?.() == null;
      if (!root) {
        return false;
      }
      return requestFocusFromContent();
    });
    backSubRef.current = sub;
    return () => {
      sub.remove();
      backSubRef.current = null;
    };
  }, [dpadFocusedKey, requestFocusFromContent]);

  const handlePress = useCallback(
    (key: string, name: string) => {
      const index = state.routes.findIndex(r => r.key === key);
      const focused = index === state.index;
      const route = state.routes[index];
      if (!route) {
        return;
      }
      const descriptor = descriptors[route.key];
      void descriptor;
      const event = navigation.emit({
        type: 'tabPress',
        target: key,
        canPreventDefault: true,
      });
      if (focused && !event.defaultPrevented) {
        // Re-activating the current tab pops its stack to the root.
        navigation.dispatch(StackActions.popToTop());
        return;
      }
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(name, route.params);
      }
    },
    [descriptors, navigation, state.index, state.routes],
  );

  return (
    <View
      style={{
        backgroundColor: 'rgba(10, 10, 12, 0.86)',
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingBottom: 6,
        paddingLeft: Math.max(insets.left, 24),
        paddingRight: Math.max(insets.right, 24),
        paddingTop: Math.max(insets.top, 12),
      }}>
      <View style={{flexDirection: 'row', gap: 10}}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof descriptor.options.tabBarLabel === 'string'
              ? descriptor.options.tabBarLabel
              : typeof descriptor.options.title === 'string'
                ? descriptor.options.title
                : route.name;
          const icon = TAB_ICONS[route.name] ?? 'home';
          return (
            <TvTabItem
              key={route.key}
              routeKey={route.key}
              routeName={route.name}
              label={label}
              icon={icon}
              focused={focused}
              accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
              registerRef={registerRef}
              onFocusItem={setDpadFocusedKey}
              onPressItem={handlePress}
              colors={colors}
            />
          );
        })}
      </View>
    </View>
  );
};

const StreamingTabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  if (Platform.isTV) {
    return <TvTabBar state={state} descriptors={descriptors} navigation={navigation} />;
  }
  const colors = useM3Colors();
  const insets = useSafeAreaInsets();
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isNavigationRail = Math.min(windowWidth, windowHeight) >= 600;
  const showLabels = settingsStorage.showTabBarLabels();
  const onHeightChange = React.useContext(BottomTabBarHeightCallbackContext);

  if (isNavigationRail) {
    return (
      <View
        style={{
          backgroundColor: colors.surfaceContainerHigh,
          borderRightColor: colors.outlineVariant,
          borderRightWidth: StyleSheet.hairlineWidth,
          height: '100%',
          paddingBottom: Math.max(insets.bottom, 12),
          paddingLeft: insets.left,
          paddingRight: 4,
          paddingTop: Math.max(insets.top, 16),
          width: 96 + insets.left,
        }}>
        <View style={{alignItems: 'center', flex: 1, flexDirection: 'column', gap: 8}}>
          {state.routes.map((route, index) => {
            const descriptor = descriptors[route.key];
            const focused = state.index === index;
            const label =
              typeof descriptor.options.tabBarLabel === 'string'
                ? descriptor.options.tabBarLabel
                : typeof descriptor.options.title === 'string'
                  ? descriptor.options.title
                  : route.name;
            const icon = TAB_ICONS[route.name] ?? 'home';
            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? {selected: true} : {}}
                accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
                activeOpacity={0.8}
                onLongPress={() =>
                  navigation.emit({type: 'tabLongPress', target: route.key})
                }
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (focused && !event.defaultPrevented) {
                    navigation.dispatch(StackActions.popToTop());
                    return;
                  }
                  if (!focused && !event.defaultPrevented) {
                    if (settingsStorage.isHapticFeedbackEnabled()) {
                      ReactNativeHapticFeedback.trigger('effectTick', {
                        enableVibrateFallback: true,
                        ignoreAndroidSystemSettings: false,
                      });
                    }
                    navigation.navigate(route.name, route.params);
                  }
                }}
                style={{
                  alignItems: 'center',
                  height: showLabels ? 72 : 56,
                  justifyContent: 'center',
                  minWidth: 48,
                  width: 88,
                }}>
                <View
                  pointerEvents="none"
                  style={{
                    alignItems: 'center',
                    backgroundColor: focused
                      ? colors.secondaryContainer
                      : 'transparent',
                    borderRadius: 16,
                    height: 32,
                    justifyContent: 'center',
                    overflow: 'hidden',
                    width: 56,
                  }}>
                  <AnimatedTabIcon
                    name={icon}
                    active={focused}
                    color={
                      focused
                        ? colors.onSecondaryContainer
                        : colors.onSurfaceVariant
                    }
                    size={24}
                  />
                </View>
                {showLabels ? (
                  <AppText
                    role={focused ? 'labelMediumEmphasized' : 'labelMedium'}
                    numberOfLines={1}
                    style={{
                      color: focused
                        ? colors.onSurface
                        : colors.onSurfaceVariant,
                      marginTop: 4,
                      textAlign: 'center',
                    }}>
                    {label}
                  </AppText>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // Bottom bar: floating smoked-glass pill — blurred dark surface with a
  // hairline edge, hovering above the safe area so content scrolls under it.
  return (
    <View
      onLayout={event => onHeightChange?.(event.nativeEvent.layout.height)}
      style={{
        backgroundColor: 'transparent',
        borderColor: GLASS_BORDER,
        borderRadius: FLOATING_TAB_BAR_RADIUS,
        borderWidth: StyleSheet.hairlineWidth,
        bottom: Math.max(insets.bottom, 8),
        elevation: 10,
        left: FLOATING_TAB_BAR_MARGIN,
        overflow: 'hidden',
        paddingBottom: 4,
        paddingTop: 6,
        position: 'absolute',
        right: FLOATING_TAB_BAR_MARGIN,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.45,
        shadowRadius: 18,
      }}>
      {Platform.OS === 'ios' ? (
        <BlurView
          blurMethod="dimezisBlurView"
          intensity={70}
          style={StyleSheet.absoluteFill}
          tint="dark"
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {backgroundColor: Platform.OS === 'ios' ? GLASS_TINT : ANDROID_TINT},
        ]}
      />
      <View
        style={{
          flexDirection: 'row',
          height: showLabels ? 58 : 42,
        }}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof descriptor.options.tabBarLabel === 'string'
              ? descriptor.options.tabBarLabel
              : typeof descriptor.options.title === 'string'
                ? descriptor.options.title
                : route.name;
          const icon = TAB_ICONS[route.name] ?? 'home';

          const onPress = () => {
            void descriptor;
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (focused && !event.defaultPrevented) {
              // Re-tapping the active tab pops its stack back to the root
              // (e.g. Settings -> Friends stays stuck otherwise).
              navigation.dispatch(StackActions.popToTop());
              return;
            }
            if (!focused && !event.defaultPrevented) {
              if (settingsStorage.isHapticFeedbackEnabled()) {
                ReactNativeHapticFeedback.trigger('effectTick', {
                  enableVibrateFallback: true,
                  ignoreAndroidSystemSettings: false,
                });
              }
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? {selected: true} : {}}
              accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
              activeOpacity={0.8}
              onLongPress={() =>
                navigation.emit({type: 'tabLongPress', target: route.key})
              }
              onPress={onPress}
              style={{
                alignItems: 'center',
                flex: isNavigationRail ? undefined : 1,
                height: isNavigationRail
                  ? showLabels
                    ? 72
                    : 56
                  : showLabels
                    ? 58
                    : 42,
                justifyContent: 'center',
                minWidth: 48,
                width: isNavigationRail ? 88 : undefined,
              }}>
              <View
                pointerEvents="none"
                style={{
                  alignItems: 'center',
                  backgroundColor: focused
                    ? colors.secondaryContainer
                    : 'transparent',
                  borderRadius: 16,
                  height: 32,
                  justifyContent: 'center',
                  overflow: 'hidden',
                  width: 56,
                }}>
                {focused ? (
                  <View
                    pointerEvents="none"
                    style={{
                      backgroundColor: colors.primary,
                      borderRadius: 2,
                      height: 3,
                      position: 'absolute',
                      top: -6,
                      width: 22,
                    }}
                  />
                ) : null}
                <AnimatedTabIcon
                  name={icon}
                  active={focused}
                  color={
                    focused
                      ? colors.onSecondaryContainer
                      : colors.onSurfaceVariant
                  }
                  size={24}
                />
              </View>
              {showLabels ? (
                <AppText
                  role={focused ? 'labelMediumEmphasized' : 'labelMedium'}
                  numberOfLines={1}
                  style={{
                    color: focused ? colors.onSurface : colors.onSurfaceVariant,
                    marginTop: 4,
                    textAlign: 'center',
                  }}>
                  {label}
                </AppText>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default StreamingTabBar;
