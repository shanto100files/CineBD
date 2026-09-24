import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import {View} from 'react-native';
import {Image} from 'expo-image';
import {getColors} from 'react-native-image-colors';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {HomeStackParamList} from '../App';
import {useHeroMetadata} from '../lib/hooks/useHomePageData';
import useContentStore from '../lib/zustand/contentStore';
import useHeroStore from '../lib/zustand/herostore';
import useWatchListStore from '../lib/zustand/watchListStore';
import {useM3Colors} from '../theme/M3PaletteContext';
import {mixHex} from '../theme/seeds';
import Button from './ui/Button';
import AppText from './ui/Text';

interface HeroProps {
  isDrawerOpen: boolean;
  onOpenDrawer: () => void;
  disableDrawer?: boolean;
}

const IMAGE_COLOR_FALLBACK = '#FFFFFF';

const getReadableContentColor = (backgroundColor: string) => {
  const hex = backgroundColor.replace('#', '').slice(0, 6);
  if (hex.length !== 6) {
    return '#211F1E';
  }
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 145
    ? '#211F1E'
    : '#FFFFFF';
};

const HeroTopButton = ({
  disabled = false,
  icon,
  iconColor,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  label: string;
  onPress: () => void;
}) => (
  <MaterialCommunityIcons name={icon} size={30} color={iconColor} />
);

const Hero = memo(({isDrawerOpen, onOpenDrawer, disableDrawer}: HeroProps) => {
  const colors = useM3Colors();
  const insets = useSafeAreaInsets();
  const [logoFailed, setLogoFailed] = useState(false);
  const [heroColor, setHeroColor] = useState('#FFFFFF');
  const provider = useContentStore(state => state.provider);
  const hero = useHeroStore(state => state.hero);
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const {data: heroData, error} = useHeroMetadata(
    hero?.link || '',
    provider.value,
  );

  const imageSource = useMemo(
    () => ({
      uri:
        heroData?.background ||
        heroData?.image ||
        heroData?.poster ||
        hero?.image ||
        '',
    }),
    [hero?.image, heroData],
  );
  const imageUri = imageSource.uri;

  useEffect(() => {
    setHeroColor(IMAGE_COLOR_FALLBACK);
  }, [hero?.link]);

  useEffect(() => {
    setLogoFailed(false);
  }, [heroData?.logo]);

  const updateHeroColor = useCallback(async () => {
    if (!imageUri) {
      return;
    }
    try {
      const imageColors = await getColors(imageUri, {
        cache: true,
        fallback: IMAGE_COLOR_FALLBACK,
        key: `hero-accent-v2:${imageUri}`,
        pixelSpacing: 8,
      });
      const candidates =
        imageColors.platform === 'android'
          ? [
              imageColors.lightVibrant,
              imageColors.vibrant,
              imageColors.dominant,
              imageColors.average,
              imageColors.darkVibrant,
            ]
          : imageColors.platform === 'ios'
            ? [imageColors.primary, imageColors.secondary]
            : [imageColors.vibrant, imageColors.dominant];
      const extractedColor = candidates.find(
        candidate =>
          candidate.toUpperCase() !== IMAGE_COLOR_FALLBACK.toUpperCase(),
      );
      if (extractedColor) {
        setHeroColor(mixHex(extractedColor, '#FFFFFF', 0.72));
      }
    } catch {}
  }, [imageUri]);

  const genres = useMemo(
    () => (heroData?.genre || heroData?.tags || []).slice(0, 3),
    [heroData],
  );

  const openDetails = useCallback(() => {
    if (!hero?.link) {
      return;
    }
    navigation.navigate('Info', {
      link: hero.link,
      provider: provider.value,
      poster: heroData?.poster || heroData?.image || heroData?.background,
    });
  }, [hero, heroData, navigation, provider.value]);

  const heroItem = useMemo(() => {
    const link = hero?.link;
    const title = heroData?.title || hero?.title;
    if (!link || !title) {
      return null;
    }
    return {
      link,
      title,
      poster: heroData?.poster || heroData?.image || hero?.image || '',
      provider: provider.value,
    };
  }, [hero, heroData, provider.value]);
  const inWatchList = useWatchListStore(state =>
    heroItem ? state.watchList.some(item => item.link === heroItem.link) : false,
  );
  const addItem = useWatchListStore(state => state.addItem);
  const removeItem = useWatchListStore(state => state.removeItem);
  const toggleWatchList = useCallback(() => {
    if (!heroItem) {
      return;
    }
    if (inWatchList) {
      removeItem(heroItem.link);
    } else {
      addItem(heroItem);
    }
  }, [heroItem, inWatchList, addItem, removeItem]);

  // Ken-Burns slow zoom, restarted per hero change — subtle cinema motion.
  const kenBurns = useSharedValue(1);
  useEffect(() => {
    kenBurns.value = 1;
    kenBurns.value = withTiming(1.09, {duration: 18000, easing: Easing.linear});
  }, [hero?.link, kenBurns]);
  const heroImageStyle = useAnimatedStyle(() => ({
    transform: [{scale: kenBurns.value}],
  }));

  return (
    <View
      style={{
        backgroundColor: colors.surfaceContainerLow,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        height: 460,
        overflow: 'hidden',
      }}>
      {!imageUri ? (
        <View
          style={{flex: 1, backgroundColor: colors.surfaceContainerHighest}}
        />
      ) : (
        <Animated.View
          entering={FadeIn.duration(450)}
          style={[{height: '100%', width: '100%'}, heroImageStyle]}>
          <Animated.Image
            source={imageSource}
            onLoad={updateHeroColor}
            resizeMode="cover"
            style={{height: '100%', width: '100%'}}
          />
        </Animated.View>
      )}

      <LinearGradient
        colors={[
          'rgba(0,0,0,0.3)',
          'rgba(0,0,0,0.12)',
          'rgba(0,0,0,0.78)',
          colors.background,
        ]}
        locations={[0, 0.3, 0.72, 1]}
        style={{position: 'absolute', inset: 0}}
      />

      {!disableDrawer && (
        <View
          style={{
            position: 'absolute',
            right: 16,
            top: insets.top + 6,
          }}>
          <MaterialCommunityIcons
            name="menu"
            size={30}
            color={heroColor}
          />
        </View>
      )}

      <Animated.View
        entering={FadeInDown.delay(100).springify().damping(18).stiffness(180)}
        style={{
          alignItems: 'center',
          // Lifted so the overlap strip (HeroStrip) floating over the hero's
          // bottom edge never covers the Play / My List actions.
          bottom: 64,
          left: 20,
          position: 'absolute',
          right: 20,
        }}>
        {heroData?.logo && !logoFailed ? (
          <Image
            source={{uri: heroData.logo}}
            onError={() => setLogoFailed(true)}
            resizeMode="contain"
            style={{height: 94, width: 280}}
          />
        ) : heroData?.title || hero?.title ? (
          <AppText
            numberOfLines={2}
            role="displaySmallEmphasized"
            style={{
              color: '#FFFFFF',
              letterSpacing: 0.4,
              maxWidth: 320,
              textShadowColor: 'rgba(0,0,0,0.65)',
              textShadowOffset: {width: 0, height: 2},
              textShadowRadius: 12,
              textAlign: 'center',
            }}>
            {heroData?.title || hero?.title}
          </AppText>
        ) : null}

        {genres.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              marginTop: 10,
            }}>
            {genres.map((genre: string) => (
              <View
                key={genre}
                style={{
                  backgroundColor: 'rgba(32, 28, 28, 0.82)',
                  borderColor: 'rgba(255,255,255,0.24)',
                  borderRadius: 12,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}>
                <AppText
                  role="labelMediumEmphasized"
                  style={{color: '#FFFFFF'}}>
                  {genre}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: 12,
            justifyContent: 'center',
            marginTop: 14,
            width: '100%',
          }}>
          <Button
            variant="white"
            onPress={openDetails}
            style={{borderRadius: 24, minWidth: 132}}>
            ▶  Play
          </Button>
          <Button
            variant="tonal"
            containerColor="rgba(60,60,64,0.85)"
            contentColor="#FFFFFF"
            onPress={toggleWatchList}
            style={{borderRadius: 24, minWidth: 132}}>
            {inWatchList ? '✓  In My List' : '+  My List'}
          </Button>
        </View>
        {error ? (
          <AppText
            role="bodySmall"
            style={{
              color: colors.onSurfaceVariant,
              marginTop: 10,
              textAlign: 'center',
            }}>
            Some featured details are unavailable
          </AppText>
        ) : null}
      </Animated.View>
    </View>
  );
});

Hero.displayName = 'Hero';

export default Hero;
