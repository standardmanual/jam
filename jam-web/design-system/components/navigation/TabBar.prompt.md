Floating pill bottom nav recreated 1:1 from the JAM! codebase's own `TabBar.tsx` — icon-only (no labels), filled icon + small active-dot when selected, outline icon at reduced opacity otherwise. 5 tabs: 투데이/배지/드랍/미션/인벤토리.

```jsx
<TabBar active="today" onChange={setTab} />
```

20260824_010: 프로필 탭 제거(6탭→5탭) — 프로필 진입은 TopNav 우측 아바타 슬롯으로 일원화됐다.
서비스 `src/components/ui/TabBar.tsx`(병존 구현)도 함께 고쳐야 한다(20260820_009 결정 — 두
파일이 로직상 분리돼 있어 하나만 고치면 Storybook과 실제 서비스가 어긋난다).
