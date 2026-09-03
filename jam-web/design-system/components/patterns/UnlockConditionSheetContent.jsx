import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';

/**
 * UnlockConditionSheetContent — 잠금 해제 조건 시트의 본문. 티켓 20260903_2329.
 *
 * 레일·티어 목록에는 자물쇠 아이콘 하나만 두고(카드 안에 조건 문장을 늘어놓지 않는다),
 * 그 아이콘을 누르면 이 콘텐츠가 서비스 BottomSheet 위에 얹혀 조건 전체를 보여준다.
 * DS BottomSheet가 아니라 **서비스 `src/components/ui/BottomSheet.tsx`** 위에 얹는
 * 콘텐츠 전용 컴포넌트다 — 병존 구현 중 실제 화면은 서비스 쪽을 쓰기 때문(§1.6).
 *
 * 여기 넘어오는 `requirements`는 전부 "아직 충족 안 된" 항목만이다 — OR 관계인 선행
 * 배지 그룹은 하나라도 충족되면 게이트 자체가 열린 것으로 간주해(호출부의 게이트 판정)
 * 이 시트를 띄우지 않는다. 그래서 이 컴포넌트는 fulfilled 여부를 다시 갈라 보여주지
 * 않고, 단순히 목록 + "또는" 구분선만 그린다.
 *
 * 미션 진행도(0/1 등)·배지 실측값은 표시하지 않는다 — 진행 계산 모듈이 필요한 2차 범위.
 */
function ChevronRightGlyph({ size = 16 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
    </svg>
  );
}
function CheckGlyph({ size = 16 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
    </svg>
  );
}

function RequirementIcon({ imageUrl, kind }) {
  return (
    <span
      style={{
        width: 36, height: 36, flex: 'none', borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px var(--color-border-light)', overflow: 'hidden',
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다
        <img
          src={imageUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4, filter: kind === 'badge' ? 'grayscale(1)' : undefined }}
        />
      ) : (
        <span style={{ width: 16, height: 16, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
      )}
    </span>
  );
}

export function UnlockConditionSheetContent({
  badgeName,
  rarity,
  imageUrl,
  /** true면 수치 조건은 이미 채운 상태 — "조건을 다 채웠어요" 확인 줄을 보여준다 */
  conditionMet = false,
  /** [{ kind: 'mission'|'badge', name, href, imageUrl }] — 전부 미충족 항목만 */
  requirements,
  className = '',
  style = {},
}) {
  return (
    <div className={className} style={style}>
      <div style={{ display: 'flex', gap: 'var(--spacing-12)', alignItems: 'center' }}>
        <span
          style={{
            width: 56, height: 56, flex: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `inset 0 0 0 2px ${conditionMet ? 'var(--status-done-solid)' : 'var(--color-border-light)'}`,
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4, filter: 'grayscale(1)' }} />
          ) : (
            <span style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere', color: 'var(--color-text)' }}>
            {badgeName}
          </p>
          <div style={{ marginTop: 2 }}>
            <RarityBadge rarity={rarity} />
          </div>
        </div>
      </div>

      {conditionMet && (
        <div style={{ marginTop: 'var(--spacing-16)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-small)', fontWeight: 600, color: 'var(--status-done-solid)' }}>
          <CheckGlyph size={16} />
          조건을 다 채웠어요
        </div>
      )}

      <h3
        style={{
          margin: `${conditionMet ? 'var(--spacing-16)' : 'var(--spacing-24)'} 0 var(--spacing-8)`,
          fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-text-secondary)',
        }}
      >
        잠금 해제 조건
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {requirements.map((req, i) => (
          <React.Fragment key={req.href}>
            {i > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.06em' }}>
                <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                또는
                <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              </div>
            )}
            <a
              href={req.href}
              style={{
                display: 'flex', gap: 'var(--spacing-12)', alignItems: 'center', padding: 'var(--spacing-12)',
                borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.055)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)', textDecoration: 'none', color: 'inherit',
              }}
            >
              <RequirementIcon imageUrl={req.imageUrl} kind={req.kind} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere', color: 'var(--color-text)' }}>
                  {req.name}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)' }}>
                  {req.kind === 'mission' ? '미션' : '배지 · 어느 등급이든 1개'}
                </p>
              </div>
              <span style={{ color: 'var(--color-text-secondary)', flex: 'none', display: 'flex' }}>
                <ChevronRightGlyph size={16} />
              </span>
            </a>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
