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
 * 칩 자리 폭이 52px로 고정이라 **칩이 있는 행끼리는** 이름 시작 x가 같다
 * (반복형은 등급이 있으므로 칩은 `RarityBadge`, 레벨형은 `BadgeLevelChip`).
 *
 * ⚠️ 칩을 그리지 않는 행(미획득·등급 없음)은 **칩 칸 자체를 만들지 않는다**(티켓 20260906_1323 §2).
 * 예전에는 빈 `<span>`을 남기고 52px 칸을 그대로 잡아서, 칩이 없는 행만 이름이 카드 가운데로
 * 밀려나고 바로 아래 캡션과 시작 x가 어긋났다. `columnGap`이 8px이라 칸만 `auto`로 바꾸는
 * 방식으로는 여백이 절반만 없어진다 — 요소를 통째로 빼야 한다.
 *
 * 미획득이면 이름·칩·카운터에서 색을 전부 거두고 썸네일은 grayscale(1) 원본으로 둔다
 * (2026-09-06 사용자 확정 — 미획득도 어떤 배지인지 알아볼 수 있어야 한다).
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
  // 칩을 실제로 그릴 때만 52px 칸을 잡는다(§2). `RarityBadge`는 등급이 없으면 아무것도
  // 그리지 않으므로 조건이 곧 「칩이 있는가」다.
  const showChip = earned && rarity != null;

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
            display: 'grid', gridTemplateColumns: showChip ? '52px 1fr auto' : '1fr auto',
            columnGap: 'var(--spacing-8)', alignItems: 'center',
          }}
        >
          {/* 52px 고정 칸 — RarityBadge는 라벨 길이에 따라 폭이 달라지므로(Common은 아예 안
              그린다) 칸을 고정하고 그 안에 넣는다. 그래야 칩이 있는 행끼리 이름 시작 x가 같다. */}
          {showChip && (
            <span style={{ width: 52, display: 'inline-flex', justifyContent: 'flex-start' }}>
              <RarityBadge rarity={rarity} />
            </span>
          )}
          <span
            style={{
              fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.3,
              color: nameColor, minWidth: 0,
              // 말줄임을 쓰지 않는다(§5) — 계열 이름이 이 화면의 지표 그 자체라 끝이 잘리면
              // 무엇의 배지인지 사라진다. keep-all로 한글은 어절 단위로만 끊는다.
              wordBreak: 'keep-all',
            }}
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
