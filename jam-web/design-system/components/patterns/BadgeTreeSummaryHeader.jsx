import React from 'react';
import { getRarityLabel } from '../cards/RarityBadge.jsx';

/**
 * BadgeTreeSummaryHeader — 배지 트리(/badges/tree) 진행 요약 카드. 티켓 20260903_2329.
 *
 * "내가 얻을 수 있는 배지가 뭐가 있나"의 답을 스크롤이 아니라 숫자 하나로 먼저 보여준다.
 * 등급별 분모(예: Rare 4/16)가 등급 체계 자체를 노출해, 걷기 탭 하나에 등급마다 몇 장이
 * 있는지 이 카드 하나로 조망할 수 있다.
 *
 * 분포 막대는 등급색이 아니라 상태 채널(--status-done-solid, 다 채운 것)로 채운다 —
 * 등급은 이 축에 속하지 않고(등급칩 안에서만 색을 쓴다), 이 막대가 말하는 건 "그 등급 중
 * 몇 개를 채웠나"이지 등급 자체가 아니기 때문이다.
 */
const RARITY_ORDER = ['common', 'rare', 'epic', 'mystic'];
// 등급 라벨은 RarityBadge.jsx의 config가 MODULAR 단일 소스다 — 여기서 다시 선언하지 않는다
// (티켓 20260905_0027).

export function BadgeTreeSummaryHeader({
  earnedCount,
  totalCount,
  /** { common: {earned,total}, rare: {...}, epic: {...}, mystic: {...} } */
  byRarity,
  className = '',
  style = {},
}) {
  return (
    <div
      className={className}
      style={{
        padding: 'var(--spacing-16)', borderRadius: 'var(--radius-card)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-h3)', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.28px',
          fontVariantNumeric: 'tabular-nums', color: 'var(--color-text)',
        }}
      >
        {earnedCount}
        <em style={{ fontStyle: 'normal', fontSize: 'var(--text-small)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          {' '}/ {totalCount}
        </em>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--spacing-8)', marginTop: 'var(--spacing-16)' }}>
        {RARITY_ORDER.map((rarity) => {
          const stat = byRarity[rarity] ?? { earned: 0, total: 0 };
          const pct = stat.total > 0 ? Math.round((stat.earned / stat.total) * 100) : 0;
          return (
            <div key={rarity} style={{ minWidth: 0 }}>
              <div style={{ height: 6, borderRadius: 'var(--radius-xs)', background: 'var(--status-idle-track)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-xs)', background: 'var(--status-done-solid)' }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 'var(--text-micro)', color: 'var(--color-text-secondary)', lineHeight: 1 }}>
                {getRarityLabel(rarity)}
              </div>
              <div
                style={{
                  marginTop: 4, fontSize: 'var(--text-caption)', fontWeight: 600, lineHeight: 1,
                  color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums',
                }}
              >
                {stat.earned} / {stat.total}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
