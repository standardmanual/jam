import React from 'react';

/**
 * RecentSyncBanner — 직전 동기화 배너. 티켓 20260903_2329 (1차: boolean 이벤트만),
 * 20260904_1425 (3b: 직전 상태값과의 비교 문구 연결).
 *
 * "직전 액티비티에서 얼마나 모자랐나/가까워졌나"를 구체적으로 답하려면 진행 스냅샷
 * (user_family_progress)이 있어야 한다. 1차는 그 데이터 없이도 "방금 동기화된 활동이
 * 있다"는 사실 하나는 알릴 수 있어, boolean 이벤트만으로 이 배너의 시안 색·레이아웃을
 * 먼저 확정해 뒀다. `comparisonMessage`(3b)가 그 위에 얹는 새 prop이다 — 색·레이아웃은
 * 그대로 두고, 값이 있으면 그 문구가 이 배너의 유일한 텍스트 슬롯(message 자리)에
 * 표시된다. 호출부(BadgeTreeClient)가 `src/lib/badgeProgressText.ts`의
 * `formatSyncComparisonText()`로 조립한 "직전 동기화보다 {라벨} {델타}{단위} 가까워졌어요"
 * 문장을 넘긴다 — 비교할 진전이 없으면(최초 싱크 전·변화 없음) null을 넘겨 아래 `message`
 * 기본 문구로 자동 폴백한다.
 *
 * 색은 --status-latest-solid(시안) 하나뿐 — 모자란 것(옐로우)·다 채운 것(라임)과 겹치지
 * 않는 "방금 들어온 것" 전용 채널이라, 유저가 색만 보고도 이 배너를 학습할 수 있다.
 */
export function RecentSyncBanner({
  visible = false,
  message = '최근 활동이 동기화됐어요',
  /**
   * 비교할 진전이 없으면(최초 싱크 전·변화 없음) null. 기본값을 두지 않는다 —
   * `BadgeStageRail.jsx`의 `frontierProgress`/`regretLine`과 동일한 이유(`= null` 기본값은
   * JS 추론 컴포넌트에서 프롭 타입을 정확히 `null` 하나로 좁혀, 문자열을 넘기는 실제
   * 호출부가 타입 에러가 난다). 호출부가 항상 `comparisonMessage={... ?? null}` 형태로
   * 명시적으로 넘긴다.
   */
  comparisonMessage,
  className = '',
  style = {},
}) {
  if (!visible) return null;

  const displayMessage = comparisonMessage || message;

  return (
    <div
      className={className}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)',
        padding: '12px var(--spacing-16)', borderRadius: 'var(--radius-card)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.085) 0%, rgba(255,255,255,.02) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 0 0 1px var(--status-latest-soft), inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8, height: 8, borderRadius: '50%', flex: 'none',
          background: 'var(--status-latest-solid)', boxShadow: '0 0 0 4px var(--status-latest-soft)',
        }}
      />
      <p style={{ margin: 0, fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.35, color: 'var(--color-text)' }}>
        {displayMessage}
      </p>
    </div>
  );
}
