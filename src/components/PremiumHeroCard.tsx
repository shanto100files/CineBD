import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useM3Colors} from '../theme/M3PaletteContext';
import AppText from './ui/Text';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

interface PremiumHeroCardProps {
  /** Right side badge overlay (e.g. crown medal) — decorative. */
  showBadge?: boolean;
  /** Small plan label above the title (e.g. "PRO"). */
  planLabel?: string;
  title: string;
  subtitle?: string;
  /** Remaining days (renders the progress bar when provided). */
  daysLeft?: number;
  /** Total plan length in days (progress bar denominator). */
  totalDays?: number;
  expiryLabel?: string;
  /** Accent override; defaults to a golden MovieBox palette. */
  accent?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

const GOLD = '#E8B84B';
const GOLD_DEEP = '#8a5a20';
const GOLD_DARK = '#3a2313';

// MovieBox-style hero: rich golden gradient card with a slanted top edge,
// floating crown badge and a soft inner glow. Content (plan pills, price
// buttons) is passed as children so the card stays reusable.
const PremiumHeroCard = ({
  showBadge = true,
  planLabel,
  title,
  subtitle,
  daysLeft,
  totalDays,
  expiryLabel,
  children,
  footer,
}: PremiumHeroCardProps) => {
  const colors = useM3Colors();

  const progress = useMemo(() => {
    if (!daysLeft || !totalDays || totalDays <= 0) {
      return null;
    }
    return Math.max(0, Math.min(1, daysLeft / totalDays));
  }, [daysLeft, totalDays]);

  return (
    <View>
      <Svg
        width="100%"
        height={Math.round(14 + 120)}
        viewBox="0 0 400 134"
        style={{position: 'absolute', top: -12, left: 0, right: 0}}
        pointerEvents="none">
        <Path d="M0 40 Q200 -14 400 30 L400 134 L0 134 Z" fill={GOLD_DARK} />
      </Svg>

      <View
        style={{
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: GOLD_DARK,
          marginTop: 18,
        }}>
        {/* Gradient body */}
        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 20,
            paddingBottom: 18,
            backgroundColor: GOLD_DEEP,
          }}>
          {/* subtle top glow */}
          <View
            style={{
              position: 'absolute',
              top: -60,
              left: -30,
              right: -30,
              height: 160,
              backgroundColor: 'rgba(255,215,130,0.16)',
              borderBottomLeftRadius: 100,
              borderBottomRightRadius: 100,
            }}
          />

          <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
            <View style={{flex: 1, paddingRight: 56}}>
              {planLabel ? (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    marginBottom: 8,
                  }}>
                  <AppText
                    style={{
                      color: '#ffe9b8',
                      fontSize: 11,
                      fontWeight: '800',
                      letterSpacing: 1.2,
                    }}>
                    {planLabel}
                  </AppText>
                </View>
              ) : null}
              <AppText
                style={{
                  color: '#FFF6E0',
                  fontSize: 24,
                  fontWeight: '800',
                  textShadowColor: 'rgba(0,0,0,0.45)',
                  textShadowOffset: {width: 0, height: 2},
                  textShadowRadius: 6,
                }}>
                {title}
              </AppText>
              {subtitle ? (
                <AppText
                  style={{
                    color: 'rgba(255,240,205,0.85)',
                    fontSize: 13,
                    marginTop: 4,
                  }}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          </View>

          {children ? <View style={{marginTop: 14}}>{children}</View> : null}
        </View>

        {/* Crown badge floating at the top-right, over the slant */}
        {showBadge ? (
          <View
            style={{
              position: 'absolute',
              top: -16,
              right: 18,
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: GOLD,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 3,
              borderColor: '#fff3d0',
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 4},
              shadowOpacity: 0.4,
              shadowRadius: 8,
              elevation: 8,
            }}>
            <MaterialCommunityIcons name="crown" size={26} color="#5b3a10" />
          </View>
        ) : null}

        {/* Progress / expiry strip */}
        {expiryLabel ? (
          <View
            style={{
              backgroundColor: 'rgba(0,0,0,0.32)',
              paddingHorizontal: 18,
              paddingVertical: 10,
            }}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <AppText style={{color: '#ffe9b8', fontSize: 12, fontWeight: '700', flex: 1}}>
                {expiryLabel}
              </AppText>
              {progress !== null ? (
                <AppText style={{color: 'rgba(255,240,205,0.8)', fontSize: 11}}>
                  {Math.round(progress * 100)}% বাকি
                </AppText>
              ) : null}
            </View>
            {progress !== null ? (
              <View
                style={{
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  borderRadius: 4,
                  height: 5,
                  marginTop: 6,
                  overflow: 'hidden',
                }}>
                <View
                  style={{
                    backgroundColor: GOLD,
                    borderRadius: 4,
                    height: '100%',
                    width: `${Math.round(progress * 100)}%` as any,
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Footer (CTA button etc.) */}
        {footer ? (
          <View style={{paddingHorizontal: 18, paddingBottom: 18, paddingTop: 4}}>
            {footer}
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default PremiumHeroCard;
