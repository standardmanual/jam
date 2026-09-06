import React from 'react';
import { getRarityLabel } from '../cards/RarityBadge.jsx';

/**
 * BadgeTreeSummaryHeader — 배지 트리(/badges/tree) 진행 요약 카드. 티켓 20260903_2329.
 *
 * "내가 얻을 수 있는 배지가 뭐가 있나"의 답을 스크롤이 아니라 숫자 하나로 먼저 보여준다.
 * 등급별 분모(예: Rare 4/16)가 등급 체계 자체를 노출해, 걷기 탭 하나에 등급마다 몇 장이
 * 있는지 이 카드 하나로 조망할 수 있다.
 *
 * 분포 막대는 등급색이 아니라 상태 채널(`--status-progress-done`, 다 채운 것)로 채운다 —
 * 등급은 이 축에 속하지 않고, 이 막대가 말하는 건 "그 등급 중 몇 개를 채웠나"이지 등급
 * 자체가 아니기 때문이다. 등급 식별은 라벨 앞 **8px 도트**가 색으로 맡는다.
 *
 * ## v3 배치 — 1층 히어로 + 2층 2열 버킷 (티켓 20260906_2140)
 *
 * 예전에는 3열 그리드 안에서 셀 순서가 **막대 → 라벨 → 값**이라 «무엇에 대한 막대인지»
 * 모른 채 막대를 먼저 봤다. 셀 폭이 96px이라 값이 12px·막대가 6px로 눌리기도 했다.
 *
 * 1. **1층 히어로** — `획득 12 / 145`(`--text-h3`) + 우측 `8%`(`--text-body-l`).
 *    ⚠️ **전체 진행 막대는 넣지 않는다.** 티켓 20260906_1436의 결정을 유지한다
 *    (2026-09-06 사용자 재확인). 등급 버킷의 막대는 그대로 남는다.
 * 2. **2층 버킷** — **2열**로 바꿔 셀 폭을 ~148px 확보한다. 값 `--text-small`, 막대 8px.
 * 3. 셀 안 순서를 **라벨 + 값 → 막대**로 뒤집는다.
 * 4. 등급 순서는 **Common → Rare → Epic → Mystic → 레벨**(2026-09-06 사용자 확정) —
 *    「앞으로 얼마나 더」를 읽는 순서와 같아진다. 레벨 칸은 **2열 전체**를 쓴다(다른 축이고,
 *    5개를 2열에 넣으면 마지막 하나가 혼자 남는다).
 */
// 「앞으로 얼마나 더」를 읽는 순서 — 쉬운 것부터.
const RARITY_ORDER = ['common', 'rare', 'epic', 'mystic'];
// 등급 라벨은 RarityBadge.jsx의 config가 MODULAR 단일 소스다 — 여기서 다시 선언하지 않는다
// (티켓 20260905_0027).
// 도트 색은 등급 토큰을 그대로 가리킨다. **값을 바꾸지 않는다** — `--color-rarity-*`는
// 폼 입력 에러색으로도 새어 있다(RarityBadge.jsx 주석).
const RARITY_DOT = {
  common: 'var(--color-rarity-common)',
  rare: 'var(--color-rarity-rare)',
  epic: 'var(--color-rarity-epic)',
  mystic: 'var(--color-rarity-mystic)',
};

function BucketCell({ label, dotColor, stat, fullWidth }) {
  const pct = stat.total > 0 ? Math.round((stat.earned / stat.total) * 100) : 0;
  return (
    <div style={{ minWidth: 0, gridColumn: fullWidth ? '1 / -1' : undefined }}>
      {/* 라벨 + 값 → 막대. 무엇에 대한 막대인지 먼저 읽고 막대를 본다 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-8)', minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: dotColor }}
        />
        <span
          style={{
            fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 'var(--text-small)', fontWeight: 700, lineHeight: 1.2, flex: 'none',
            color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {stat.earned} / {stat.total}
        </span>
      </div>
      <div
        style={{
          marginTop: 'var(--spacing-8)', height: 8, borderRadius: 'var(--radius-xs)',
          background: 'var(--status-idle-track)', overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-xs)', background: 'var(--status-progress-done)' }} />
      </div>
    </div>
  );
}

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
  const totalPct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

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
      {/* 1층 히어로 — 막대 없음(20260906_1436 결정 유지, 2026-09-06 재확인) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-12)' }}>
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', flex: 'none' }}>
          획득
        </span>
        <span
          style={{
            fontSize: 'var(--text-h3)', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.28px',
            color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {earnedCount}
          <em style={{ fontStyle: 'normal', fontSize: 'var(--text-small)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {' '}/ {totalCount}
          </em>
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 'var(--text-body-l)', fontWeight: 700, lineHeight: 1.2, flex: 'none',
            color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {totalPct}%
        </span>
      </div>

      {/* 2층 버킷 — 2열. 셀 폭 ~148px이라 값·막대가 눌리지 않는다 */}
      <div
        style={{
          marginTop: 'var(--spacing-16)', display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          columnGap: 'var(--spacing-16)', rowGap: 'var(--spacing-12)',
        }}
      >
        {RARITY_ORDER.map((rarity) => (
          <BucketCell
            key={rarity}
            label={getRarityLabel(rarity)}
            dotColor={RARITY_DOT[rarity]}
            stat={byRarity[rarity] ?? { earned: 0, total: 0 }}
          />
        ))}
        {noRarity && (
          // 레벨은 등급과 **다른 축**이라 2열 전체를 쓴다 — 5칸을 2열에 넣으면 마지막
          // 하나가 혼자 남아 「등급 하나가 빠진 것」처럼 읽힌다.
          <BucketCell label="레벨" dotColor="var(--color-secondary)" stat={noRarity} fullWidth />
        )}
      </div>
    </div>
  );
}
