import React from 'react';

/**
 * ProgressBar — 진행도 바. 단독 / +퍼센트 / +n분의n 3가지 표기 패턴을 하나의 API로 표현한다.
 *
 * [20260820_001] 서비스 6개 호출처(ItemBookHeroSection, CollectionGridCard,
 * itembooks/page, MissionDetailClient, inventory/page, MissionStatusClient) 전수조사 결과,
 * 트랙/필/radius 값이 파편화돼 있었다(하드코딩 vs 토큰 혼재). MissionDetailClient만 토큰을
 * 올바르게 참조하고 있어 이를 캐노니컬 스펙으로 삼는다:
 *   - 트랙: var(--color-border)
 *   - 필: var(--color-primary) 기본값 (color prop으로 오버라이드 — 순위 그라데이션 등 예외 대응)
 *   - radius: var(--radius-pill)
 *   - height: 기본 8px (실사용 최빈값 — MissionDetailClient/ItemBookHeroSection 등 6곳 중 4곳)
 */
export function ProgressBar({
  current,
  total,
  percent,
  labelType = 'none',
  labelPosition = 'inline',
  height = 8,
  color = 'var(--color-primary)',
  trackColor = 'var(--color-border)',
  className = '',
}) {
  const computedPercent =
    percent != null
      ? percent
      : total != null && total > 0
        ? ((current ?? 0) / total) * 100
        : 0;
  const clampedPercent = Math.min(100, Math.max(0, computedPercent));

  const label =
    labelType === 'percent' ? (
      <span
        style={{
          fontSize: 'var(--text-small)',
          fontWeight: 700,
          color: 'var(--color-text)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {Math.round(clampedPercent)}%
      </span>
    ) : labelType === 'fraction' && current != null && total != null ? (
      <span
        style={{
          fontSize: 'var(--text-small)',
          fontWeight: 700,
          color: 'var(--color-primary)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {current}/{total}
      </span>
    ) : null;

  const bar = (
    <div
      style={{
        flex: 1,
        position: 'relative',
        height,
        borderRadius: 'var(--radius-pill)',
        overflow: 'hidden',
        background: trackColor,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          left: 0,
          width: `${clampedPercent}%`,
          height: '100%',
          borderRadius: 'var(--radius-pill)',
          background: color,
          transition: 'width var(--duration-slow) var(--ease-smooth-out)',
        }}
      />
    </div>
  );

  if (!label) {
    return <div className={className} style={{ width: '100%' }}>{bar}</div>;
  }

  if (labelPosition === 'top') {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{label}</div>
        {bar}
      </div>
    );
  }

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)', width: '100%' }}>
      {bar}
      {label}
    </div>
  );
}
