import React from 'react';

/**
 * BadgeStatusSection — 배지 트리의 상태 섹션 하나. 티켓 20260905_0036.
 *
 * 배지 트리는 **「다음 목표」와 「받은 배지」 둘뿐**이다. 설계상의 분류(누적형·주기형·
 * 기록형 …)는 화면에 노출하지 않는다 — 그건 발급 엔진의 사정이지 사용자의 질문이 아니다.
 * 사용자가 트리에서 묻는 건 "지금 뭘 하면 되나"와 "내가 뭘 받았나" 두 가지다.
 *
 * 접힘 상태에서도 **개수를 노출**한다. 접힌 헤더가 제목만 있으면 그 안에 뭐가 몇 개
 * 들어 있는지 알 수 없어 열어볼 이유가 생기지 않는다.
 *
 * 펼쳤을 때만 본문을 렌더한다 — 진행 계산(서버)이 붙는 쪽이라 접힌 섹션까지 계산하면
 * 계열 수(194)만큼 헛일을 한다. 호출부는 `onOpenChange`가 true로 올 때 그 섹션의 데이터를
 * 요청하면 된다.
 *
 * 왜 `Accordion`을 쓰지 않았나: DS `Accordion`은 **「한 번에 하나만 열림」** API다
 * (`Accordion.d.ts`). 여기서는 두 섹션이 **각각 독립으로** 접히고 펼쳐져야 한다
 * (둘 다 열어 두거나 둘 다 접어 둘 수 있다).
 *
 * 제어/비제어: `open`을 넘기면 제어 컴포넌트, 안 넘기면 `defaultOpen`으로 스스로 관리한다.
 */
function ChevronDownGlyph({ size = 20 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
    </svg>
  );
}

const STATIC_CSS = `
.ds-status-section-header{background:none;border:none;padding:var(--spacing-12) 0;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;display:flex;align-items:center;gap:var(--spacing-8);transition:opacity var(--duration-quick,150ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-status-section-header:active{opacity:.7}
.ds-status-section-chevron{transition:transform var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
@media (prefers-reduced-motion: reduce){.ds-status-section-header,.ds-status-section-chevron{transition:none!important}}
`;

export function BadgeStatusSection({
  /** 섹션 제목 — "다음 목표" 또는 "받은 배지" 둘 중 하나만 쓴다 */
  title,
  /** 접힘 상태에서도 보이는 개수. null이면 개수를 감춘다 */
  count,
  /** 제어 모드일 때의 펼침 상태. 넘기지 않으면 비제어(defaultOpen) */
  open,
  defaultOpen = false,
  /** (nextOpen) => void — 펼쳐질 때 그 섹션의 진행 계산을 요청하는 신호로 쓴다 */
  onOpenChange,
  /** 펼쳤는데 내용이 없을 때 보여줄 한 줄 */
  emptyText = null,
  children,
  className = '',
  style = {},
}) {
  const reactId = React.useId();
  const bodyId = `ds-status-section-body-${reactId}`;
  const headerId = `ds-status-section-header-${reactId}`;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = open != null;
  const isOpen = isControlled ? open : uncontrolledOpen;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section className={className} style={style}>
      <style>{STATIC_CSS}</style>
      <button
        type="button"
        id={headerId}
        className="ds-status-section-header"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
      >
        <span style={{ fontSize: 'var(--text-small)', fontWeight: 700, color: 'var(--color-text)' }}>
          {title}
        </span>
        {count != null && (
          <span
            style={{
              fontSize: 'var(--text-caption)', fontWeight: 600, lineHeight: 1,
              color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums',
            }}
          >
            {count}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span
          className="ds-status-section-chevron"
          style={{ display: 'flex', color: 'var(--color-text-secondary)', transform: isOpen ? 'rotate(180deg)' : 'none' }}
        >
          <ChevronDownGlyph size={20} />
        </span>
      </button>

      {/* 접힌 동안에는 아예 렌더하지 않는다 — 본문에 붙은 진행 계산 요청까지 함께 멈춘다.
          (display:none으로 숨기면 이펙트가 그대로 돌아 "펼친 섹션만 계산"이 성립하지 않는다) */}
      <div id={bodyId} role="region" aria-labelledby={headerId} hidden={!isOpen}>
        {isOpen &&
          (children ?? (
            emptyText && (
              <p style={{ margin: 0, padding: 'var(--spacing-12) 0', fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)' }}>
                {emptyText}
              </p>
            )
          ))}
      </div>
    </section>
  );
}
