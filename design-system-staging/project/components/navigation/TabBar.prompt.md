Floating pill bottom nav recreated 1:1 from the JAM! codebase's own `TabBar.tsx` — icon-only (no labels), filled icon + small active-dot when selected, outline icon at reduced opacity otherwise. 6 tabs: 투데이/배지/드랍/미션/인벤토리/프로필.

```jsx
<TabBar active="today" onChange={setTab} />
```
