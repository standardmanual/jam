import React, { useState } from 'react';

/* DS-021: Accordion — collapsible disclosure items with WAI-ARIA and keyboard nav.
   Pattern: single-open accordion (closing current item re-opens nothing).
   Animation: maxHeight transition avoids `hidden` attribute (which kills transitions). */

const CHEVRON = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden="true">
    <polyline points="4 6 8 10 12 6" />
  </svg>
);

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
        <span style={{
          flexShrink: 0, marginLeft: 12, color: 'var(--color-text-secondary)',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform var(--duration-fast) var(--ease-smooth-out)',
        }}>
          {CHEVRON}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--duration-fast) var(--ease-smooth-out)',
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

  const uid = React.useId ? React.useId() : 'acc';

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
