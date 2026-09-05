import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';

/**
 * BadgeStampRow — 반복형 계열 한 줄. 티켓 20260905_0036.
 *
 * 반복형(v5 139종)은 같은 조건을 몇 번 다시 채웠는지가 전부다("한 주에 3회"를 1·8·26·52회).
 * **누적 횟수는 `×N` 칩 하나로만 그린다 — 점 그리드를 쓰지 않는다.**
 * 47회를 점 47개로 그리면 100회를 넘는 순간 의미를 잃고, 축약하면(한 점 = 5회 같은 식)
 * 임의로 정한 기준이 화면에 그대로 드러난다. 숫자 하나가 정확하고 자리도 안 먹는다.
 *
 * 그리드는 `BadgeLevelGauge`와 같다 — `[썸네일 44px][내용 1fr]`, 1행 `[52px 칩][1fr 이름][auto 카운터]`.
 * 칩 자리 폭이 52px로 고정이라 레벨형·반복형이 섞여 있어도 이름 시작 x가 같다
 * (반복형은 등급이 있으므로 칩은 `RarityBadge`, 레벨형은 `BadgeLevelChip`).
 *
 * 미획득이면 이름·칩·카운터에서 색을 전부 거두고 썸네일은 실루엣으로 둔다.
 */
export function BadgeStampRow({
  /** 계열 이름 */
  name,
  /** 등급 — 반복형은 v5에서 등급이 있다(레벨형만 rarity가 NULL) */
  rarity,
  /** 누적 횟수. `×N` 칩 하나로만 그린다 */
  count,
  /** 이름 아래 한 줄 보조 문장(완성 문자열). null이면 그리지 않는다 */
  caption,
  earned = true,
  /** 배지 이미지. 미획득이면 grayscale(1)로 그린다 */
  imageUrl = /** @type {string | null} */ (null),
  /** 이미지 대체 텍스트. 생략하면 `name`을 쓴다 */
  alt = /** @type {string | null} */ (null),
  className = '',
  style = {},
}) {
  const nameColor = earned ? 'var(--color-text)' : 'var(--color-text-secondary)';

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr',
        columnGap: 'var(--spacing-12)',
        alignItems: 'start',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--spacing-16)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <span
        style={{
          gridColumn: 1, gridRow: '1 / -1',
          width: 44, height: 44, flex: 'none',
          borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `inset 0 0 0 ${earned ? 2 : 1}px ${earned ? 'var(--status-done-solid)' : 'var(--color-border-light)'}`,
          color: 'var(--color-text)',
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다
          <img
            src={imageUrl}
            alt={alt ?? name}
            style={{
              width: '100%', height: '100%', objectFit: 'contain', padding: 3,
              borderRadius: 'var(--radius-sm)', filter: earned ? 'none' : 'grayscale(1)',
            }}
          />
        ) : (
          <span style={{ width: 20, height: 20, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
        )}
      </span>

      <div style={{ gridColumn: 2, minWidth: 0 }}>
        <div
          style={{
            display: 'grid', gridTemplateColumns: '52px 1fr auto',
            columnGap: 'var(--spacing-8)', alignItems: 'center',
          }}
        >
          {/* 52px 고정 칸 — RarityBadge는 라벨 길이에 따라 폭이 달라지므로(Common은 아예 안
              그린다) 칸을 고정하고 그 안에 넣는다. 그래야 이름 시작 x가 계열마다 같다. */}
          <span style={{ width: 52, display: 'inline-flex', justifyContent: 'flex-start' }}>
            {earned && <RarityBadge rarity={rarity} />}
          </span>
          <span
            style={{
              fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.3,
              color: nameColor, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={name}
          >
            {name}
          </span>
          {count != null && (
            <span
              aria-label={`누적 ${count}회`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '3px 8px', borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-micro)', lineHeight: 1, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                background: 'var(--status-idle-track)',
                color: earned ? 'var(--color-text)' : 'var(--color-text-secondary)',
              }}
            >
              ×{count}
            </span>
          )}
        </div>

        {caption && (
          <p
            style={{
              margin: 'var(--spacing-8) 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.4,
              color: 'var(--color-text-secondary)', wordBreak: 'keep-all',
            }}
          >
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}
