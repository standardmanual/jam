import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';
import { ProgressBar } from '../feedback/ProgressBar.jsx';

/**
 * CollectionGridCard — 컬렉션(아이템북) 그리드 셀 패턴.
 *
 * 레이아웃: 썸네일(투명 배경) → 타이틀 → 맨 아래 한 행(20px 최소 높이)
 * 맨 아래 행: 미완성 = [프로그레스 바 | 카운트] / 완성 = 등급 칩들(왼쪽 정렬, 낮은 등급부터, Common 포함, «완성» 칩 없음). 두 카드의 높이가 같다.
 *
 * 면 (티켓 20261015_2133): BadgeGridCard와 같은 면 — --card-bg(흰) 면, 외곽선 없음, 반경 --radius-2xl + 안쪽 여백 12, 그림자 없음.
 * 완성한 카드는 면이 검정 --accent이고 면 위 글자는 --accent-foreground다(2026-11-25 사용자 지시, 티켓 20261125_1113. 이전 면은 강조색 그린). 썸네일 위에는 등급 칩을 얹지 않는다.
 * 진행 바는 직접 그리지 않고 ProgressBar shape="capsule"(어두운 트랙 --capsule-track, 필 홈 캡슐 게이지와 같은 --capsule-fill, 높이 16)를 쓴다 — 서비스 `src/components/ui/CollectionGridCard.tsx`와 같은 트랙·필이다.
 *
 * Props:
 *   completed  — 완성 카드: 면이 검정이 되고 바·숫자 대신 등급 칩(`rarities`)을 맨 아래에 둔다
 *   rarities   — 완성 카드의 맨 아래 행에 칩으로 그릴 등급들(낮은 등급부터, 선택). Common도 그린다. 완성하지 않은 카드는 그리지 않는다(티켓 20261117_1856 → 20261125_1113)
 *   hideProgress — 진행 바와 «수집/전체» 숫자(맨 아래 행)를 그리지 않는다(전체 슬롯 수를 아직 모르는 미리보기용, 기본 false). completed이면 등급 칩 행은 그대로 둔다
 *
 * 인터랙션 모드 (상호 배타):
 *   href   → <a> 래핑
 *   onClick → <button> 래핑
 *   없음   → 정적 <div>
 */
export function CollectionGridCard({
  name,
  imageUrl,
  collected,
  total,
  completed = false,
  rarities = [],
  hideProgress = false,
  href,
  onClick,
  className = '',
  style = {},
  children,
}) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
  const interactive = !!(href || onClick);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-8)',
    background: completed ? 'var(--accent)' : 'var(--card-bg)',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-2xl)',
    padding: 'var(--spacing-12)',
    textDecoration: 'none',
    color: 'inherit',
    cursor: interactive ? 'pointer' : undefined,
    transition: interactive ? 'transform 100ms' : undefined,
    ...style,
  };

  const content = (
    <>
      {/* 썸네일 — 투명 배경 정사각형 */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }}
          />
        ) : (
          // 이미지가 없을 때의 자리 표시 — 서비스의 MagicBookIcon(w-10 h-10, text-muted)과 같은 40px 상자·--muted 색이다(완성 카드는 검정 면 위라 --accent-foreground)
          <span style={{ display: 'inline-flex', width: 40, height: 40, color: completed ? 'var(--accent-foreground)' : 'var(--muted)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </span>
        )}
      </div>

      {/* 타이틀 */}
      <p style={{
        fontSize: 15,
        fontWeight: 700,
        color: completed ? 'var(--accent-foreground)' : 'var(--foreground)',
        lineHeight: '18px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-family-base)',
        margin: 0,
      }}>
        {name}
      </p>

      {/* 맨 아래 한 행 — 칩 높이(20px) 최소 높이로 완성·미완성 카드의 높이를 맞춘다 */}
      {/* hideProgress이면 행을 그리지 않는다(단 completed이면 등급 칩 행은 유지) — 서비스 CollectionGridCard.tsx와 같은 조건 */}
      {(completed || !hideProgress) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: completed ? 4 : 'var(--spacing-8)', flexWrap: completed ? 'wrap' : 'nowrap', minHeight: 20 }}>
          {completed ? (
            rarities.map((r) => <RarityBadge key={r} rarity={r} size="md" showCommon />)
          ) : (
            <>
              <ProgressBar shape="capsule" percent={pct} height={16} color="var(--capsule-fill)" />
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--link)',
                fontWeight: 700,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                fontFamily: 'var(--font-family-base)',
                flexShrink: 0,
              }}>
                {collected}/{total}
              </span>
            </>
          )}
        </div>
      )}

      {children}
    </>
  );

  if (href) return <a href={href} className={className} style={containerStyle}>{content}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={className} style={containerStyle}>{content}</button>;
  return <div className={className} style={containerStyle}>{content}</div>;
}
