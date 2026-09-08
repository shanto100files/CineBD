import React, {useEffect, useRef, useState} from 'react';
import {View, Animated, StyleSheet, Image, ActivityIndicator, Text, TouchableOpacity} from 'react-native';
import BootSplash from 'react-native-bootsplash';

interface InitSplashProps {
  progress: number;
  status: string;
  onForceReady?: () => void;
}

const InitSplash: React.FC<InitSplashProps> = ({progress, status, onForceReady}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  useEffect(() => {
    // 1. Visible effect for JS splash
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // 2. Hide the native splash screen immediately
    const hideNativeSplash = async () => {
      try {
        await BootSplash.hide({ fade: true });
      } catch (e) {
        console.warn('Failed to hide native splash:', e);
      }
    };

    setTimeout(hideNativeSplash, 100);

    // 3. Safety timer
    const troubleTimer = setTimeout(() => {
      setShowTroubleshoot(true);
    }, 6000);

    return () => clearTimeout(troubleTimer);
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
        {/* Restored Large Logo */}
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />

        <ActivityIndicator size="large" color="#e11d48" style={styles.loader} />

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View
              style={[styles.progressFill, {width: widthInterpolated}]}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.status}>{status}</Text>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
        </View>

        {showTroubleshoot && (
          <View style={styles.troubleshootContainer}>
            <Text style={styles.troubleText}>Taking longer than usual?</Text>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={onForceReady}
            >
              <Text style={styles.skipButtonText}>Skip & Enter App</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.footer}>Powered by CineBD</Text>
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
    width: '100%',
  },
  logoImage: {
    width: 220,
    height: 220,
    marginBottom: 20,
  },
  loader: {
    marginBottom: 40,
  },
  progressContainer: {
    width: '100%',
    maxWidth: 300,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#222',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e11d48',
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  progressText: {
    fontSize: 11,
    color: '#666',
  },
  status: {
    fontSize: 12,
    color: '#888',
    flex: 1,
  },
  troubleshootContainer: {
    marginTop: 50,
    alignItems: 'center',
  },
  troubleText: {
    color: '#555',
    fontSize: 12,
    marginBottom: 15,
  },
  skipButton: {
    backgroundColor: '#e11d4815',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e11d48',
  },
  skipButtonText: {
    color: '#e11d48',
    fontSize: 12,
    fontWeight: 'bold',
  },
  footer: {
    fontSize: 11,
    color: '#333',
    marginBottom: 40,
  },
});

export default React.memo(InitSplash);
