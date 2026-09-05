import React from 'react';

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
 *
 * 20260824_010: 전 페이지 3분할 확장 — 좌측(로고/뒤로가기) · 중앙(동기화 버튼) · 우측
 * (rightSlot 액션 + 아바타) 슬롯 추가.
 *   - `logo`: 있으면 좌측 영역의 back+title 블록 대신 이 노드를 렌더링한다(탭 최상위
 *     페이지의 Jam 로고 표시용). 기본값 null이면 기존 back+title 동작 그대로 유지된다.
 *   - `centerSlot`: 좌/우 사이에 렌더링되는 중앙 고정폭 영역(스트라바 동기화 버튼용).
 *     기본값 null이면 렌더링되지 않아 기존 2분할 레이아웃과 동일하다. 서비스 래퍼가 항상
 *     같은 위치에 주입하는 도메인 결합 콘텐츠라 별도 slot으로 유지한다(jam-ds §3 원칙 —
 *     도메인 결합 값은 MODULAR 표준 API로 흡수하지 않는다).
 *   - 우측 영역: `rightSlot` 하나로 통합(아바타 포함). 이전에는 `avatarSlot`이 별도
 *     prop이었지만 같은 flex 컨테이너 안에서 `rightSlot` 바로 뒤에 이어 렌더링되던
 *     자리였을 뿐이라(시각적 변화 없음) 호출부가 직접 이어붙이는 것으로 정리했다
 *     (20260901_1926 — props API 서비스 기준 재정렬).
 *
 * 20260901_1926: props를 서비스 `TopNav.tsx`(`src/components/ui/TopNav.tsx`) 기준으로
 * 재정렬.
 *   - `logoSlot` → `logo`, `style` → `headerStyle`(이름만 정렬, 동작 동일)
 *   - `backHref` 추가: 있으면 `onClick` 대신 `<a href>`로 뒤로가기 버튼을 렌더링한다
 *     (프레임워크에 종속되지 않는 순수 앵커 네비게이션 — Next.js 라우터 종속적인 실제
 *     서비스 래퍼는 여전히 `onBack`(router.push 기반)을 쓴다. 서버 컴포넌트 호출부 때문에
 *     이 경로를 그대로 두는 이유는 서비스 TopNav.tsx 상단 주석 참고)
 *   - `avatarSlot` 제거 (위 설명 참고)
 *   - `titleSize`/`titleWeight`/`titleLineHeight`/`titleTracking` 제거 — 서비스가 항상
 *     동일한 고정값(body 16px)으로 오버라이드하고 있어 그 값을 기본값으로 흡수했다.
 *     원래 h4(24px) 기본값을 쓰던 실사용처가 없었다(실제 화면은 전부 서비스 래퍼를 거침).
 */
export function TopNav({
  title = '',
  showBack = true,
  onBack,
  backHref,
  rightSlot = null,
  logo = null,
  centerSlot = null,
  headerStyle = {},
}) {
  return (
    <header style={{
      position: 'sticky', top: 0,
      background: 'var(--color-bg)',
      paddingTop: 'env(safe-area-inset-top)',
      zIndex: 30,
      ...headerStyle,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px', height: 56,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {logo ? logo : (
            <>
              {showBack && (
                backHref ? (
                  <a
                    href={backHref}
                    aria-label="뒤로"
                    style={{
                      width: 44, height: 44, border: 'none', background: 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-text)', flexShrink: 0,
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={24} height={24} aria-hidden="true">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </a>
                ) : (
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
                )
              )}
              <h1 style={{
                margin: 0,
                fontSize: 'var(--text-body)',
                lineHeight: 'var(--leading-body)',
                fontWeight: 'var(--weight-body)',
                letterSpacing: 'normal',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: 'var(--color-text)',
              }}>
                {title}
              </h1>
            </>
          )}
        </div>
        {centerSlot && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {centerSlot}
          </div>
        )}
        <div style={{ minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
