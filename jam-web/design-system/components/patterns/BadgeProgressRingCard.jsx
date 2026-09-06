import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';
import { LockGlyph, CheckGlyph } from '../icons/BadgeStatusGlyphs.jsx';
import { progressRampColor } from './BadgeFamilyCardHeader.jsx';

/**
 * BadgeProgressRingCard — 눈금이 1개뿐인 계열을 그리드 셀 하나로 보여주는 진행 카드.
 * 티켓 20260906_1425.
 *
 * ## 왜 새 패턴인가
 *
 * `BadgeStageRail`(계열 레일)은 눈금 2개 이상이 연결선으로 이어질 때만 「레일」의 은유가
 * 성립한다. 눈금 1개 계열(v5 실측 63계열)에 레일을 쓰면 연결선 없이 카드 한 장을 통째로
 * 쓰는 낭비가 생긴다(원 문제). 이 패턴은 그 63계열을 그리드로 촘촘히 묶기 위한 **압축된
 * 셀**이다 — 진행을 선형 막대 대신 **배지 이미지 보더를 따라 도는 테두리**로 표현한다.
 *
 * ## 설계 제약 (모두 사용자 확정)
 *
 * 1. **테두리는 진행 채널 하나로만 채운다** — `--status-progress-near` → `--status-progress-done`
 *    스윕. **등급색은 올리지 않는다.** 등급은 이름 아래 `RarityBadge` 칩에 남긴다
 *    (같은 물체 위에서 등급색과 진행색이 섞이면 "초록이 등급인지 완료인지" 구분이 없어진다).
 * 2. **수치 캡션을 남긴다.** 도형 진행은 작은 값(2%)과 0%가 눈으로 구분되지 않는다 —
 *    테두리는 "대략 어디쯤"의 앰비언트 신호이고 정확한 값은 캡션 한 줄이 말한다.
 * 3. **마커(획득 체크·게이트 자물쇠)는 테두리 바깥에 둔다.** 진행 아크와 자물쇠가 부딪히지
 *    않게 `BadgeStageRail`의 `StopThumbnail`과 같은 자리(우상단)를 쓰되 오프셋을 키웠다.
 * 4. **`prefers-reduced-motion`에서 전이를 끈다.** 채우기 자체에는 애초에 전이를 걸지 않는다.
 *
 * ## v2 — 원형에서 라운드 사각으로 (티켓 20260906_2140)
 *
 * 같은 화면의 레일·레벨·반복 카드가 모두 `--radius-sm` 라운드 사각 썸네일인데 이 셀만
 * 원형이라 «같은 배지»가 두 가지 모양으로 보였다. 바깥은 `--radius-card`(16px), 안쪽은
 * 동심값 `calc(var(--radius-card) - 4px)`(테두리 두께만큼 뺀 12px)다 — 두 radius가 동심이
 * 아니면 모서리에서 테두리 두께가 눈에 띄게 들쭉날쭉해진다.
 *
 * 이름은 `--text-caption`→`--text-small`로 올리고 **2줄 높이를 상시 예약**한다(이름 길이가
 * 그리드 행 높이를 흔들지 못하게). 배지 이미지는 여백 없이 프레임을 꽉 채운다
 * (`objectFit: cover` + 안쪽 프레임 `overflow: hidden`).
 *
 * ## 프레젠테이션 전용
 *
 * `condition`·`kind`를 모른다 — `status`(4종, `BadgeStageRail`과 같은 어휘)와 0~1 `fraction`,
 * 완성 문자열(`captionText`·`ariaLabel`)만 받는다. 문구 조립은
 * `src/lib/badgeProgressText.ts`(`formatGridCellCaption`)가 한다.
 */

const RING_SIZE = 72;
const RING_THICKNESS = 4;
const INNER_SIZE = RING_SIZE - RING_THICKNESS * 2;
/** 안쪽 radius는 바깥과 **동심**이어야 한다 — 두께만큼 뺀다. */
const INNER_RADIUS = `calc(var(--radius-card) - ${RING_THICKNESS}px)`;

/**
 * 이름 자리의 예약 높이 — `--text-small`(14px) × line-height 1.3 × 2줄.
 * 이름 길이가 그리드 행 높이를 흔들면 셀들의 캡션 baseline이 행마다 어긋난다.
 */
const NAME_SLOT_HEIGHT = 37;

const STATIC_CSS = `
.ds-ring-card{transition:opacity var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-ring-card:active{opacity:0.7}
.ds-ring-enter{animation:ds-ring-fade-in 220ms var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
@keyframes ds-ring-fade-in{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion: reduce){.ds-ring-card,.ds-ring-enter{animation:none!important;transition:none!important}}
`;

/**
 * 진행 테두리 — 두 겹 트릭. 바깥 사각(`RING_SIZE`, `--radius-card`)을 conic-gradient로 채우고,
 * 그보다 작은 안쪽 사각(`INNER_SIZE`, 동심 radius)을 위에 겹쳐 두께(`RING_THICKNESS`)만큼만
 * 보이게 한다. 채움은 `near → done` 스윕이라 「어디까지 초록으로 넘어갔나」가 곧 진행도다.
 */
function ProgressBorder({ imageUrl, alt, angleDeg, trackColor, dimmed }) {
  return (
    <span
      style={{
        position: 'relative', width: RING_SIZE, height: RING_SIZE, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, borderRadius: 'var(--radius-card)',
          background: `conic-gradient(in oklab, var(--status-progress-near) 0deg, var(--status-progress-done) ${angleDeg}deg, ${trackColor} ${angleDeg}deg 360deg)`,
        }}
      />
      <span
        style={{
          position: 'relative', width: INNER_SIZE, height: INNER_SIZE, borderRadius: INNER_RADIUS,
          background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', color: 'var(--color-text)',
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다(BadgeStageRail.jsx와 동일 컨벤션)
          <img
            src={imageUrl}
            alt={alt}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', padding: 0,
              display: 'block', filter: dimmed ? 'grayscale(1)' : 'none',
            }}
          />
        ) : (
          <span style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
        )}
      </span>
    </span>
  );
}

export function BadgeProgressRingCard({
  name,
  imageUrl = /** @type {string | null} */ (null),
  rarity = /** @type {'common' | 'rare' | 'epic' | 'mystic' | null} */ (null),
  /**
   * 눈금 상태 — `earned`(획득, 마커=체크·테두리 풀채움) / `ready`(조건을 다 채웠고 게이트
   * 대기, 마커=자물쇠) / `locked`(조건·게이트 모두 미충족, 마커=자물쇠) / `not-reached`
   * (게이트 없이 진행 중, 마커 없음). "조건" 판정은 호출부가 넘긴다.
   */
  status,
  /** 0~1 진행률 — 계산 계층 결과를 그대로 받는다(재계산 금지). `muted`면 표시에 쓰지 않는다 */
  fraction,
  /** 완성 캡션 문자열("0.0/100.0km"·"4km"·"조건을 다 채웠어요" 등). null이면 그리지 않는다 */
  captionText,
  /** true면 진행을 계산할 수 없다(§08 H) — 테두리를 중립으로, `fraction`을 쓰지 않는다 */
  muted = false,
  /** true면 captionText가 임시 상태 표기다 — 기울임으로 그린다(조건값은 사실 표기라 false) */
  pending = false,
  /**
   * 접근성 이름 — 완성 문장(수치 포함). 기본값 없음(항상 명시) — 도형만으로는 값이
   * 전달되지 않는다.
   */
  ariaLabel,
  href,
  onClick,
  className = '',
  style = {},
}) {
  const clamped = Math.min(1, Math.max(0, fraction ?? 0));
  const earned = status === 'earned';
  const angleDeg = earned ? 360 : muted ? 0 : clamped * 360;
  const showMarker = status === 'earned' || status === 'ready' || status === 'locked';
  const captionColor = muted ? 'var(--status-progress-idle)' : progressRampColor(clamped, earned);

  const containerStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-8)',
    width: '100%', minWidth: 0, background: 'none', border: 'none', padding: 0,
    textAlign: 'center', textDecoration: 'none', color: 'inherit', font: 'inherit',
    cursor: href || onClick ? 'pointer' : undefined,
    ...style,
  };

  const content = (
    <>
      <span style={{ position: 'relative' }} className="ds-ring-enter">
        <ProgressBorder imageUrl={imageUrl} alt={name} angleDeg={angleDeg} trackColor="var(--status-idle-track)" dimmed={!earned} />
        {showMarker && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--color-surface-elevated)',
              background: earned ? 'var(--status-progress-done)' : 'var(--color-base-grey-700)',
              color: earned ? '#000' : 'var(--color-text-secondary)',
            }}
          >
            {earned ? <CheckGlyph size={10} /> : <LockGlyph size={10} />}
          </span>
        )}
      </span>

      {/* 이름 자리 — 2줄 높이 상시 예약. 이름 길이가 그리드 행 높이를 못 흔든다 */}
      <span
        style={{
          fontSize: 'var(--text-small)', fontWeight: 700, lineHeight: 1.3,
          color: 'var(--color-text)', width: '100%', minHeight: NAME_SLOT_HEIGHT,
          wordBreak: 'keep-all', overflowWrap: 'anywhere',
        }}
      >
        {name}
      </span>

      {rarity && <RarityBadge rarity={rarity} size="md" />}

      {captionText != null && (
        <span
          style={{
            fontSize: 'var(--text-caption)', lineHeight: 1.3, color: captionColor,
            fontStyle: pending ? 'italic' : 'normal', fontVariantNumeric: 'tabular-nums',
            wordBreak: 'keep-all', overflowWrap: 'anywhere',
          }}
        >
          {captionText}
        </span>
      )}
    </>
  );

  return (
    <>
      <style>{STATIC_CSS}</style>
      {href ? (
        <a href={href} aria-label={ariaLabel} className={`ds-ring-card ${className}`} style={containerStyle}>
          {content}
        </a>
      ) : onClick ? (
        <button type="button" onClick={onClick} aria-label={ariaLabel} className={`ds-ring-card ${className}`} style={containerStyle}>
          {content}
        </button>
      ) : (
        <div aria-label={ariaLabel} className={className} style={containerStyle}>
          {content}
        </div>
      )}
    </>
  );
}
