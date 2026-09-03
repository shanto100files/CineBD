import React, {useEffect, useRef} from 'react';
import {View, Animated, StyleSheet} from 'react-native';
import AppText from './ui/Text';

interface InitSplashProps {
  progress: number;
  status: string;
}

const InitSplash: React.FC<InitSplashProps> = ({progress, status}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, {opacity: fadeAnim}]}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <AppText style={styles.logo}>V</AppText>
        </View>
        <AppText style={styles.appName}>CineBD</AppText>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View
              style={[styles.progressFill, {width: widthInterpolated}]}
            />
          </View>
          <AppText style={styles.progressText}>{Math.round(progress)}%</AppText>
        </View>

        <AppText style={styles.status}>{status}</AppText>
      </View>

      <AppText style={styles.footer}>Powered by CineBD</AppText>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: '#fff',
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 40,
  },
  progressContainer: {
    width: '100%',
    maxWidth: 280,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 8,
  },
  status: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    marginTop: 16,
  },
  footer: {
    fontSize: 11,
    color: '#444',
    marginBottom: 40,
  },
});

export default React.memo(InitSplash);
