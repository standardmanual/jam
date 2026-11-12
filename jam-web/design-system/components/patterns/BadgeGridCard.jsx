import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';
import { BadgeLevelChip } from '../cards/BadgeLevelChip.jsx';
import { LockedTile } from '../cards/LockedTile.jsx';
import { SlotOutline } from '../cards/SlotOutline.jsx';
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
 * 면 (티켓 20261107_2246): --card-bg + 반경 --radius-2xl, 외곽선·그림자 없음. 서비스 `src/components/ui/BadgeGridCard.tsx`와 같은 값이다.
 *
 * 상태:
 *   earned: false  → 썸네일을 원본 + grayscale(1)로 (미획득)
 *   undiscovered   → 이미지 없이 이미지 윤곽의 점선(`SlotOutline`)만, 이름은 그대로 (아이템북 후보 없는 칸, 티켓 20261112_1627)
 *   outlined       → 이미지(grayscale + 반투명) 위에 같은 점선을 불투명하게 겹친다 (지금 넣을 수 있는 칸, 티켓 20261112_1627)
 *   selected       → 블랙 2px 링(box-shadow, 레이아웃을 밀지 않음). 면은 그대로 --card-bg (선택 모드)
 *
 * 미획득 썸네일은 **원본 이미지 + `filter: grayscale(1)`** 이다.
 * 20260905_0036이 한때 실루엣(공통 SVG)으로 바꿨다 — grayscale은 그려진 뒤 걸리는 CSS
 * 필터라 원본 URL이 네트워크에 나가 「외형 비공개」가 성립하지 않는다는 이유였다.
 * **2026-09-06 사용자 확정으로 되돌렸다**: 외형을 감추는 것보다 어떤 배지인지 알아볼 수
 * 있는 쪽을 택한다(v5는 조건도 전면 공개한다).
 *
 * 미발견(`undiscovered`)만 예외다 (티켓 20261102_1834, 2026-11-02 사용자 지시). 되돌린 것이 아니라
 * «미발견만 이미지를 걷고 윤곽만, `earned=false`는 원본 그레이 유지»다. 티켓 20261112_1627에서 이전의 회색 실루엣 채움
 * (`brightness(0) invert(0.64)`)을 걷고 **자기 이미지의 알파 윤곽을 따라가는 점선**으로 바꿨다(2026-11-12 사용자 확정).
 * 점선은 `SlotOutline`이 그린다: 색 `--muted` 불투명, 2px, 선 3 · 간격 4. 추적에 실패하거나 이미지 주소가 없으면 둥근 사각형 점선이다.
 * 이름은 가리지 않고 그대로 보인다(수집 목표가 읽히도록). 판정 순서는 locked > undiscovered > !earned다
 * (서비스 호출부는 미발견 칸에 `earned=false`도 함께 넘긴다).
 *
 * `outlined`(새 prop)는 지금 넣을 수 있는 칸이다. 이미지는 `earned=false`처럼 grayscale + 반투명(opacity 0.4)이고
 * 그 위에 같은 점선을 **이미지 요소의 형제**로 겹친다(이미지 opacity의 영향을 받지 않아 점선이 불투명 100%).
 * 추적에 실패하면 이미지가 보이므로 사각형 대체 없이 그리지 않는다.
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
  visitCount = null,
  href,
  onClick,
  onNavigate,
  earned = true,
  undiscovered = false,
  outlined = false,
  selected = false,
  highlighted = false,
  locked = false,
  fillPercent = 0,
  className = '',
  style = {},
  children,
}) {
  // 판정 순서: undiscovered(이미지 없이 점선만) > !earned(원본 + grayscale). 미발견 칸은 earned=false도 함께 오므로 순서가 바뀌면 점선이 사라진다
  const thumbFilter = !earned ? 'grayscale(1)' : 'none';
  // 넣을 수 있는 칸의 이미지는 서비스와 같이 반투명(opacity-40). 점선은 이 <img>의 형제라 영향을 받지 않는다
  const thumbOpacity = outlined && !earned ? 0.4 : undefined;
  const interactive = !!(href || onClick);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--card-bg)',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-2xl)',
    padding: 'var(--spacing-12)',
    overflow: 'hidden',
    // selected는 면을 바꾸지 않고 블랙 2px 링으로 나타낸다(서비스 ring-2 ring-foreground와 같다, 새 색 없음)
    // highlighted: 컬렉션 슬롯 장착 모드 하이라이트 — 그리드에서 한 칸을 찾아내야 하므로
    // 배경톤만으로는 약해 별도로 inset 링을 준다(서비스와 동일).
    boxShadow: [selected && '0 0 0 2px var(--foreground)', highlighted && 'inset 0 0 0 2px var(--link)'].filter(Boolean).join(', ') || undefined,
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
      <div style={{ position: 'relative', width: '100%', maxWidth: 90 }}>
        {locked ? (
          <LockedTile size={90} />
        ) : undiscovered ? (
          <SlotOutline src={imageUrl} fallback="box" />
        ) : (
        <>
        <div style={thumbnailStyle}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              style={{
                width: '100%', height: '100%', objectFit: 'contain', padding: 4,
                filter: thumbFilter,
                opacity: thumbOpacity,
              }}
            />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--muted)' }}>
              <circle cx="12" cy="8" r="5" />
              <path d="M3 20c0-4 4-7 9-7s9 3 9 7" />
            </svg>
          )}
        </div>
        {outlined && <SlotOutline src={imageUrl} fallback="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
        </>
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
          {locked ? LOCKED_NAME : name}
        </p>
        {!undiscovered && (level != null ? <BadgeLevelChip level={level} size="md" /> : <RarityBadge rarity={rarity} size="md" />)}
        {/* 방문 횟수 칩(체크인 배지 목록, 2026-11-09) — 2회 이상일 때만, 등급 칩과 같은 크기(md). 면은 레벨 칩과 같은 --default-soft다. 서비스 `BadgeGridCard`와 같은 값이다 */}
        {!undiscovered && typeof visitCount === 'number' && visitCount > 1 && (
          <span
            role="img"
            aria-label={`${visitCount}번 방문했어요`}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--chip-padding)', borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: 'var(--foreground)', background: 'var(--default-soft)',
            }}
          >
            ×{visitCount}
          </span>
        )}
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
