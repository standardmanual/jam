2축형(dual) 배지 전용 진행 게이지. `BadgeStageRail`(4등급 레일)을 대체하지 않고, 프런티어가
2축형일 때만 그 아래에 추가로 렌더한다(20260904_1058).

```jsx
<DualAxisGauge
  imageUrl="..."
  alt="산악 라이더 Rare"
  rarity="rare"
  axes={[
    { key: 'min_speed_kmh', label: '속도', rangeText: '21.4/20.0km/h', fraction: 1, met: true },
    { key: 'elevation_gain_m', label: '고도', rangeText: '1180/1500m', fraction: 1180 / 1500, met: false },
  ]}
  ruleText="두 조건은 각각 다른 활동에서 채워도 돼요."
  bottleneckNote="속도 조건은 이미 채웠어요."
/>
```

- `axes`는 항상 2개 — `src/lib/badgeProgressText.ts`의 `formatDualAxisGaugeProps(progress)`가
  `computeBadgeProgress()` 결과(`BadgeProgress`, kind==='dual')로 조립해 그대로 넘긴다. 이
  컴포넌트는 kind를 모른다.
- `axes[].fraction`(0~1)은 `ProgressBar`의 `percent`로 그대로 쓴다 — "작을수록 좋음"(페이스)·
  한파(최고기온) 축은 current/target 단순 비율로 재계산하면 틀리므로, 계산 계층
  (`badge-engine/badgeProgress.ts`)이 이미 계산해둔 값을 반드시 그대로 전달해야 한다.
- `ruleText`는 `sameActivity`로 결정된다 — "두 조건은 각각 다른 활동에서 채워도 돼요."
  (false) / "한 번의 활동에서 두 조건을 동시에 채워야 해요."(true).
- `bottleneckNote`는 두 축 중 **정확히 하나만** `met:true`일 때만 값이 있다("{그 축 라벨}
  조건은 이미 채웠어요."). 0개(둘 다 미충족)·2개(둘 다 충족, 게이트만 대기) met이면 `null`
  — 렌더하지 않는다.
- 배지 이미지는 이 컴포넌트가 등장하는 시점(프런티어 = 아직 미획득)엔 항상 미획득 상태라
  예외 없이 grayscale(1) 처리한다(`earned` prop 없음, `BadgeStageRail`과 동일 규칙).
- 인터랙티브 요소가 없는 정적 텍스트 블록이라 별도 `aria-label` 요약을 얹지 않는다 — 화면에
  보이는 텍스트 노드만으로 스크린리더가 의미를 그대로 전달받는다.
