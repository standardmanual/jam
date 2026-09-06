import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';

/**
 * BadgeProgressRingCard — 눈금이 1개뿐인 계열을 그리드 셀 하나로 보여주는 진행 카드.
 * 티켓 20260906_1425.
 *
 * ## 왜 새 패턴인가
 *
 * `BadgeStageRail`(계열 레일)은 눈금 2개 이상이 연결선으로 이어질 때만 「레일」의 은유가
 * 성립한다. 눈금 1개 계열(v5 실측 63계열)에 레일을 쓰면 연결선 없이 카드 한 장을 통째로
 * 쓰는 낭비가 생긴다(원 문제). 이 패턴은 그 63계열을 그리드로 촘촘히 묶기 위한 **압축된
 * 셀**이다 — 진행을 선형 막대·연결선 대신 **배지 이미지 보더를 따라 도는 링**으로 표현한다.
 *
 * ## 설계 제약 (모두 사용자 확정, 2026-09-06)
 *
 * 1. **링은 상태색 하나로만 채운다** — 앰버(`--status-short-solid`, 채우는 중) /
 *    라임(`--status-done-solid`, 다 채움). **등급색은 링에 올리지 않는다.** 등급은 이름 아래
 *    `RarityBadge` 칩에 남긴다(`BadgeStageRail`이 이미 3px 바에서 칩으로 옮긴 것과 같은 이유
 *    — 같은 물체 위에서 등급색과 진행색이 섞이면 "초록 링이 등급인지 완료인지" 구분이 없어진다).
 * 2. **수치 캡션을 남긴다.** 원형 진행은 작은 값(2%)과 0%가 눈으로 구분되지 않는다 — 링은
 *    "대략 어디쯤"의 앰비언트 신호이고 정확한 값은 캡션 한 줄이 말한다. `ariaLabel`에도
 *    캡션 문구가 그대로 들어간다(호출부가 조립해서 넘긴다 — 이 컴포넌트는 값을 모른다).
 * 3. **마커(획득 체크·게이트 자물쇠)는 링 바깥에 둔다.** 링과 같은 원 둘레에 마커를 얹으면
 *    진행 아크와 자물쇠가 부딪힌다 — `BadgeStageRail`의 `StopThumbnail`과 같은 자리(우상단,
 *    카드 밖으로 살짝 걸침)를 그대로 쓰되, 링 바깥 여백만큼 오프셋을 키웠다.
 * 4. **`prefers-reduced-motion`에서 전이를 끈다.** 채우기 자체(퍼센트 변화)에는 애초에
 *    전이를 걸지 않는다 — 게이지가 아니라 도착 즉시 값을 그리는 스냅샷이다. 카드가 처음
 *    나타날 때의 페이드/스케일 진입 효과만 `transform`/`opacity`로 두고, 그 진입 효과를
 *    reduced-motion에서 끈다(레일·요약 헤더가 `width %` 전이를 쓰는 것과 다른 원칙).
 *
 * ## 프레젠테이션 전용
 *
 * `condition`·`kind`를 모른다 — `status`(획득/조건충족/잠김/미도달 4종, `BadgeStageRail`과
 * 같은 어휘)와 0~1 `fraction`, 완성 문자열(`captionText`·`ariaLabel`)만 받는다. 문구 조립은
 * `src/lib/badgeProgressText.ts`(`formatGridCellCaption`)가 한다.
 */

const RING_SIZE = 72;
const RING_THICKNESS = 4;
const INNER_SIZE = RING_SIZE - RING_THICKNESS * 2;

const STATIC_CSS = `
.ds-ring-card{transition:opacity var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-ring-card:active{opacity:0.7}
.ds-ring-enter{animation:ds-ring-fade-in 220ms var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
@keyframes ds-ring-fade-in{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion: reduce){.ds-ring-card,.ds-ring-enter{animation:none!important;transition:none!important}}
`;

function LockGlyph({ size = 10 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z" />
    </svg>
  );
}
function CheckGlyph({ size = 10 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
    </svg>
  );
}

/**
 * 진행 링 — 두 겹 원 트릭. 바깥 원(`RING_SIZE`)을 conic-gradient로 채우고, 그보다 작은
 * 안쪽 원(`INNER_SIZE`, 카드 배경색)을 위에 겹쳐 링 두께(`RING_THICKNESS`)만큼만 보이게 한다.
 */
function ProgressRing({ imageUrl, alt, angleDeg, fillColor, trackColor, dimmed }) {
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
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `conic-gradient(${fillColor} 0deg ${angleDeg}deg, ${trackColor} ${angleDeg}deg 360deg)`,
        }}
      />
      <span
        style={{
          position: 'relative', width: INNER_SIZE, height: INNER_SIZE, borderRadius: '50%',
          background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', color: 'var(--color-text)',
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다(BadgeStageRail.jsx와 동일 컨벤션)
          <img
            src={imageUrl}
            alt={alt}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6, filter: dimmed ? 'grayscale(1)' : 'none' }}
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
   * 눈금 상태 — `earned`(획득, 마커=체크·링 라임 풀채움) / `ready`(조건 충족·게이트 대기,
   * 마커=자물쇠) / `locked`(조건·게이트 모두 미충족, 마커=자물쇠) / `not-reached`(게이트 없이
   * 진행 중, 마커 없음). "조건" 판정은 이 컴포넌트가 하지 않는다 — 호출부가 넘긴다
   * (`BadgeStageRail`과 같은 원칙).
   */
  status,
  /** 0~1 진행률 — 계산 계층 결과를 그대로 받는다(재계산 금지). `muted`면 표시에 쓰지 않는다 */
  fraction,
  /** 완성 캡션 문자열("0.0/100.0km"·"4km"·"조건 충족" 등). null이면 캡션을 그리지 않는다 */
  captionText,
  /** true면 진행을 계산할 수 없다(§08 H) — 링을 중립색으로, `fraction`을 쓰지 않는다(0 취급) */
  muted = false,
  /** true면 captionText가 임시 상태 표기다 — 기울임으로 그린다(조건값은 사실 표기라 false) */
  pending = false,
  /**
   * 접근성 이름 — 완성 문장(수치 포함). 기본값 없음(항상 명시) — 링 형태만으로는 값이
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
  // 다 채웠다(등급 4단 레일의 progressComplete와 같은 기준) — earned가 아니어도(조건만
  // 충족하고 게이트 대기) fraction>=1이면 라임으로 다 채운 것을 보여준다.
  const complete = earned || (!muted && clamped >= 1);
  const fillColor = muted ? 'var(--color-text-secondary)' : complete ? 'var(--status-done-solid)' : 'var(--status-short-solid)';
  const angleDeg = earned ? 360 : muted ? 0 : clamped * 360;
  const showMarker = status === 'earned' || status === 'ready' || status === 'locked';
  const captionColor = muted
    ? 'var(--color-text-secondary)'
    : complete
      ? 'var(--status-done-solid)'
      : 'var(--color-text)';

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
        <ProgressRing imageUrl={imageUrl} alt={name} angleDeg={angleDeg} fillColor={fillColor} trackColor="var(--status-idle-track)" dimmed={!earned} />
        {showMarker && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--color-surface-elevated)',
              background: earned ? 'var(--status-done-solid)' : 'var(--color-base-grey-700)',
              color: earned ? '#000' : 'var(--color-text-secondary)',
            }}
          >
            {earned ? <CheckGlyph /> : <LockGlyph />}
          </span>
        )}
      </span>

      <span
        style={{
          fontSize: 'var(--text-caption)', fontWeight: 700, lineHeight: 1.3,
          color: 'var(--color-text)', width: '100%',
          wordBreak: 'keep-all', overflowWrap: 'anywhere',
        }}
      >
        {name}
      </span>

      {rarity && <RarityBadge rarity={rarity} />}

      {captionText != null && (
        <span
          style={{
            fontSize: 'var(--text-micro)', lineHeight: 1.3, color: captionColor,
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
