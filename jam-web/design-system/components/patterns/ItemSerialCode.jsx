import React from 'react';

/**
 * ItemSerialCode — 아이템 배지 일련번호 스탬프 패턴.
 * Figma: https://www.figma.com/design/1mSlxABxlyPQDBAdGNil8l (node 14:14)
 *
 * code의 앞 4자(알파벳 prefix)는 카드 1장씩, 나머지(숫자)는 하나의 넓은 박스로 렌더링한다.
 * 실제 데이터 포맷(BadgeEngine/BADGE_ENGINE_UNIFIED.md §3.13)은 4자리 대문자 prefix +
 * 6자리 zero-pad 숫자(예: ABCD000042)다. Figma 원본은 숫자 5자리(플레이스홀더)로 그려져
 * 있었지만, 숫자 박스는 글자 수에 맞춰 너비가 늘어나므로 실제 6자리 값도 그대로 대응한다.
 *
 * 모든 치수는 height 하나로 비례 계산된다(BadgeFrame과 동일한 접근) — 서비스 어디에
 * 배치되든 height만 넘기면 동일한 비율로 스케일된다.
 */

const CORNER_RATIO = 0.12; // 48/400
const NOTCH_RATIO = 0.09125; // 36.5/400
const TILE_WIDTH_RATIO = 0.7; // 280/400 — 알파벳 카드 1장 너비
const FONT_RATIO = 0.5; // 200/400
const GAP_RATIO = 0.025; // 10/400
const PAD_INLINE_RATIO = 0.13;
const DIGIT_ADVANCE_RATIO = 0.65;

// 자간은 폰트 크기에 따라 보간한다 — 큰 사이즈(Figma 스탬프 스케일, fontSize 200 = height 400)는
// 원본처럼 타이트하게(-4%) 유지하되, 작은 사이즈(fontSize 20 = height 40, 현재 실사용 최소값인
// BadgeDetailSheet)는 오히려 벌어지게(+8%) 한다. 이 컴포넌트가 대체한 기존 텍스트는
// `tracking-widest`(+0.1em)로 작은 글씨의 가독성을 확보하고 있었는데, 모든 크기에 큰 사이즈용
// 타이트한 값을 고정으로 쓰면 정작 정확히 읽어야 하는 좁은 자리에서 더 읽기 어려워진다.
const TRACKING_LARGE_FONT = 200;
const TRACKING_LARGE_RATIO = -0.04;
const TRACKING_SMALL_FONT = 20;
const TRACKING_SMALL_RATIO = 0.08;

function trackingRatioFor(fontSize) {
  const t = (fontSize - TRACKING_SMALL_FONT) / (TRACKING_LARGE_FONT - TRACKING_SMALL_FONT);
  const clamped = Math.min(1, Math.max(0, t));
  return TRACKING_SMALL_RATIO + clamped * (TRACKING_LARGE_RATIO - TRACKING_SMALL_RATIO);
}

function tilePath(w, h) {
  const r = h * CORNER_RATIO;
  const nr = h * NOTCH_RATIO;
  const cy = h / 2;
  return [
    `M${r},0`,
    `L${w - r},0`,
    `A${r},${r} 0 0 1 ${w},${r}`,
    `L${w},${cy - nr}`,
    `A${nr},${nr} 0 0 0 ${w},${cy + nr}`,
    `L${w},${h - r}`,
    `A${r},${r} 0 0 1 ${w - r},${h}`,
    `L${r},${h}`,
    `A${r},${r} 0 0 1 0,${h - r}`,
    `L0,${cy + nr}`,
    `A${nr},${nr} 0 0 0 0,${cy - nr}`,
    `L0,${r}`,
    `A${r},${r} 0 0 1 ${r},0`,
    'Z',
  ].join(' ');
}

function Tile({ text, width, height }) {
  const fontSize = height * FONT_RATIO;
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        flexShrink: 0,
        clipPath: `path('${tilePath(width, height)}')`,
        background: [
          'radial-gradient(120% 90% at 22% 12%, rgba(255,255,255,0.19), rgba(255,255,255,0) 55%)',
          'linear-gradient(160deg, var(--color-base-grey-600) 0%, var(--color-base-grey-800) 100%)',
        ].join(', '),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-family-base)',
          fontWeight: 700,
          fontSize,
          lineHeight: 1,
          letterSpacing: fontSize * trackingRatioFor(fontSize),
          color: 'var(--color-text)',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
}

export function ItemSerialCode({ code, height = 160, className = '', style = {} }) {
  const letters = code.slice(0, 4).padEnd(4, '?').split('');
  const digits = code.slice(4);

  const tileWidth = height * TILE_WIDTH_RATIO;
  const padInline = height * PAD_INLINE_RATIO;
  const fontSize = height * FONT_RATIO;
  const digitTextWidth = digits.length
    ? digits.length * fontSize * DIGIT_ADVANCE_RATIO + (digits.length - 1) * fontSize * trackingRatioFor(fontSize)
    : 0;
  const numberWidth = Math.max(tileWidth, digitTextWidth + padInline * 2);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: height * GAP_RATIO,
        ...style,
      }}
    >
      {letters.map((ch, i) => (
        <Tile key={i} text={ch} width={tileWidth} height={height} />
      ))}
      {digits.length > 0 && <Tile text={digits} width={numberWidth} height={height} />}
    </div>
  );
}
