import React from 'react';
import { ChevronDownGlyph } from '../icons/BadgeStatusGlyphs.jsx';

/**
 * BadgeFamilyCardHeader — 배지 트리 계열 카드의 **공유 헤더**. 티켓 20260906_2140.
 *
 * ## 왜 새 패턴인가
 *
 * 배지 트리에서 정렬 엣지가 갈라진 근본 원인은 «네 패턴이 각자 헤더를 그린다»는 것이다.
 * staging 실측(375px, 걷기 탭):
 *
 * | 패턴 | 계열명 시작 x | 계열명 크기 |
 * |---|---|---|
 * | `BadgeStageRail`        | 32px | 16px |
 * | `BadgeLevelGauge`       | 88px | 14px |
 * | `BadgeStampRow`         | 88px | 14px |
 * | `BadgeProgressRingCard` | 16px | 12px |
 *
 * 각 파일을 따로 고치면 지금은 맞지만 **다음 패턴이 추가되는 순간 또 갈라진다** — 실제로
 * `BadgeProgressRingCard`(20260906_1425)가 세 번째 이름 위치를 만들어 냈다. 공유 부품
 * 하나로 구조적으로 막는다.
 *
 * `ListRowCard`를 쓰지 않은 이유: 그건 `[40px 아이콘][제목/부제][trailing]` 구조인데
 * 이 헤더에는 아이콘이 없고(썸네일은 본문으로 내려간다) 진행률 블록이 **카드 우측 패딩
 * 엣지**에 붙어야 한다.
 *
 * ## 배치 (2026-09-06 사용자 지시 — 구현자 재량 아님)
 *
 * ```
 * [계열 이름 1fr]            [87% EPIC auto]
 * [메타 한 줄 1fr]           [자세히 ⌄ auto]
 * ```
 *
 * - **`87%`와 등급/레벨 라벨을 세로로 쌓지 않는다.** 한 줄에 나란히 둔다.
 * - 진행률 블록과 「자세히」가 **같은 2열**에 놓여 우측 엣지를 공유한다. chevron이 진행률
 *   오른쪽을 차지하면 진행률만 안쪽으로 밀려 세로 스캔 컬럼이 어긋난다.
 * - 등급 라벨은 **텍스트**다 — 여기에 `RarityBadge` 칩을 쓰지 않는다. 칩을 쓰면 레일 안의
 *   등급칩과 경쟁해 한 카드에 등급 표기가 두 종류가 된다.
 * - 이름에 **말줄임을 쓰지 않는다**(20260906_1323 §5) — 계열명이 곧 지표다.
 *
 * ## 상태 램프
 *
 * 밝기가 「지금 얼마나 신경 쓸 곳인가」를 맡는다. lime(H 118.6°)과 amber(H 94.9°)가
 * 23.7°밖에 안 떨어져 있어 색만으로는 3단계를 못 가른다 — 가운데 단계(진행 중)에서 색을
 * 빼고 밝기를 최대로 올린다. 토큰은 `colors.css`의 `--status-progress-*`.
 *
 * 문구 조립은 하지 않는다 — 완성 문자열만 받는다(기존 DS 원칙 유지).
 */

/**
 * 「거의 다」로 넘어가는 임계값. **정책 숫자라 색 토큰이 아니다** — CSS에 두면 JS가 읽을 수
 * 없고, 두 곳에 적으면 색과 문구가 서로 다른 기준을 쓰게 된다. 서비스 계층은
 * `src/lib/badgeProgressText.ts`가 이 값을 그대로 재수출해서 쓴다(단일 출처).
 */
export const NEAR_THRESHOLD = 0.8;

/**
 * 진행률 → 상태 램프 색 토큰. 배지 트리의 모든 패턴이 이 함수 하나만 본다.
 *
 * @param {number | null | undefined} fraction 0~1. null이면 「진행 계산 불가」
 * @param {boolean} [done] 획득 등 «fraction과 무관하게 다 채운» 상태
 */
export function progressRampColor(fraction, done = false) {
  if (done) return 'var(--status-progress-done)';
  if (fraction == null) return 'var(--status-progress-idle)';
  const f = Math.min(1, Math.max(0, fraction));
  if (f >= 1) return 'var(--status-progress-done)';
  if (f >= NEAR_THRESHOLD) return 'var(--status-progress-near)';
  if (f > 0) return 'var(--status-progress-active)';
  return 'var(--status-progress-idle)';
}

/**
 * 화면에 적을 퍼센트 정수. **다 채우지 않았는데 100%로 반올림되지 않게** 99에서 멈춘다 —
 * 미획득 배지 옆의 「100%」는 거짓말이고, 이 화면에서 100%는 「다 채움」 하나만 뜻한다.
 */
function toPercentText(fraction) {
  if (fraction == null) return null;
  const f = Math.min(1, Math.max(0, fraction));
  if (f >= 1) return '100%';
  return `${Math.min(99, Math.round(f * 100))}%`;
}

const STATIC_CSS = `
.ds-family-header-toggle{background:none;border:none;padding:0;font:inherit;color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:2px;white-space:nowrap;transition:opacity var(--duration-quick,150ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-family-header-toggle:active{opacity:.7}
.ds-family-header-chevron{transition:transform var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
@media (prefers-reduced-motion: reduce){.ds-family-header-toggle,.ds-family-header-chevron{transition:none!important}}
`;

export function BadgeFamilyCardHeader({
  /** 계열 이름. 말줄임 없이 줄바꿈으로 전부 보여준다 */
  name,
  /**
   * 0~1 진행률. `null`이면 「진행 계산 불가」 — 퍼센트를 적지 않고 램프는 idle이다.
   * 0%를 적는 것과 «모른다»는 다른 사실이라 숫자를 지어내지 않는다.
   */
  fraction = /** @type {number | null} */ (null),
  /** 퍼센트 옆에 붙는 완성 라벨 — `Epic`·`Lv.8`·`26회`. 없으면 그리지 않는다 */
  pctLabel = /** @type {string | null} */ (null),
  /** `fraction`과 무관하게 「다 채움」으로 그린다(획득 완료 계열) */
  done = false,
  /** 이름 아래 한 줄(완성 문자열 또는 노드). 없으면 2행 자체를 만들지 않는다 */
  metaText = /** @type {React.ReactNode} */ (null),
  /** 「자세히」 펼침 상태. `onToggleExpand`가 있을 때만 의미가 있다 */
  expanded = false,
  /**
   * () => void — 펼침 토글. **넘기지 않으면 「자세히」를 그리지 않는다**(레벨형·반복형처럼
   * 펼칠 내용이 없는 카드). 기본값을 두지 않는다 — `= () => {}` 기본값은 JS 추론이
   * 프롭 타입을 좁혀 버려 호출부가 타입 에러를 낸다(이 폴더의 다른 패턴과 같은 함정).
   */
  onToggleExpand,
  /** 「자세히」 버튼의 접근성 이름 접두 — 보통 계열명. 없으면 `name`을 쓴다 */
  toggleAriaPrefix = /** @type {string | null} */ (null),
  className = '',
  style = {},
}) {
  const pctText = toPercentText(done ? 1 : fraction);
  const rampColor = progressRampColor(fraction, done);
  const hasSecondRow = metaText != null || onToggleExpand != null;

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        columnGap: 'var(--spacing-12)',
        rowGap: 'var(--spacing-4)',
        alignItems: 'baseline',
        ...style,
      }}
    >
      <style>{STATIC_CSS}</style>

      <span
        style={{
          fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3,
          letterSpacing: '-0.01em', color: 'var(--color-text)', minWidth: 0,
          // 말줄임 금지(§5). keep-all로 한글은 어절 단위로만 끊고, anywhere를 함께 둬
          // 공백 없는 긴 토큰만 강제로 분리한다(20260906_1424 ③).
          wordBreak: 'keep-all', overflowWrap: 'anywhere',
        }}
      >
        {name}
      </span>

      {/* 진행률 블록 — 카드 우측 패딩 엣지에 붙는다. 퍼센트와 라벨이 **한 줄**이다 */}
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--spacing-4)', whiteSpace: 'nowrap' }}>
        {pctText && (
          <span
            style={{
              fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3,
              fontVariantNumeric: 'tabular-nums', color: rampColor,
            }}
          >
            {pctText}
          </span>
        )}
        {pctLabel && (
          <span
            style={{
              fontSize: 'var(--text-micro)', fontWeight: 700, lineHeight: 1.3,
              letterSpacing: '0.3px', textTransform: 'uppercase',
              color: 'var(--status-progress-idle)',
            }}
          >
            {pctLabel}
          </span>
        )}
      </span>

      {hasSecondRow && (
        <>
          <span
            style={{
              fontSize: 'var(--text-small)', lineHeight: 1.4,
              color: 'var(--color-text-secondary)', minWidth: 0,
              wordBreak: 'keep-all', overflowWrap: 'anywhere',
            }}
          >
            {metaText}
          </span>
          <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {onToggleExpand != null && (
              <button
                type="button"
                className="ds-family-header-toggle"
                onClick={onToggleExpand}
                aria-expanded={expanded}
                aria-label={`${toggleAriaPrefix ?? name} 자세히`}
                style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--color-text-secondary)' }}
              >
                자세히
                <span
                  className="ds-family-header-chevron"
                  style={{ display: 'flex', transform: expanded ? 'rotate(180deg)' : 'none' }}
                >
                  <ChevronDownGlyph size={16} />
                </span>
              </button>
            )}
          </span>
        </>
      )}
    </div>
  );
}
