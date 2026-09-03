import React from 'react';

/**
 * RecentSyncBanner — 직전 동기화 배너. 티켓 20260903_2329 (1차: boolean 이벤트만).
 *
 * "직전 액티비티에서 얼마나 모자랐나/가까워졌나"를 구체적으로 답하려면 진행 스냅샷
 * (user_family_progress, 3차)이 있어야 한다. 1차는 그 데이터 없이도 "방금 동기화된 활동이
 * 있다"는 사실 하나는 알릴 수 있어, boolean 이벤트만으로 이 배너의 시안 색·레이아웃을
 * 먼저 확정해 둔다. 구체적인 수치·개수는 2·3차에서 이 컴포넌트에 새 prop으로 얹는다.
 *
 * 색은 --status-latest-solid(시안) 하나뿐 — 모자란 것(옐로우)·다 채운 것(라임)과 겹치지
 * 않는 "방금 들어온 것" 전용 채널이라, 유저가 색만 보고도 이 배너를 학습할 수 있다.
 */
export function RecentSyncBanner({ visible = false, message = '최근 활동이 동기화됐어요', className = '', style = {} }) {
  if (!visible) return null;

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
        {message}
      </p>
    </div>
  );
}
