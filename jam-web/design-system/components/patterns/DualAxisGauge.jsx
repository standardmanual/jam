import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';
import { ProgressBar } from '../feedback/ProgressBar.jsx';

/**
 * DualAxisGauge — 2축형(dual) 배지 전용 진행 게이지. 티켓 20260904_1058 (2d: 배지 트리
 * 리뉴얼 2차의 마지막 조각).
 *
 * `BadgeStageRail`(4등급 레일)은 그대로 두고, 프런티어(다음 목표)가 2축형일 때만 레일
 * 아래에 이 컴포넌트를 추가로 렌더한다(호출부: `BadgeFamilyRailItem.tsx`) — 레일을
 * 대체하지 않는다. "얇은 합성"이면 충분하다는 설계 그대로, 새 프리미티브 없이 기존 DS
 * `ProgressBar`(축 한 줄)·`RarityBadge`(등급 칩)만 조합한다.
 *
 * 구조(위→아래): 배지 썸네일(레일의 44px 눈금보다 큰 64px — "큰 사이즈" 요구) + 등급 칩 +
 * 축 2줄(라벨 + ProgressBar + "current/target unit" + 충족 시 체크 마커) + 규칙 문장
 * ("각각 다른 활동" / "한 번의 활동에서 동시에") + 병목 안내("{met인 축} 조건은 이미
 * 채웠어요", met인 축이 정확히 하나일 때만).
 *
 * 이 컴포넌트는 kind를 모른다 — `sameActivity`도 직접 받지 않고, 이미 완성된 `ruleText`/
 * `bottleneckNote` 문자열만 받는다(`src/lib/badgeProgressText.ts`의 `formatDualAxisGaugeProps()`
 * 가 조립). `axes[].fraction`도 계산 계층(`badgeProgress.ts`)이 만든 값을 그대로 받아
 * `ProgressBar`에 `percent`로 넘긴다 — "작을수록 좋음"(페이스)·한파(최고기온) 축은
 * current/target 단순 비율로 재계산하면 진행 바가 틀리게 그려지므로 반드시 이 값을 써야
 * 한다(계산 계층 주석 참고).
 *
 * 배지 이미지는 이 컴포넌트가 등장하는 시점(프런티어 = 아직 미획득)에는 항상 미획득
 * 상태이므로 `BadgeStageRail`과 같은 규칙(미획득 = grayscale(1))을 예외 없이 적용한다 —
 * `earned` prop을 따로 받지 않는다.
 *
 * 접근성: 인터랙티브 요소가 없는 정적 텍스트 블록이라(레일의 링크/버튼 눈금과 다름) 별도
 * `aria-label` 요약을 얹지 않는다 — 라벨·수치·규칙 문장·안내 문구가 전부 화면에 보이는
 * 실제 텍스트 노드라 스크린리더가 DOM 순서 그대로 읽어도 의미가 그대로 전달된다.
 */

function CheckGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
    </svg>
  );
}

const THUMBNAIL_SIZE = 64;

function AxisRow({ label, rangeText, fraction, met }) {
  const color = met ? 'var(--status-done-solid)' : 'var(--status-short-solid)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 'var(--spacing-8)', alignItems: 'center' }}>
      <span
        style={{
          fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', flex: 'none',
          // break-word: 지금 라벨(한글 2~4자)엔 영향 없지만, 라틴 문자 섞인 라벨이 나중에
          // 추가돼도 단어 경계를 먼저 시도해 anywhere보다 방어적이다(인터랙션 리뷰 지적,
          // 티켓 20260904_1058).
          maxWidth: 64, overflowWrap: 'break-word',
        }}
      >
        {label}
      </span>
      <ProgressBar percent={fraction * 100} color={color} trackColor="var(--status-idle-track)" />
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none',
          fontSize: 'var(--text-caption)', fontWeight: 600, color,
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}
      >
        {rangeText}
        {met && <CheckGlyph size={11} />}
      </span>
    </div>
  );
}

export function DualAxisGauge({
  /** 프런티어 눈금의 배지 썸네일. null이면 플레이스홀더 사각형(BadgeStageRail과 동일 처리) */
  imageUrl,
  /** 이미지 대체 텍스트 — 호출부가 "{계열명} {등급}" 형태로 조립해 넘긴다 */
  alt,
  rarity = 'common',
  /** [{ key, label, rangeText, fraction, met }, { ... }] — 항상 2개, formatDualAxisGaugeProps() 결과 그대로 */
  axes,
  /** "두 조건은 각각 다른 활동에서 채워도 돼요." / "한 번의 활동에서 두 조건을 동시에 채워야 해요." */
  ruleText,
  /** "{축} 조건은 이미 채웠어요." — met인 축이 정확히 하나일 때만. 그 외엔 null(렌더 안 함) */
  bottleneckNote,
  className = '',
  style = {},
}) {
  return (
    <div
      className={className}
      style={{
        position: 'relative', borderRadius: 'var(--radius-card)', padding: 'var(--spacing-16)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--spacing-12)', alignItems: 'flex-start' }}>
        <span
          style={{
            width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, flex: 'none',
            borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            // 레일의 StopThumbnail(44px)이 미획득 눈금에 항상 그리는 중성 얇은 링과 같은
            // 문법 — 이 컴포넌트의 64px 사본만 프레임 없이 떠 있으면 같은 배지가 화면에서
            // 두 가지로 보인다(인터랙션 리뷰 지적, 티켓 20260904_1058).
            boxShadow: 'inset 0 0 0 1px var(--color-border-light)',
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다(BadgeStageRail.jsx와 동일 컨벤션)
            <img
              src={imageUrl}
              alt={alt}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4, filter: 'grayscale(1)' }}
            />
          ) : (
            <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
          )}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 'var(--spacing-8)' }}>
            <RarityBadge rarity={rarity} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
            {axes.map((axis) => (
              <AxisRow key={axis.key} label={axis.label} rangeText={axis.rangeText} fraction={axis.fraction} met={axis.met} />
            ))}
          </div>
        </div>
      </div>

      <p style={{ margin: 'var(--spacing-12) 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>
        {ruleText}
      </p>
      {bottleneckNote && (
        <p style={{ margin: 'var(--spacing-4) 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.4, color: 'var(--status-done-solid)' }}>
          {bottleneckNote}
        </p>
      )}
    </div>
  );
}
