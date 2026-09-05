Floating pill bottom nav recreated 1:1 from the JAM! codebase's own `TabBar.tsx` — icon-only (no labels), filled icon on a sliding background pill when selected, outline icon otherwise. 5 tabs: 투데이/배지/드랍/미션/인벤토리.

```jsx
<TabBar active="today" onChange={setTab} />
```

20260824_010: 프로필 탭 제거(6탭→5탭) — 프로필 진입은 TopNav 우측 아바타 슬롯으로 일원화됐다.
서비스 `src/components/ui/TabBar.tsx`(병존 구현)도 함께 고쳐야 한다(20260820_009 결정 — 두
파일이 로직상 분리돼 있어 하나만 고치면 Storybook과 실제 서비스가 어긋난다).

20260901_1521: 활성탭 점 제거, 배경 필에 슬라이딩 모션 추가 — 단일 pill이 활성 탭의
offsetLeft/offsetWidth를 측정해 translateX로 이동한다(서비스 SlidingTabs.tsx의 JS
포지셔닝 패턴만 차용, 컴포넌트 자체는 재사용하지 않음).

20260901_1926: `username` prop 추가 — 서비스는 이 값으로 pathname/searchParams(`?u=`)를
조합해 "다른 유저 프로필 맥락"인지 판정하고 활성 탭을 계산한다. 이 컴포넌트는 Next.js
라우터가 없어 그 판정을 재현하지 않고, `data-username` 속성으로만 값을 반영해 전달됐음을
확인할 수 있게 한다.

```jsx
<TabBar active="badges" onChange={setTab} username="jam_user" />
```
