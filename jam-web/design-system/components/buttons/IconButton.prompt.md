44×44 circular icon-only button. `icon` is any Lucide icon name (loaded from the Lucide CDN — see readme ICONOGRAPHY section).

```jsx
<IconButton icon="chevron-left" label="뒤로" onClick={goBack} />
```

`disabled`(soft): 시각적으로만 흐리게 처리하고 `onClick`은 계속 동작한다 — 비활성 상태를 클릭했을 때
팝오버/툴팁으로 이유를 안내하는 패턴에 사용한다. 네이티브 HTML `disabled`처럼 클릭·포커스를
완전히 막지 않는다.

```jsx
<IconButton icon="share" label="공유" disabled onClick={() => setPopoverOpen(true)} />
```
