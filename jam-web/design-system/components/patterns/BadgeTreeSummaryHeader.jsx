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
 *
 * v5 대응(티켓 20260905_0036): 칸 수가 `repeat(4, 1fr)`로 **하드코딩**돼 있어서 요약이
 * 「등급 4칸」 그 자체였다. v5 무한레벨형(193종)은 등급이 아예 없어(rarity NULL) 어느 칸에도
 * 들어가지 못하고, 그러면 `totalCount`와 칸 합계가 조용히 어긋난다. `noRarity` 버킷을 받아
 * 「등급 없음」 칸을 하나 더 그린다.
 *
 * ## 배치는 **2행 3열 고정**이다 (티켓 20260906_1323 §6)
 *
 * 예전에는 큰 숫자 한 줄 + 등급 5칸이 가로로 붙어 각 칸이 60px 남짓이었다. 이제 큰 숫자가
 * 첫 칸 안으로 들어가고 나머지가 그 뒤를 잇는다:
 *
 * | 1행 | 전체 `0/124` | Mystic | Epic |
 * | 2행 | 레벨         | Rare   | Common |
 *
 * **칸 수에 따라 열 수를 바꾸지 않는다** — 3열 고정이다. `noRarity`가 없으면 2행 첫 자리를
 * 그냥 비워 Rare·Common의 열이 흔들리지 않게 한다.
 *
 * ## 전체 칸에는 막대를 그리지 않는다 (티켓 20260906_1436 — 결정 번복)
 *
 * `20260906_1323` §6은 "막대·라벨·값의 세로 위치가 세 칸에서 정확히 맞는다"는 근거로 전체
 * 칸에도 등급 칸과 같은 6px 막대를 넣기로 했었다. 실제 화면을 다시 본 사용자 판단으로
 * **그 결정을 되돌린다** — 전체 칸은 막대 없이 레이블+값만 보여준다. 등급 칸(Mystic·Epic·
 * Rare·Common)의 막대는 그대로 남는다. 막대가 빠진 자리만큼 레이블의 `marginTop`을
 * `14`(원래 막대 6px + 여백 8px)로 올려 등급 칸과 레이블의 세로 위치(baseline)는 그대로
 * 유지한다 — 막대만 사라지고 나머지 배치는 흔들리지 않는다.
 */
// 배치 순서(요청 그대로) — 1행 [전체·Mystic·Epic] / 2행 [레벨·Rare·Common]
const RARITY_ORDER = ['mystic', 'epic', 'rare', 'common'];
// 등급 라벨은 RarityBadge.jsx의 config가 MODULAR 단일 소스다 — 여기서 다시 선언하지 않는다
// (티켓 20260905_0027).

export function BadgeTreeSummaryHeader({
  earnedCount,
  totalCount,
  /** { common: {earned,total}, rare: {...}, epic: {...}, mystic: {...} } */
  byRarity,
  /** { earned, total } — 등급이 없는 배지(무한레벨형). null이면 칸을 그리지 않는다 */
  // `= null` 기본값은 JS 추론이 타입을 `null` 하나로 좁히므로 JSDoc으로 캐스팅한다.
  noRarity = /** @type {{ earned: number, total: number } | null} */ (null),
  className = '',
  style = {},
}) {
  const rarityBuckets = RARITY_ORDER.map((rarity) => ({
    key: rarity,
    label: getRarityLabel(rarity),
    stat: byRarity[rarity] ?? { earned: 0, total: 0 },
  }));
  // 6칸(2행 3열) 고정. `null`은 «그냥 비우는 자리»다 — 레벨형이 없는 종목에서도 Rare·Common의
  // 열이 그대로 유지된다.
  const cells = [
    { key: 'total', label: '전체', stat: { earned: earnedCount, total: totalCount }, primary: true },
    rarityBuckets[0],
    rarityBuckets[1],
    noRarity ? { key: 'no-rarity', label: '레벨', stat: noRarity } : null,
    rarityBuckets[2],
    rarityBuckets[3],
  ];
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--spacing-12)' }}>
        {cells.map((cell, i) => {
          // 빈 자리 — 열 위치를 지키기 위한 placeholder다(레벨형이 없는 종목).
          if (!cell) return <div key={`empty-${i}`} aria-hidden="true" />;
          const { key, label, stat, primary } = cell;
          const pct = stat.total > 0 ? Math.round((stat.earned / stat.total) * 100) : 0;
          return (
            <div key={key} style={{ minWidth: 0 }}>
              {/* 전체 칸(primary)은 막대를 그리지 않는다(티켓 20260906_1436) — 등급 칸만 6px 막대 유지 */}
              {!primary && (
                <div style={{ height: 6, borderRadius: 'var(--radius-xs)', background: 'var(--status-idle-track)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-xs)', background: 'var(--status-done-solid)' }} />
                </div>
              )}
              <div style={{ marginTop: primary ? 14 : 8, fontSize: 'var(--text-micro)', color: 'var(--color-text-secondary)', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </div>
              {primary ? (
                <div
                  style={{
                    marginTop: 4, fontSize: 'var(--text-h3)', fontWeight: 700, lineHeight: 1.2,
                    letterSpacing: '-0.28px', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {stat.earned}
                  <em style={{ fontStyle: 'normal', fontSize: 'var(--text-small)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                    {' '}/ {stat.total}
                  </em>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 4, fontSize: 'var(--text-caption)', fontWeight: 600, lineHeight: 1,
                    color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {stat.earned} / {stat.total}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
