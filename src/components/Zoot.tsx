import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Txt } from '@/components/ui';
import { Zoot } from '@/constants/theme';
import { t } from '@/i18n';

// Easter egg for chores called "Zoot" or "Påfyll": a calm, cloudy card.

/** Soft cumulus cloud in a 100x60 box. */
const CLOUD_PATH =
  'M22,52 C10,52 4,44 4,36 C4,27 11,21 20,22 C21,12 30,6 40,7 C47,2 60,3 66,11 C76,8 87,15 87,25 ' +
  'C94,27 98,33 97,40 C96,47 90,52 82,52 Z';

export function Cloud({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size * 0.6} viewBox="0 0 100 60" aria-hidden>
      <Path d={CLOUD_PATH} fill={color} />
    </Svg>
  );
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** One cloud that drifts slowly up and sideways and back, unless the user prefers reduced motion. */
function DriftingCloud({ size, opacity, delay, style }: { size: number; opacity: number; delay: number; style: object }) {
  const reduce = useReduceMotion();
  const [drift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(drift, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, delay, drift]);
  return (
    <Animated.View
      aria-hidden
      pointerEvents="none"
      style={[
        { position: 'absolute' },
        style,
        {
          opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [opacity, opacity * 0.6] }),
          transform: [
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
          ],
        },
      ]}>
      <Cloud size={size} color={Zoot.cloud} />
    </Animated.View>
  );
}

/** Clouds drifting in the background of the card. */
export function ZootBackdrop() {
  // kept inside the card horizontally: no sideways overflow at phone width
  const clouds = [
    { size: 96, opacity: 0.7, delay: 0, style: { right: 10, bottom: 46 } },
    { size: 64, opacity: 0.45, delay: 1400, style: { right: 92, bottom: -10 } },
    { size: 52, opacity: 0.35, delay: 2600, style: { left: 6, bottom: -8 } },
  ];
  return (
    <>
      {clouds.map((c, i) => (
        <DriftingCloud key={i} {...c} />
      ))}
    </>
  );
}

/** Cloud pill plus a calm line that stays the same for a given chore. */
export function ZootTagline({ seed }: { seed: string }) {
  const lines = t.chores.zoot.taglines;
  const n = [...seed].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
      <View
        style={{
          backgroundColor: Zoot.cloud,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 3,
        }}>
        <Txt
          style={{
            color: Zoot.card,
            fontWeight: '800',
            fontSize: 13,
            lineHeight: 17,
          }}>
          {t.chores.zoot.badge}
        </Txt>
      </View>
      <Txt style={{ color: Zoot.accent, fontWeight: '700', flexShrink: 1 }}>{lines[n % lines.length]}</Txt>
    </View>
  );
}
