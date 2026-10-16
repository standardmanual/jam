import React from 'react';
import { Card } from './Card.jsx';
import { RarityBadge } from './RarityBadge.jsx';
import { Button } from '../buttons/Button.jsx';
import { LockIcon } from '../icons/IconCatalog.jsx';

/**
 * MissionCard — 미션 목록 카드 패턴.
 *
 * 20260828_2043: 서비스 `src/app/(main)/missions/MissionsListClient.tsx`의 인라인 마크업
 * (Figma mission-item-1)을 참고해 Card + RarityBadge + Button 조합으로 구성했다. 원본의
 * 하드코딩 색상(#1A1A1A, #B2B2B2, #E8461F, #FFFFFF 등)을 전부 컬러 토큰으로 교체했다.
 * 이번 티켓 범위는 컴포넌트 신설까지다 — MissionsListClient.tsx를 이 컴포넌트로 교체하는
 * 연결 작업은 포함하지 않는다.
 *
 * 레이아웃 (좌→우): 90×90 썸네일 → 텍스트 영역(상태 칩·기간, 제목, 설명, 등급+보상) → 액션 버튼
 *
 * 카드 면은 `Card` 기본 톤(--surface + 1px --border, 그림자 없음)이다.
 *
 * locked=true면 썸네일에 grayscale+딤 처리와 자물쇠 오버레이가 붙고, 액션 버튼이
 * 비활성화된다 (서비스의 잠금 미션 카드 패턴, 20260825_028 참고).
 */
export function MissionCard({
  imageUrl,
  title,
  description,
  rewardText,
  rarity,
  statusLabel,
  periodText,
  locked = false,
  actionLabel = '참가하기',
  onAction,
  className = '',
  style = {},
}) {
  return (
    <Card
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 'var(--spacing-16)',
        opacity: locked ? 0.6 : 1,
        ...style,
      }}
    >
      {/* thumbnail */}
      <div
        style={{
          position: 'relative',
          width: 90,
          height: 90,
          minWidth: 90,
          background: 'var(--background)',
          borderRadius: 'var(--radius-2xl)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: locked ? 'grayscale(1)' : undefined,
              opacity: locked ? 0.4 : 1,
            }}
          />
        ) : (
          <span
            style={{
              display: 'block',
              width: 32,
              height: 32,
              background: 'var(--background-inverse)',
              borderRadius: 'var(--radius-sm)',
              opacity: 0.2,
            }}
          />
        )}
        {locked && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--background-inverse)',
            }}
          >
            <LockIcon width={24} height={24} />
          </span>
        )}
      </div>

      {/* text-area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
        {(statusLabel || periodText) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center' }}>
            {statusLabel && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  // 상태 칩 면 — 카드 면(--surface)과 같은 색이면 알약 윤곽이 사라지므로 한 단계 낮춘 --background-secondary다(티켓 20261015_2133)
                  background: 'var(--background-secondary)',
                  color: 'var(--muted)',
                  fontSize: 10,
                  lineHeight: 1,
                  padding: '3px 6px',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                {locked && <LockIcon width={10} height={10} strokeWidth={2.5} />}
                {statusLabel}
              </span>
            )}
            {periodText && (
              <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1 }}>
                {periodText}
              </span>
            )}
          </div>
        )}

        <h3
          style={{
            margin: 0,
            fontSize: 'var(--text-base)',
            fontWeight: 700,
            color: 'var(--foreground)',
            lineHeight: 1.25,
          }}
        >
          {title}
        </h3>

        {description && (
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-sm)',
              lineHeight: 'var(--text-sm--line-height)',
              color: 'var(--muted)',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </p>
        )}

        {(rarity || rewardText) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {rarity && <RarityBadge rarity={rarity} />}
            {rewardText && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--link)', lineHeight: 1 }}>
                {rewardText}
              </span>
            )}
          </div>
        )}
      </div>

      {/* action */}
      {onAction && (
        <Button variant="primary" size="sm" onClick={onAction} disabled={locked}>
          {locked ? '잠김' : actionLabel}
        </Button>
      )}
    </Card>
  );
}
