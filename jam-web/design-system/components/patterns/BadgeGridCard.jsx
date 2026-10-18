import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';
import { BadgeLevelChip } from '../cards/BadgeLevelChip.jsx';
import { LockedTile } from '../cards/LockedTile.jsx';
import { ProgressBar } from '../feedback/ProgressBar.jsx';

/** 잠긴 카드의 이름 줄 — 서비스 `d.lockedItem.card.name`과 같은 문구다(이 DS 파일은 서비스 사전을 가져오지 않는다) */
const LOCKED_NAME = '잠긴 아이템 배지';

/**
 * BadgeGridCard — 배지 그리드 셀 패턴.
 *
 * 레이아웃 (위→아래): 썸네일(투명 배경) → 이름 → 등급 pill 또는 Lv.N 칩(있을 때만)
 *
 * 20260905_0038 B — v5 대응으로 두 자리를 더했다.
 *   - `level` — 레벨형 배지는 `rarity`가 NULL이라 등급 칩을 그릴 수 없다(마이그레이션 130).
 *     값이 있으면 `BadgeLevelChip`으로 갈라진다. 두 축은 배타적이라 칩은 언제나 한 개다.
 *   - `count` — 반복 획득 횟수. 2 이상일 때만 썸네일 모서리에 «×N»을 붙인다.
 *     서비스 피드 카드의 카운터 필과 같은 시각 문법이다(새 표현을 만들지 않는다).
 *
 * 면 (티켓 20261015_2133): --surface(흰) + 1px --border + 반경 --radius-2xl, 그림자 없음.
 *   크림 바탕과 흰 면은 1.05:1이라 테두리가 경계를 맡는다. 서비스 `src/components/ui/BadgeGridCard.tsx`와 같은 값이다.
 *
 * 상태:
 *   earned: false  → 썸네일을 원본 + grayscale(1)로 (미획득)
 *   undiscovered   → ??? 표시 + grayscale(1) (아이템북 미발견)
 *   selected       → 면을 --accent-soft로 채움 (선택 모드, 기본 면과 겹치지 않고 한쪽만)
 *
 * 미획득/미발견 썸네일은 **원본 이미지 + `filter: grayscale(1)`** 이다.
 * 20260905_0036이 한때 실루엣(공통 SVG)으로 바꿨다 — grayscale은 그려진 뒤 걸리는 CSS
 * 필터라 원본 URL이 네트워크에 나가 「외형 비공개」가 성립하지 않는다는 이유였다.
 * **2026-09-06 사용자 확정으로 되돌렸다**: 외형을 감추는 것보다 어떤 배지인지 알아볼 수
 * 있는 쪽을 택한다(v5는 조건도 전면 공개한다).
 *
 * 잠김 (`locked`, 티켓 20261018_0054 2회) — 열기 전의 아이템 배지. 같은 면 위에서 썸네일 자리에 `LockedTile`,
 *   이름 줄은 가린 이름(«잠긴 아이템 배지»), 등급 칩 아래에 `ProgressBar outlined` 한 줄(높이 6, 숫자 없음)이 붙는다.
 *   `fillPercent`(0~100)는 서버가 준 채운 비율이다. **이름과 그림은 받지 않는다** — `locked`이면 `imageUrl`·`name`이
 *   넘어와도 그리지 않는다(호출부 실수로 가림이 뚫리지 않게 컴포넌트가 막는다). `rarity`·`level`은 그대로 그린다.
 *
 * 인터랙션 모드 (상호 배타):
 *   href   → <a> 래핑
 *   onClick → <button> 래핑
 *   없음   → 정적 <div>
 *
 * 20260901_1926: props를 서비스 기준으로 재정렬.
 *   - `onNavigate` 추가 — href 모드에서만 의미가 있는 클릭 핸들러(Link 이동 직전 부수효과용).
 *   - `highlighted` 추가 — 컬렉션 슬롯 장착 모드에서 "지금 넣을 수 있는 칸"을 짚어주는
 *     강조 링. `selected`(배경톤 채움)와 시각적으로 다르다.
 */
export function BadgeGridCard({
  name = '',
  imageUrl,
  rarity = 'common',
  level = null,
  count = null,
  href,
  onClick,
  onNavigate,
  earned = true,
  undiscovered = false,
  selected = false,
  highlighted = false,
  locked = false,
  fillPercent = 0,
  className = '',
  style = {},
  children,
}) {
  const dimmed = !earned || undiscovered;
  const interactive = !!(href || onClick);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: selected ? 'var(--accent-soft)' : 'var(--surface)',
    border: '1px solid var(--border)',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-2xl)',
    padding: 'var(--spacing-12)',
    overflow: 'hidden',
    // selected는 2px 보더가 아니라 면 채움(--accent-soft)으로 나타낸다 (기능적 의미 유지)
    // highlighted: 컬렉션 슬롯 장착 모드 하이라이트 — 그리드에서 한 칸을 찾아내야 하므로
    // 배경톤만으로는 약해 별도로 inset 링을 준다(서비스와 동일).
    boxShadow: highlighted ? 'inset 0 0 0 2px var(--link)' : undefined,
    cursor: interactive ? 'pointer' : undefined,
    transition: interactive ? 'transform 100ms' : undefined,
    textDecoration: 'none',
    color: 'inherit',
    ...style,
  };

  const thumbnailStyle = {
    width: 90,
    height: 90,
    borderRadius: 'var(--radius-2xl)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: 'var(--foreground)',
    flexShrink: 0,
  };

  const showCount = !locked && !undiscovered && typeof count === 'number' && count > 1;

  const content = (
    <>
      {/* 카운터 필의 기준점 — 썸네일 자체가 아니라 래퍼에 건다(필이 grayscale을 먹지 않게) */}
      <div style={{ position: 'relative' }}>
        {locked ? (
          <LockedTile size={90} />
        ) : (
        <div style={thumbnailStyle}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={undiscovered ? '???' : name}
              style={{
                width: '100%', height: '100%', objectFit: 'contain', padding: 4,
                filter: dimmed ? 'grayscale(1)' : 'none',
              }}
            />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--muted)' }}>
              <circle cx="12" cy="8" r="5" />
              <path d="M3 20c0-4 4-7 9-7s9 3 9 7" />
            </svg>
          )}
        </div>
        )}
        {showCount && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', bottom: -4, right: -4,
              minWidth: 18, height: 18, padding: '0 4px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              fontSize: 'var(--text-xs)', lineHeight: 1, fontWeight: 700,
              color: 'var(--foreground)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-family-base)',
            }}
          >
            ×{count}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-4)', paddingTop: 'var(--spacing-8)', width: '100%' }}>
        <p style={{
          fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--foreground)',
          textAlign: 'center', width: '100%', lineHeight: 1.3,
          fontFamily: 'var(--font-family-base)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {locked ? LOCKED_NAME : undiscovered ? '???' : name}
        </p>
        {!undiscovered && (level != null ? <BadgeLevelChip level={level} size="md" /> : <RarityBadge rarity={rarity} size="md" />)}
        {locked && (
          // 채운 비율은 게이지로만 보인다 — 숫자와 퍼센트는 화면에도 보조기술에도 싣지 않는다(운영 로직 4.3절)
          <div aria-hidden="true" style={{ width: '100%', paddingTop: 'var(--spacing-4)' }}>
            <ProgressBar outlined percent={fillPercent} fillMode="track-gradient" trackColor="var(--background)" height={6} labelType="none" />
          </div>
        )}
      </div>
      {children && <div style={{ width: '100%', marginTop: 'var(--spacing-4)' }}>{children}</div>}
    </>
  );

  if (href) return <a href={href} onClick={onNavigate} className={className} style={containerStyle}>{content}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={className} style={containerStyle}>{content}</button>;
  return <div className={className} style={containerStyle}>{content}</div>;
}
