// @ts-nocheck
import React, {createRef, useEffect, useRef} from 'react';
import {Animated, Platform, TouchableHighlight} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {Control} from '../Control';
import {NullControl} from '../NullControl';
import type {VideoAnimations} from '../../types';
import {styles} from './styles';
import {Loader} from '../Loader';

export const playPauseRef = createRef<TouchableHighlight>();

interface PlayPauseProps {
  animations: VideoAnimations;
  disablePlayPause: boolean;
  paused: boolean;
  buffering: boolean;
  togglePlayPause: () => void;
  resetControlTimeout: () => void;
  showControls: boolean;
  primaryColor: string;
}

// The rewind/forward buttons live in their own layer (see SeekControls) so the
// double-tap seek animation stays visible while the controls are hidden.
export const PlayPause = ({
  animations: {AnimatedView, ...animations},
  disablePlayPause,
  paused,
  buffering,
  togglePlayPause,
  resetControlTimeout,
  showControls,
  primaryColor,
}: PlayPauseProps) => {
  const animatedStyles = {
    zIndex: showControls ? 99999 : 0,
  };

  // YouTube-style feedback: a short scale bounce fires whenever the play
  // state flips (both on tap and on external pause/resume changes).
  const scale = useRef(new Animated.Value(1)).current;
  const prevPaused = useRef(paused);
  useEffect(() => {
    if (prevPaused.current === paused) {
      return;
    }
    prevPaused.current = paused;
    scale.setValue(0.86);
    Animated.spring(scale, {
      toValue: 1.06,
      speed: 40,
      bounciness: 12,
      useNativeDriver: true,
    }).start(() => {
      Animated.spring(scale, {
        toValue: 1,
        speed: 26,
        bounciness: 8,
        useNativeDriver: true,
      }).start();
    });
  }, [paused, scale]);

  if (disablePlayPause) {
    return <NullControl />;
  }

  return (
    <AnimatedView
      pointerEvents={'box-none'}
      style={[styles.container, animatedStyles, animations.controlsOpacity]}>
      <Control
        disabled={!showControls}
        callback={togglePlayPause}
        resetControlTimeout={resetControlTimeout}
        style={styles.playContainer}
        controlRef={playPauseRef}
        {...(Platform.isTV ? {hasTVPreferredFocus: showControls} : {})}>
        {buffering ? (
          <Loader color={primaryColor} />
        ) : (
          <Animated.View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 92,
              height: 92,
              borderRadius: 46,
              backgroundColor: 'rgba(0,0,0,0.36)',
              transform: [{scale}],
            }}>
            <MaterialIcons
              name={paused ? 'play-arrow' : 'pause'}
              size={56}
              color="rgba(255,255,255,0.96)"
            />
          </Animated.View>
        )}
      </Control>
    </AnimatedView>
  );
};
