import React, { Children } from 'react';
import { ChevronDownGlyph } from '../icons/BadgeStatusGlyphs.jsx';

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
 *
 * ## `collapsible={false}` — 접지 않는 섹션 (티켓 20260906_2140 F-1)
 *
 * 배지 트리의 「다음 목표」는 **그 화면의 본문 전체**다. 접을 수 있게 두면 사용자가 화면을
 * 통째로 닫을 수 있는 토글이 제목 자리에 놓이는 셈인데, 정작 열어 둘 이유는 100%다
 * (`defaultOpen`으로 항상 열려 있었다). 그래서 이 화면은 chevron·토글 없이 제목 + 개수만
 * 보여준다 — 컴포넌트를 지우지 않고 호출부가 `collapsible={false}`를 고른다.
 *
 * ⚠️ 「펼친 섹션만 계산」 최적화는 이 모드에서 성립하지 않는다. **회귀가 아니다** —
 * 유일한 호출부가 이미 `defaultOpen`이라 접힌 적이 없고, 늘 전부 계산하고 있었다.
 */
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
  /**
   * false면 **접지 않는다** — 버튼·chevron 없이 제목 + 개수만 그리고 본문은 항상 보인다.
   * 기본값 true라 기존 호출부는 그대로다.
   */
  collapsible = true,
  /**
   * 제목 오른쪽 끝에 붙는 보조 표기 — 「진행률 높은 순」처럼 **목록의 규칙**을 말한다.
   * 정렬 기준이 화면 어디에도 없으면 사용자는 순서를 임의로 읽는다. null이면 안 그린다.
   */
  note = /** @type {string | null} */ (null),
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

  // ⚠️ `children ?? emptyText`로 쓰면 안 된다. 호출부가 `{list.map(...)}`로 넘길 때
  // 빈 배열 `[]`은 nullish가 아니라서 emptyText가 영원히 안 뜨고 빈 영역만 남는다.
  // 0037이 「다음 목표」를 map으로 그릴 자리라 실제로 밟게 되는 경로다(개선 리뷰 지적).
  const hasChildren = Children.count(children) > 0
  const headerId = `ds-status-section-header-${reactId}`;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = open != null;
  const isOpen = isControlled ? open : uncontrolledOpen;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const titleContent = (
    <>
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
      {/* 스페이서는 항상 둔다 — note가 있든 없든 chevron·note가 오른쪽 끝에 붙는다 */}
      <span style={{ flex: 1 }} />
      {note && (
        <span style={{ fontSize: 'var(--text-caption)', lineHeight: 1, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          {note}
        </span>
      )}
    </>
  );

  const body = hasChildren ? (
    children
  ) : (
    emptyText && (
      <p style={{ margin: 0, padding: 'var(--spacing-12) 0', fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)' }}>
        {emptyText}
      </p>
    )
  );

  // 접지 않는 모드 — 제목은 버튼이 아니라 정적 헤딩이다. 누를 수 없는 것을 버튼으로
  // 그리면 보조기술이 "버튼"이라고 읽어 존재하지 않는 행동을 약속하게 된다.
  if (!collapsible) {
    return (
      <section className={className} style={style}>
        <h2
          style={{
            margin: 0, padding: 'var(--spacing-12) 0', display: 'flex', alignItems: 'center',
            gap: 'var(--spacing-8)', font: 'inherit',
          }}
        >
          {titleContent}
        </h2>
        <div>{body}</div>
      </section>
    );
  }

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
        {titleContent}
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
        {isOpen && body}
      </div>
    </section>
  );
}
