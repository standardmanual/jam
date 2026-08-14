---
id: DS-021
status: OPEN
severity: P2
type: ADD
category: Component / UX / Accessibility
---

# DS-021 — Accordion 컴포넌트 추가

## Problem
설정 화면, FAQ, 배지 설명 확장 등에서 반복적으로 필요한 Accordion(접기/펼치기) 컴포넌트가 없다. 모바일 앱에서 정보의 계층적 노출에 필수적인 패턴이다.

## Evidence
```
components/
  navigation/TabBar.jsx, TopNav.jsx, BottomSheet.jsx(DS-005 예정), SlidingTabs.jsx(DS-005 예정)
  /* Accordion.jsx — 없음 */
```

## Reference
기존 DS에 없음. 서비스 코드에서 `useState`로 직접 토글 구현 중.

## Recommendation
```jsx
/* Accordion.jsx */
export function Accordion({ items }) {
  /* items: [{ title: string, content: ReactNode, defaultOpen?: boolean }] */
  const [openIndex, setOpenIndex] = useState(
    items.findIndex(i => i.defaultOpen) ?? -1
  );

  return (
    <div>
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        const headerId = `acc-header-${i}`;
        const panelId = `acc-panel-${i}`;
        return (
          <div key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <button
              id={headerId}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenIndex(isOpen ? -1 : i)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: 'var(--layout-element-gap)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-body)', color: 'var(--color-text)',
                fontFamily: 'var(--font-family-base)',
              }}
            >
              {item.title}
              {/* chevron 아이콘 rotate */}
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              hidden={!isOpen}
              style={{
                padding: isOpen ? 'var(--layout-element-gap)' : 0,
                overflow: 'hidden',
                transition: 'padding var(--duration-fast) var(--ease-smooth-out)',
              }}
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

## Impact
- 신규 파일 추가 — 기존 컴포넌트 영향 없음
- chevron 아이콘에 IconButton의 ICON_PATHS 재활용 가능

## Risk
- `hidden` attribute 사용 시 애니메이션이 작동하지 않음 — `maxHeight` 트릭 또는 `display: none`을 JS로 토글하는 방식 필요
- 다중 동시 열기(accordion vs. disclosure) 패턴 결정 필요

## Acceptance Criteria
- [ ] 항목 클릭 시 열기/닫기 토글
- [ ] `aria-expanded`, `aria-controls`, `role="region"` 올바르게 적용
- [ ] 열기/닫기 애니메이션 `--ease-smooth-out` 사용
- [ ] 키보드: Enter/Space로 토글, Tab으로 다음 항목 이동
- [ ] `.d.ts` 파일 동반
