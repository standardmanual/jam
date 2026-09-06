import React from 'react';
import { getRarityLabel } from '../cards/RarityBadge.jsx';
import { ProgressBar } from '../feedback/ProgressBar.jsx';
import { BadgeFamilyCardHeader, progressRampColor } from './BadgeFamilyCardHeader.jsx';

/**
 * BadgeStampRow — 반복형 계열 한 줄. 티켓 20260905_0036.
 *
 * 반복형(v5 139종)은 같은 조건을 몇 번 다시 채웠는지가 전부다("한 주에 3회"를 1·8·26·52회).
 * **누적 횟수는 `×N` 칩 하나로만 그린다 — 점 그리드를 쓰지 않는다.**
 * 47회를 점 47개로 그리면 100회를 넘는 순간 의미를 잃고, 축약하면(한 점 = 5회 같은 식)
 * 임의로 정한 기준이 화면에 그대로 드러난다. 숫자 하나가 정확하고 자리도 안 먹는다.
 *
 * ## v2 — `BadgeLevelGauge`와 같은 구조로 (티켓 20260906_2140)
 *
 * 헤더(`BadgeFamilyCardHeader`)가 카드 폭 전체를 쓰고, 본문이 `[52px 썸네일][×N 칩 +
 * 캡션 + 바]`다. 예전에는 이름이 썸네일(44) + 갭(12) + 칩(52) 뒤 **88px**에서 시작해
 * 레일 카드(32px)와 어긋나 있었다 — 같은 화면에서 같은 위계의 이름이 두 자리에 있었다.
 * 등급은 헤더 우측 진행률 블록의 라벨(`Epic`) **텍스트**로 올라간다.
 *
 * 미획득이면 썸네일은 grayscale(1) 원본으로 둔다(2026-09-06 사용자 확정 — 미획득도 어떤
 * 배지인지 알아볼 수 있어야 한다). 이미지는 여백 없이 프레임을 꽉 채우고(`objectFit: cover`)
 * 모서리는 프레임의 `overflow: hidden`이 자른다.
 */

/** 썸네일 한 변 — 레일 눈금·레벨 게이지와 같은 값. 카드 종류가 달라도 배지 크기는 하나다. */
const THUMB_SIZE = 52;

export function BadgeStampRow({
  /** 계열 이름 */
  name,
  /**
   * 등급 — 반복형은 v5에서 등급이 있다(레벨형만 rarity가 NULL). 헤더 우측 진행률 옆에
   * **텍스트**로 그린다(칩이 아니다). 라벨 문자열은 `RarityBadge`의 config가 단일 소스다.
   */
  rarity = /** @type {'common' | 'rare' | 'epic' | 'mystic' | null} */ (null),
  /** 누적 횟수. `×N` 칩 하나로만 그린다 */
  count,
  /** 이름 아래 한 줄 보조 문장(완성 문자열). null이면 그리지 않는다 */
  caption,
  /**
   * 다음 회차까지의 0~1 진행률. null이면 진행 바를 그리지 않는다 — 진행을 계산할 수 없는
   * 계열에서 0%짜리 빈 막대를 그리면 「아직 아무것도 안 했다」는 **틀린 사실**이 된다.
   */
  fraction = /** @type {number | null} */ (null),
  /** 헤더 2행(메타 줄) 완성 문자열. null이면 그리지 않는다 */
  metaText = /** @type {React.ReactNode} */ (null),
  earned = true,
  /** 배지 이미지. 미획득이면 grayscale(1)로 그린다 */
  imageUrl = /** @type {string | null} */ (null),
  /** 이미지 대체 텍스트. 생략하면 `name`을 쓴다 */
  alt = /** @type {string | null} */ (null),
  className = '',
  style = {},
}) {
  const clamped = fraction == null ? null : Math.min(1, Math.max(0, fraction));

  return (
    <div
      className={className}
      style={{
        borderRadius: 'var(--radius-card)',
        padding: 'var(--spacing-16)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <BadgeFamilyCardHeader
        name={name}
        fraction={clamped}
        pctLabel={getRarityLabel(rarity)}
        done={earned && clamped == null}
        metaText={metaText}
      />

      {/* 본문 — [52px 썸네일][×N 칩 + 캡션 + 바] */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: `${THUMB_SIZE}px 1fr`,
          columnGap: 'var(--spacing-12)', alignItems: 'center',
          marginTop: 'var(--spacing-12)',
        }}
      >
        <span
          style={{
            width: THUMB_SIZE, height: THUMB_SIZE, flex: 'none',
            borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: `inset 0 0 0 ${earned ? 2 : 1}px ${earned ? 'var(--status-progress-done)' : 'var(--color-border-light)'}`,
            color: 'var(--color-text)',
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다
            <img
              src={imageUrl}
              alt={alt ?? name}
              style={{
                width: '100%', height: '100%', objectFit: 'cover', padding: 0,
                display: 'block', filter: earned ? 'none' : 'grayscale(1)',
              }}
            />
          ) : (
            <span style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
          )}
        </span>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-8)', minWidth: 0 }}>
            {count != null && (
              <span
                aria-label={`누적 ${count}회`}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
                  padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                  fontSize: 'var(--text-small)', lineHeight: 1.2, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                  background: 'var(--status-idle-track)',
                  color: earned ? 'var(--color-text)' : 'var(--color-text-secondary)',
                }}
              >
                ×{count}
              </span>
            )}
            {caption && (
              <span
                style={{
                  fontSize: 'var(--text-caption)', lineHeight: 1.4, minWidth: 0,
                  color: clamped == null ? 'var(--color-text-secondary)' : progressRampColor(clamped),
                  wordBreak: 'keep-all', overflowWrap: 'anywhere',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {caption}
              </span>
            )}
          </div>

          {clamped != null && (
            <div style={{ marginTop: 'var(--spacing-8)' }}>
              <ProgressBar
                percent={clamped * 100}
                fillMode="track-gradient"
                trackColor="var(--status-idle-track)"
                height={10}
                radius="var(--radius-xs)"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
