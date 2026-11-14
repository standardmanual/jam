Floating pill bottom nav recreated 1:1 from the JAM! codebase's own `TabBar.tsx` — icon-only when inactive (outline icon), and the selected tab shows a filled icon plus its name label (투데이/배지/체크인/미션/인벤토리) on a sliding background pill. 5 tabs: 투데이/배지/체크인/미션/인벤토리.

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

20261109_1310: `inverted` prop 추가 — 푸터 위처럼 어두운 면 위일 때 `true`. 캡슐 면을 밝은 면
(`.ds-tabbar-chrome`)과 반전 면(`.ds-tabbar-chrome-inverse`) 두 레이어로 나눠 opacity만 250ms로
교차한다(background·blur는 보간하지 않는다). 반전 때 활성 아이콘 `--snow`, 비활성
`--tabbar-icon-inverse`, 활성 필 `--tabbar-selection-inverse`이고 링·그림자는 없다. 서비스
`src/components/ui/TabBar.tsx`·`transitions.css`(`.jam-tabbar-*`)가 같은 모양이라 함께 고쳐야
한다. 푸터 감지는 디자인 시스템의 일이 아니다 — 호출부가 판정해 값만 넘긴다.

```jsx
<TabBar active="badges" onChange={setTab} inverted={overFooter} />
```

20261114_1418: 활성 탭에만 아이콘 옆에 이름표를 보인다(13px 굵게, `--tabbar-label-size`, 아이콘과 6px 간격).
세 번째 탭 이름은 «드랍»에서 «체크인»으로 바뀌었다(키 `drops`는 그대로). 활성 슬롯이 이름표만큼 넓어지고 비활성
슬롯은 44px 아래로 줄지 않는다. 슬롯 폭과 필은 측정이 아니라 계산한 같은 값으로 같은 길이·이징(300ms)에 미끄러진다.
이름표 색은 아이콘과 같다(밝은 면 `--tabbar-icon-active`, 반전 면 `--snow`). 서비스
`src/components/ui/TabBar.tsx`·`transitions.css`(`.jam-tabbar-slot`·`.jam-tabbar-label`)가 같은 모양이라 함께 고쳐야 한다.
