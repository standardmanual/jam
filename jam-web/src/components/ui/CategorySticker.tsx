import React, { useId } from 'react';
import type { CSSProperties, SVGAttributes } from 'react';

/**
 * CategorySticker — 홈피드 «분류 스티커». 티켓 20261122_2227(상위 20261122_2217 확정 결정 §4).
 *
 * 문구·색 짝·로고 글자만 받는 정적 장식 SVG다. 모양은 정원(92×92) 하나이고 윤곽·글자 선은 SVG 호라 어떤 배율에서도 완전한 원이다.
 * 이전에는 시드마다 윤곽이 달라지는 조약돌·물결 덩어리 두 모양이었다. 조약돌은 2026-11-27에 정원이 됐고(티켓 20261127_0746),
 * 물결 덩어리는 같은 날 소스에서 걷었다(티켓 20261127_0756). 그래서 모양을 고르는 `shape`와 윤곽을 정하는 `seed`도 없다.
 * 계산은 순수 함수 `pebbleShape`·`fitRingText`로 분리했고 컴포넌트는 그 결과를 그리기만 한다.
 *
 * 기하 수치(92×92 · 글자 선 15px · 테두리 2px · 로고 외곽선 1.6px)는 장식 도형의 기하라 간격 토큰 대상이 아니고 아래 상수로 둔다.
 */

/** 보색 짝 8개. 앞이 바탕, 뒤가 로고 글자 */
export type CategoryStickerPair =
  | 'yellow-purple'
  | 'purple-yellow'
  | 'green-pink'
  | 'pink-green'
  | 'sky-red'
  | 'red-sky'
  | 'blue-yellow'
  | 'yellow-blue';

export interface CategoryStickerProps extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  /**
   * 둘레에 되풀이할 분류 문구(ACTIVITY·ITEM·MISSION·CHECK IN·COLLECTION·DROP·PICKUP).
   * 임의 문자열도 받고 길면 글자가 줄어든다. 비면 둘레 글자 없이 바탕과 로고만 그린다.
   */
  label?: string;
  /** 색 짝 이름. 알 수 없는 이름은 타입이 막는다(첫 짝으로 대체하지 않는다) */
  pair?: CategoryStickerPair;
  /** 가운데 로고 글자 */
  letter?: 'J' | 'a' | 'm';
  /** 배치용 클래스만 연다 */
  className?: string;
  style?: CSSProperties;
}

export interface StickerShape {
  width: number;
  height: number;
  points: [number, number][];
  outlineD: string;
  ringPoints: [number, number][];
  ringD: string;
  ringLength: number;
  center: [number, number];
  glyphHeight: number;
}
export interface RingText {
  text: string;
  repeat: number;
  fontSize: number;
  letterSpacing: number;
  fits: boolean;
  content: string;
}

/** 좌표 한 점 */
type Pt = [number, number];

/* ───────── 확정 사양 상수 ───────── */
export const PEBBLE_SIZE = { width: 92, height: 92 };
const PEBBLE_RING_INSET = 15;
const PEBBLE_FONT_SIZE = 11;
/** 글자 크기 하한. 이 밑이면 «하한 미달»(fits=false)로 알린다 — 글자를 압축하거나 자르지 않는다 */
export const MIN_FONT_SIZE = 7;
const BORDER_WIDTH = 2;
const GLYPH_OUTLINE = 1.6;
const PEBBLE_GLYPH_HEIGHT = 28;
const FONT_WEIGHT = 900;
/** 글자가 둘레 글자 선 끝에 닿아 잘리지 않게 두는 여유 비율 */
const RING_USABLE = 0.95;
/** 남는 길이를 자간으로 채울 때의 상한(글자 크기 대비). 넘는 만큼은 꼬리 쪽 빈칸으로 둔다 */
const MAX_LETTER_SPACING_EM = 0.15;

/** 보색 짝 8개. 앞이 바탕, 뒤가 로고 글자. 값은 hex가 아니라 var(--jam-*)로만 참조한다 */
export const STICKER_COLOR_PAIRS: Record<CategoryStickerPair, { base: string; glyph: string }> = {
  'yellow-purple': { base: 'var(--jam-yellow)', glyph: 'var(--jam-purple)' },
  'purple-yellow': { base: 'var(--jam-purple)', glyph: 'var(--jam-yellow)' },
  'green-pink': { base: 'var(--jam-green)', glyph: 'var(--jam-pink)' },
  'pink-green': { base: 'var(--jam-pink)', glyph: 'var(--jam-green)' },
  'sky-red': { base: 'var(--jam-sky)', glyph: 'var(--jam-red)' },
  'red-sky': { base: 'var(--jam-red)', glyph: 'var(--jam-sky)' },
  'blue-yellow': { base: 'var(--jam-blue)', glyph: 'var(--jam-yellow)' },
  'yellow-blue': { base: 'var(--jam-yellow)', glyph: 'var(--jam-blue)' },
};

/**
 * 로고 글자 — `design-system/assets/logo/jam-logo.svg`(viewBox 0 0 2610 865)의 세 path를 그대로 옮겼다.
 * 원본 순서는 J · m · a(둘째 path가 m, 셋째가 a)이고 bbox는 path 좌표에서 읽은 값이다.
 */
export const LOGO_GLYPHS: Record<'J' | 'a' | 'm', { bbox: [number, number, number, number]; d: string; evenodd?: boolean }> = {
  J: {
    bbox: [0, 0, 574.975, 865],
    d: 'M574.975 543.552C574.974 721.113 430.977 864.999 253.396 865H6.68984e-05V543.552H178.556C219.923 543.552 253.45 510.039 253.45 468.689L253.45 231.373L0 231.913L6.68984e-05 0H574.975V543.552Z',
  },
  m: {
    bbox: [1529.69, 0, 2610, 865],
    d: 'M2339.95 0C2489.09 0 2610 120.861 2610 269.937V865H2286.53V419.717H2231.58V865H1908.11V419.717H1853.17V865H1529.69V269.937C1529.7 120.861 1650.61 0 1799.74 0C1948.88 8.53997e-05 2069.79 73.9985 2069.79 223.075C2069.79 73.9443 2190.7 0 2339.84 0H2339.95Z',
  },
  a: {
    bbox: [645, 0, 1444.58, 865],
    d: 'M1139.15 771.563C1085.51 823.514 1036.69 839.737 962.74 857.985C948.464 861.506 924.242 862.081 913.901 865H878.922C859.432 861.415 837.819 859.194 819.226 853.044C680.347 807.104 618.661 694.265 645.377 555.266C684.373 352.362 868.855 300.529 1050.31 300.961H1156.16V218.959L913.9 218.885C868.433 218.87 820.94 219.684 775.651 218.825C774.8 176.524 774.169 134.218 773.755 91.9114C773.567 64.3044 774.151 27.0514 772.335 0H1163.99C1318.96 0 1444.58 125.602 1444.58 280.54V865H1139.15V771.563ZM1143.52 489.614C1142.72 572.576 1134 623.439 1048.98 650.04C1014.6 660.416 975.792 660.374 944.536 638.103C890.704 599.744 900.846 538.782 952.662 504.215C966.849 494.75 984.607 492.08 1001.57 489.614C1044.74 489.614 1102.26 489.614 1143.52 489.614Z',
    evenodd: true,
  },
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ───────── 모양 ───────── */

/**
 * 조약돌 — 정확한 원(92×92). 지름은 상자에서 테두리 폭만큼 안쪽이고, 글자 선은 같은 중심의 원(가장자리에서 15px 안쪽)이다.
 * 이전에는 시드마다 굴곡·기울임이 다른 «둥근 불규칙 원»이었으나 사용자 지시로 정원으로 바꿨다(티켓 20261127_0746).
 * 윤곽·글자 선은 SVG 호(arc)로 그려 어떤 배율에서도 완전한 원이다.
 * `points`·`ringPoints`는 시험·배치 계산용 표본점이다.
 */
export function pebbleShape(): StickerShape {
  const { width, height } = PEBBLE_SIZE;
  const cx = width / 2;
  const cy = height / 2;
  const r = (Math.min(width, height) - BORDER_WIDTH) / 2;
  const rr = r - PEBBLE_RING_INSET;
  const circlePoints = (radius: number, count: number): Pt[] =>
    Array.from({ length: count }, (_, i): Pt => {
      const t = (i / count) * Math.PI * 2 - Math.PI / 2; // 위에서 시작, 시계 방향
      return [r2(cx + radius * Math.cos(t)), r2(cy + radius * Math.sin(t))];
    });
  // 위쪽 중앙에서 시작해 시계 방향으로 한 바퀴를 도는 호 두 개로 닫는다(글자가 윗줄 가운데서 읽힌다)
  const arcPath = (radius: number) =>
    `M${r2(cx)} ${r2(cy - radius)}A${r2(radius)} ${r2(radius)} 0 1 1 ${r2(cx)} ${r2(cy + radius)}A${r2(radius)} ${r2(radius)} 0 1 1 ${r2(cx)} ${r2(cy - radius)}Z`;
  return {
    width,
    height,
    points: circlePoints(r, 120),
    outlineD: arcPath(r),
    ringPoints: circlePoints(rr, 72),
    ringD: arcPath(rr),
    ringLength: r2(2 * Math.PI * rr),
    center: [cx, cy],
    glyphHeight: PEBBLE_GLYPH_HEIGHT,
  };
}

/* ───────── 둘레 글자 ───────── */
/**
 * 굵기 900 한 글자 폭(em). Noto Sans KR 900을 실제로 재서(2026-11-23) 4% 여유를 더한 값이다.
 * 예전 추정(평균 0.84em)은 실제보다 25% 넓어 둘레의 70~77%만 채우고 한쪽이 비었다
 */
const CHAR_EM: Record<string, number> = {
  A: 0.69, B: 0.72, C: 0.69, D: 0.76, E: 0.66, F: 0.63, G: 0.76, H: 0.8, I: 0.37, J: 0.61, K: 0.74, L: 0.62, M: 0.91,
  N: 0.79, O: 0.82, P: 0.71, Q: 0.82, R: 0.74, S: 0.66, T: 0.67, U: 0.79, V: 0.67, W: 0.97, X: 0.68, Y: 0.63, Z: 0.64,
  ' ': 0.29, '·': 0.37,
};
function charEm(ch: string): number {
  if (CHAR_EM[ch] !== undefined) return CHAR_EM[ch];
  if (/[가-힣]/.test(ch)) return 1.02;
  return 0.84;
}
const textEm = (s: string) => [...s].reduce((a, ch) => a + charEm(ch), 0);

/**
 * 둘레 글자 배치. «LABEL · »을 최소 두 번 되풀이해 한 바퀴(ringLength)를 채운다.
 * 기준 크기에서 두 번이 안 들어가면 글자를 줄이고(fits=false는 하한 7px 미달),
 * 남는 길이는 자간(letterSpacing)으로 나눠 채운다. 글자는 압축하지 않는다.
 */
export function fitRingText(label: string, ringLength: number, baseSize: number): RingText {
  const text = String(label ?? '').trim().toUpperCase();
  if (!text) return { text: '', repeat: 0, fontSize: baseSize, letterSpacing: 0, fits: true, content: '' };
  const unit = `${text} · `;
  const unitEm = textEm(unit);
  const usable = ringLength * RING_USABLE;
  // 가장 가까운 정수만큼 되풀이한다(내림이면 한쪽이 비고, 올림이면 글자가 조금 줄어 맞는다)
  const repeat = Math.max(2, Math.round(usable / (unitEm * baseSize)));
  const fontSize = Math.floor(Math.min(baseSize, usable / (repeat * unitEm)) * 100) / 100;
  const used = repeat * unitEm * fontSize;
  const letterSpacing = r2(
    Math.min(MAX_LETTER_SPACING_EM * fontSize, Math.max(0, usable - used) / (repeat * [...unit].length)),
  );
  return {
    text,
    repeat,
    fontSize,
    letterSpacing,
    fits: fontSize >= MIN_FONT_SIZE,
    content: unit.repeat(repeat).trimEnd(),
  };
}

/* ───────── 컴포넌트 ───────── */
const GLYPH_KEYS: ('J' | 'a' | 'm')[] = ['J', 'a', 'm'];

/**
 * 비인터랙티브 장식 SVG. `role="img"` + `aria-label`=분류 문구.
 * 문구가 비면 둘레 글자 없이 바탕과 가운데 로고만 그린다(도형 자체는 유효하므로).
 * 크기는 고정이라 `size` prop이 없다 — `className`만 호출부에 연다.
 *
 * @summary 홈 피드 카드 모서리에 붙는 분류 스티커다. 정원 바탕에 분류 문구와 JAM 로고 글자를 얹는다.
 */
export function CategorySticker({
  label = '',
  pair = 'yellow-purple',
  letter = 'J',
  className = '',
  style = {},
  ...rest
}: CategoryStickerProps) {
  const pathId = useId();
  const geo = pebbleShape();
  const colors = STICKER_COLOR_PAIRS[pair];
  const glyph = LOGO_GLYPHS[GLYPH_KEYS.includes(letter) ? letter : 'J'];
  const ring = fitRingText(label, geo.ringLength, PEBBLE_FONT_SIZE);
  const [bx0, by0, bx1, by1] = glyph.bbox;
  const scale = geo.glyphHeight / (by1 - by0);
  const [cx, cy] = geo.center;
  const tx = cx - ((bx0 + bx1) / 2) * scale;
  const ty = cy - ((by0 + by1) / 2) * scale;
  const labelText = String(label ?? '').trim();
  return (
    <svg
      width={geo.width}
      height={geo.height}
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      role={labelText ? 'img' : undefined}
      aria-label={labelText || undefined}
      aria-hidden={labelText ? undefined : true}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...rest}
    >
      <path d={geo.outlineD} fill={colors.base} stroke="var(--foreground)" strokeWidth={BORDER_WIDTH} strokeLinejoin="round" />
      {ring.content ? (
        <>
          <path id={`${pathId}-ring`} d={geo.ringD} fill="none" />
          <text
            fill="var(--foreground)"
            fontFamily="var(--font-family-base)"
            fontWeight={FONT_WEIGHT}
            fontSize={ring.fontSize}
            letterSpacing={ring.letterSpacing}
            xmlSpace="preserve"
          >
            <textPath href={`#${pathId}-ring`}>{ring.content}</textPath>
          </text>
        </>
      ) : null}
      <path
        d={glyph.d}
        fillRule={glyph.evenodd ? 'evenodd' : undefined}
        transform={`translate(${r2(tx)} ${r2(ty)}) scale(${Math.round(scale * 10000) / 10000})`}
        fill={colors.glyph}
        stroke="var(--foreground)"
        strokeWidth={r2((GLYPH_OUTLINE * 2) / scale)}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}
