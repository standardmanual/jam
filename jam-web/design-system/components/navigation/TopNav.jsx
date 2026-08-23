import React from 'react';

/*
 * 20260823_003: 재질(반투명 크롬) — 콘텐츠가 아래로 스크롤되어 지나가는 상단 크롬이라
 * 재질 적용 효과가 가장 크다. WanderingEyesLoader와 동일한 패턴(모듈 스코프 STATIC_CSS +
 * 인라인 <style> 주입)으로 prefers-reduced-transparency 가드를 짝지어 둔다 — 인라인
 * style에 두면 header의 `style` prop(헤더 배경 오버라이드용)이 항상 이 규칙을 이기므로
 * 클래스 기반으로 분리했다(badge-background-video 케이스와 동일 이유).
 * headerStyle로 background를 직접 지정하는 화면(예: --color-surface)은 인라인 style이
 * 클래스보다 우선하므로 그대로 오버라이드된다 — 재질 규칙과 충돌하지 않는다.
 */
const STATIC_CSS = `.ds-topnav-chrome{background:var(--color-chrome-bg);backdrop-filter:blur(var(--blur-chrome)) saturate(180%);-webkit-backdrop-filter:blur(var(--blur-chrome)) saturate(180%)}@media(prefers-reduced-transparency:reduce){.ds-topnav-chrome{backdrop-filter:none;-webkit-backdrop-filter:none;background:var(--color-bg)}}`;

/**
 * TopNav — sticky top bar with back button, title, optional right slot.
 * v2 changes:
 *   - h1 font-size: --text-body (16px) → --text-h4 (24px) — semantic/visual alignment
 *   - CDN icon replaced with inline SVG chevron-left
 *   - Uses IconButton-compatible inline SVG approach (no import needed here)
 *   - elevation: 보더/드롭섀도 없음(20260816_012) — 헤더와 본문 배경톤 차이만으로 구분
 *
 * 20260820_009: 서비스 실연결 — 서비스 `TopNav.tsx`를 캐노니컬 스펙으로 값 정렬(padding
 * 12px→16px, outer gap 4→8, chevron 22px/strokeWidth 2 → 24px/1.5), safe-area-inset-top
 * padding 상시 추가(서비스는 이미 항상 적용 중이던 값 — 노치 기기에서 헤더가 잘리지 않게 함).
 * title 타이포는 titleSize/titleWeight/titleLineHeight/titleTracking prop으로 오버라이드
 * 가능하게 확장(기본값은 ds 원래 h4 24px 유지, 서비스는 body 16px 명시 전달 — 하위 호환).
 * style prop 추가(header 배경 오버라이드용, 서비스의 headerStyle 대응).
 */
export function TopNav({
  title = '',
  showBack = true,
  onBack,
  rightSlot = null,
  titleSize = 'var(--text-h4)',
  titleWeight = 'var(--weight-h4)',
  titleLineHeight = 'var(--leading-h4)',
  titleTracking = 'var(--tracking-h4)',
  style = {},
}) {
  return (
    <>
    <style>{STATIC_CSS}</style>
    <header className="ds-topnav-chrome" style={{
      position: 'sticky', top: 0,
      paddingTop: 'env(safe-area-inset-top)',
      zIndex: 30,
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px', height: 56,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {showBack && (
            <button
              aria-label="뒤로"
              onClick={onBack}
              style={{
                width: 44, height: 44, border: 'none', background: 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text)', flexShrink: 0,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={24} height={24} aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <h1 style={{
            margin: 0,
            fontSize: titleSize,
            lineHeight: titleLineHeight,
            fontWeight: titleWeight,
            letterSpacing: titleTracking,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: 'var(--color-text)',
          }}>
            {title}
          </h1>
        </div>
        <div style={{ minWidth: 44, display: 'flex', justifyContent: 'flex-end' }}>
          {rightSlot}
        </div>
      </div>
    </header>
    </>
  );
}
