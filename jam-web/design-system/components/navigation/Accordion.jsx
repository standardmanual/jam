import React, { useState } from 'react';

/* DS-021: Accordion — collapsible disclosure items with WAI-ARIA and keyboard nav.
   Pattern: single-open accordion (closing current item re-opens nothing).
   Animation: maxHeight transition avoids `hidden` attribute (which kills transitions).

   20260907 (티켓 20260907_0934): 토글을 평문 셰브런에서 원형 배지 버튼으로 교체.
   tomo.ai/about의 "원형 배경 + 회전 아이콘" 인터랙션 패턴만 차용했다 — tomo의 실제 아이콘
   (도트 패턴 화살표, 브랜드 고유 자산)은 복제하지 않고 JAM 아이콘 세트의 단순 셰브런을
   그대로 원 안에 넣는 식으로 재해석했다. 닫힘 상태는 --color-bg-tint 배경 위 보조 텍스트색
   셰브런, 열림 상태는 --color-primary 배경 위 --color-text-on-primary 셰브런으로 상태를
   구분하고, 180도 회전은 기존 트랜지션(--duration-fast/--ease-smooth-out)을 그대로 썼다.
   이 티켓이 Accordion을 서비스에 처음 도입한다 (`/philosophy` FAQ 섹션 1곳).

   20260907 인터랙션 리뷰 반영: 트랜지션을 인라인 style에서 CSS 클래스로 옮겼다 — 인라인
   style은 항상 스타일시트를 이겨 prefers-reduced-motion 규칙이 먹지 않는다(globals.css
   530~532행 실측 기록과 같은 함정). BadgeFamilyCardHeader.jsx의 STATIC_CSS + <style> 주입
   패턴을 그대로 따랐고, 헤더 버튼에는 :active{opacity:.7}(같은 파일 관례)을 추가해 탭
   다운 즉시 피드백이 오도록 했다(기존엔 릴리즈 후 배지 회전이 시작될 때까지 무반응이었다). */

const STATIC_CSS = `
.ds-accordion-header{transition:opacity var(--duration-quick,150ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-accordion-header:active{opacity:.7}
.ds-accordion-badge{transition:transform var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1)),background-color var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1)),color var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-accordion-panel{transition:grid-template-rows var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
@media (prefers-reduced-motion: reduce){.ds-accordion-header,.ds-accordion-badge,.ds-accordion-panel{transition:none!important}}
`;

const CHEVRON = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14} aria-hidden="true">
    <polyline points="4 6 8 10 12 6" />
  </svg>
);

function ToggleBadge({ isOpen }) {
  return (
    <span
      aria-hidden="true"
      className="ds-accordion-badge"
      style={{
        flexShrink: 0,
        marginLeft: 12,
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-pill)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isOpen ? 'var(--color-primary)' : 'var(--color-bg-tint)',
        color: isOpen ? 'var(--color-text-on-primary)' : 'var(--color-text-secondary)',
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    >
      {CHEVRON}
    </span>
  );
}

function AccordionItem({ item, index, isOpen, onToggle, headerId, panelId }) {
  /* grid-template-rows: 0fr → 1fr avoids layout thrash from maxHeight animation.
     Inner div needs min-height:0 to collapse properly in the 0fr state. */
  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button
        id={headerId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => onToggle(index)}
        className="ds-accordion-header"
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: 'var(--layout-element-gap)',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 'var(--text-body)', color: 'var(--color-text)',
          fontFamily: 'var(--font-family-base)', textAlign: 'left',
          minHeight: 44,
        }}
      >
        <span>{item.title}</span>
        <ToggleBadge isOpen={isOpen} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className="ds-accordion-panel"
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
        }}
      >
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0 var(--layout-element-gap) var(--layout-element-gap)' }}>
            {item.content}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Accordion — single-open collapsible list.
 * items: [{ title: string, content: ReactNode, defaultOpen?: boolean }]
 * Keyboard: Enter/Space to toggle; Tab moves between headers.
 */
export function Accordion({ items = [], style = {}, className = '' }) {
  const [openIndex, setOpenIndex] = useState(
    () => items.findIndex((item) => item.defaultOpen)
  );

  const handleToggle = (index) => {
    setOpenIndex((prev) => (prev === index ? -1 : index));
  };

  const uid = React.useId();

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--color-border)',
        borderBottom: 'none',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        background: 'var(--color-surface)',
        ...style,
      }}
    >
      <style>{STATIC_CSS}</style>
      {items.map((item, i) => (
        <AccordionItem
          key={i}
          item={item}
          index={i}
          isOpen={openIndex === i}
          onToggle={handleToggle}
          headerId={`${uid}-header-${i}`}
          panelId={`${uid}-panel-${i}`}
        />
      ))}
    </div>
  );
}
