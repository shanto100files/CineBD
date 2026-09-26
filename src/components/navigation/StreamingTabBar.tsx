import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {StackActions} from '@react-navigation/native';
import React from 'react';
import {
  Platform,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {settingsStorage} from '../../lib/storage';
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

const StreamingTabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  const colors = useM3Colors();
  const insets = useSafeAreaInsets();
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isNavigationRail = Math.min(windowWidth, windowHeight) >= 600;
  const showLabels = settingsStorage.showTabBarLabels();
  const bottomBarPadding = Math.max(insets.bottom, 8);

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

  // Bottom bar: cinematic glass — translucent dark surface with a hairline
  // top edge and an accent spotlight above the active tab.
  return (
    <View
      style={{
        backgroundColor: 'rgba(18,18,20,0.94)',
        borderTopColor: 'rgba(255,255,255,0.08)',
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingBottom: bottomBarPadding,
        paddingTop: 6,
      }}>
      <View
        style={{
          alignItems: isNavigationRail ? 'center' : undefined,
          flex: isNavigationRail ? 1 : undefined,
          flexDirection: isNavigationRail ? 'column' : 'row',
          gap: isNavigationRail ? 8 : undefined,
          height: isNavigationRail ? undefined : showLabels ? 58 : 42,
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
