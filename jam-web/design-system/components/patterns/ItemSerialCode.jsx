'use client';

import React, { useEffect, useId, useState } from 'react';

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
 *
 * 숫자 자리는 마운트 시 transitions.dev "Spinning counter"(`.t-reel`, 티켓 20260903_1611)로
 * 슬롯머신처럼 스핀 후 착지한다. CSS는 `src/components/transitions.css`(원문) +
 * `src/app/globals.css`(--reel-* 모션 토큰) — 서비스 전역 스타일시트에 의존하므로, 이
 * 컴포넌트가 그 스타일시트가 로드되지 않는 환경(claude.ai/design 등)에 단독으로 렌더링되면
 * 릴 마스크·전환이 적용되지 않고 숫자만 정적으로 겹쳐 보일 수 있다(Storybook·서비스 앱은
 * 둘 다 globals.css를 로드하므로 문제 없음).
 *
 * 접근성: 릴 스트립은 애니메이션을 위해 0-9 셀 전체가 DOM에 존재해 textContent가 뒤섞이므로
 * `aria-hidden="true"`로 접근성 트리에서 제외하고, 숫자 Tile 안에 `sr-only` 텍스트로 실제
 * 숫자값을 노출한다(알파벳 Tile은 기존과 동일하게 일반 텍스트라 별도 처리 불필요).
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

// ── Spinning counter (릴) ────────────────────────────────────────────────
// 스핀 스펙 상수. `--reel-dur`/`--reel-stagger`/`--reel-spin-blur`(globals.css)가 착지
// 트랜지션(.t-reel-strip, transitions.css "프로젝트 확장")의 실제 지속시간을 소유하지만,
// 아래 SVG feGaussianBlur의 SMIL <animate>는 CSS 커스텀 프로퍼티를 참조할 수 없어(SMIL
// 속성값은 정적 문자열) 같은 값을 JS 상수로 미러링해야 한다. globals.css 토큰을 바꾸면
// 이 값도 함께 맞춰야 한다.
const SPIN_CYCLES = 2; // 착지 전 완전히 도는 루프 수(전 자리 공통 고정값 — 결정적 애니메이션)
const REEL_DUR_MS = 1400; // --reel-dur 미러링
const REEL_STAGGER_MS = 90; // --reel-stagger 미러링
const REEL_SPIN_BLUR_PX = 3; // --reel-spin-blur 미러링 (기준: REEL_BLUR_REF_FONT 크기)
const REEL_BLUR_REF_FONT = 200; // 위 블러 기준 폰트 크기(Figma 스탬프 스케일) — 다른 크기는 비례 축소
const REEL_CELL_RATIO = 1.08; // 릴 셀 높이 = fontSize * 이 비율(숫자 글리프가 클리핑되지 않을 여유)

/** OS 수준 모션 축소 설정 구독 (design-system은 서비스 lib/motion.ts를 import할 수 없어
 *  BadgeRevealCarousel과 동일한 로직을 내부에 다시 구현한다). */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  return reduced;
}

/** 자리 하나 — 0-9 스트립을 목표 숫자 위치까지 스핀 후 착지시킨다. */
function ReelColumn({ digit, index, colWidth, cellHeight, marginRight, fontSize, landed, reduced, filterId, blurPx }) {
  const target = SPIN_CYCLES * 10 + digit;
  // reduced-motion: 스핀 없이 목표 숫자 한 칸만 즉시 표시(요구사항 — "스핀 없이 즉시 최종
  // 값으로 표시"). transitions.css의 reduced-motion 가드(transition/filter none !important)는
  // 이 분기와 무관하게 이중 안전망으로 남아 있다.
  const cells = reduced ? [digit] : Array.from({ length: target + 1 }, (_, i) => i % 10);
  const translateY = reduced ? 0 : landed ? -(target * cellHeight) : 0;

  return (
    <div className="t-reel-col" style={{ width: colWidth, height: cellHeight, marginRight }}>
      <div
        className="t-reel-strip"
        style={{
          transform: `translateY(${translateY}px)`,
          transitionDelay: reduced ? undefined : `calc(var(--reel-stagger) * ${index})`,
          filter: reduced ? undefined : `url(#${filterId})`,
        }}
      >
        {cells.map((d, i) => (
          <div
            key={i}
            className="t-reel-digit"
            style={{
              height: cellHeight,
              fontFamily: 'var(--font-family-base)',
              fontWeight: 700,
              fontSize,
              lineHeight: 1,
              color: 'var(--color-text)',
            }}
          >
            {d}
          </div>
        ))}
      </div>
      {/* 방향성(수직 전용) 블러 — CSS blur()는 좌우로도 번져 숫자 폭 계산과 어긋나므로,
          스니펫 사용법 주석대로 feGaussianBlur stdDeviation="0 Y"로 세로 스트릭만 만들고
          착지 시점(각 컬럼의 stagger만큼 지연)에 0으로 decay시킨다. */}
      {!reduced && (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="0 0">
              <animate
                attributeName="stdDeviation"
                values={`0 0;0 ${blurPx};0 ${blurPx};0 0`}
                keyTimes="0;0.05;0.7;1"
                dur={`${REEL_DUR_MS}ms`}
                begin={`${REEL_STAGGER_MS * index}ms`}
                fill="freeze"
              />
            </feGaussianBlur>
          </filter>
        </svg>
      )}
    </div>
  );
}

/** 숫자 자리 전체 — 릴 자리별 폭/간격은 기존 `digitTextWidth` 계산식(DIGIT_ADVANCE_RATIO +
 *  trackingRatioFor)과 동일한 값을 재사용해 외곽 Tile 폭 계산과 어긋나지 않게 한다. 릴 셀은
 *  고정폭이라 "가변폭 텍스트" 가정과는 다르지만, 자리 수 × 자리당 advance + (n-1)×tracking
 *  이라는 총 폭 공식 자체는 변하지 않는다 — 텍스트 한 덩어리 대신 자리마다 나눠 렌더링할 뿐. */
function DigitReelGroup({ digits, height }) {
  const uid = useId();
  const reduced = useReducedMotion();
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    // reduced일 때는 ReelColumn이 `landed`를 아예 참조하지 않고 목표 숫자 한 칸을 즉시
    // 그리므로(translateY 항상 0), 여기서 별도 setState 없이 스핀 예약만 건너뛴다.
    if (reduced) return undefined;
    let raf2 = 0;
    // 초기 프레임(translateY(0))이 실제로 페인트된 뒤에 목표 위치로 트랜지션을 트리거한다
    // (같은 프레임에서 바로 값을 바꾸면 브라우저가 전환을 건너뛸 수 있다).
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setLanded(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [reduced, digits]);

  const fontSize = height * FONT_RATIO;
  const cellHeight = fontSize * REEL_CELL_RATIO;
  const colWidth = fontSize * DIGIT_ADVANCE_RATIO;
  const tracking = fontSize * trackingRatioFor(fontSize);
  const blurPx = REEL_SPIN_BLUR_PX * (fontSize / REEL_BLUR_REF_FONT);

  const chars = digits.split('');

  return (
    <div className="t-reel" aria-hidden="true" style={{ '--reel-cell': `${cellHeight}px` }}>
      {chars.map((ch, i) => {
        const parsed = Number(ch);
        const digit = Number.isFinite(parsed) ? Math.abs(parsed) % 10 : 0;
        return (
          <ReelColumn
            key={i}
            digit={digit}
            index={i}
            colWidth={colWidth}
            cellHeight={cellHeight}
            marginRight={i === chars.length - 1 ? 0 : tracking}
            fontSize={fontSize}
            landed={landed}
            reduced={reduced}
            filterId={`reel-blur-${uid}-${i}`}
            blurPx={blurPx}
          />
        );
      })}
    </div>
  );
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

function TileShell({ width, height, children }) {
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
      {children}
    </div>
  );
}

function Tile({ text, width, height }) {
  const fontSize = height * FONT_RATIO;
  return (
    <TileShell width={width} height={height}>
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
    </TileShell>
  );
}

function DigitTile({ digits, width, height }) {
  // 릴 스트립은 애니메이션을 위해 0-9 셀 전체가 DOM에 존재하므로(시각적으로는 마스크로
  // 한 칸만 보임) textContent가 뒤섞인다. 릴 전체를 aria-hidden으로 접근성 트리에서
  // 제외하고(DigitReelGroup 내부), 실제 최종 숫자값만 스크린리더 전용 텍스트로 노출한다.
  return (
    <TileShell width={width} height={height}>
      <span className="sr-only">{digits}</span>
      <DigitReelGroup digits={digits} height={height} />
    </TileShell>
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
      {digits.length > 0 && <DigitTile digits={digits} width={numberWidth} height={height} />}
    </div>
  );
}
