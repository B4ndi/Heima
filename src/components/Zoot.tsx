import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { Txt } from '@/components/ui';
import { Zoot } from '@/constants/theme';
import { t } from '@/i18n';

// Easter egg for chores called "Zoot" or "Påfyll".

/**
 * Seven-leaflet leaf: narrow, serrated leaflets fanning out from the stem.
 * Drawn in a 100x100 box with the stem joint at (50, 64).
 */
const LEAFLETS = [
  { angle: -100, len: 24 },
  { angle: -66, len: 38 },
  { angle: -33, len: 50 },
  { angle: 0, len: 58 },
  { angle: 33, len: 50 },
  { angle: 66, len: 38 },
  { angle: 100, len: 24 },
];

/** One leaflet pointing up from (0,0): narrow at the base, widest past the middle, saw-toothed edges. */
function leafletPath(len: number): string {
  const w = len * 0.1; // half width at the widest point
  const teeth = 10;
  const right: string[] = [];
  const left: string[] = [];
  for (let k = 1; k < teeth; k++) {
    const tt = k / teeth;
    const y = -len * tt;
    const half = w * Math.sin(Math.PI * Math.pow(tt, 1.25));
    const tip = (y - len * 0.035).toFixed(2);
    right.push(`L${(half * 1.3).toFixed(2)},${tip} L${half.toFixed(2)},${y.toFixed(2)}`);
    left.unshift(`L${(-half).toFixed(2)},${y.toFixed(2)} L${(-half * 1.3).toFixed(2)},${tip}`);
  }
  return `M0,0 ${right.join(' ')} L0,${-len} ${left.join(' ')} Z`;
}
const LEAF_PATHS = LEAFLETS.map(({ angle, len }) => ({ angle, d: leafletPath(len) }));

export function CannabisLeaf({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <G fill={color}>
        {LEAF_PATHS.map(({ angle, d }) => (
          <Path key={angle} d={d} transform={`translate(50 64) rotate(${angle})`} />
        ))}
        <Path d="M49.2,64 L50.8,64 L51.8,90 L48.2,90 Z" />
      </G>
    </Svg>
  );
}

/** Leaves scattered in the background of the card. */
export function ZootBackdrop() {
  // kept inside the card horizontally: no sideways overflow at phone width
  const leaves = [
    { right: 12, bottom: 44, size: 76, rotate: 16, opacity: 0.6 },
    { right: 96, bottom: -14, size: 48, rotate: -22, opacity: 0.35 },
    { left: 8, bottom: -12, size: 40, rotate: 34, opacity: 0.3 },
  ];
  return (
    <>
      {leaves.map(({ size, rotate, opacity, ...pos }, i) => (
        <View
          key={i}
          aria-hidden
          pointerEvents="none"
          style={{
            position: 'absolute',
            opacity,
            transform: [{ rotate: `${rotate}deg` }],
            ...pos,
          }}>
          <CannabisLeaf size={size} color={Zoot.leaf} />
        </View>
      ))}
    </>
  );
}

/** "420" pill plus a laid-back line that stays the same for a given chore. */
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
          backgroundColor: Zoot.accent,
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
