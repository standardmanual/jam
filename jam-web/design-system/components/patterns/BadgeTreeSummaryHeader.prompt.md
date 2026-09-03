배지 트리(/badges/tree) 상단의 진행 요약 카드. 획득/전체 히어로 숫자 하나 + 등급별
분포 막대 4칸을 보여준다(20260903_2329).

```jsx
<BadgeTreeSummaryHeader
  earnedCount={14}
  totalCount={64}
  byRarity={{
    common: { earned: 8, total: 19 },
    rare: { earned: 4, total: 16 },
    epic: { earned: 2, total: 17 },
    mystic: { earned: 0, total: 12 },
  }}
/>
```

- `totalCount`는 현재 탭(종목)의 전체 배지 수 — 계열 레일 안 배지 + 독립(트로피) 배지를
  합친 값이다. 호출부(현재 활성 탭 데이터)가 계산해서 넘긴다.
- 분포 막대는 등급색(`--color-rarity-*`)이 아니라 상태 채널(`--status-done-solid`, 다
  채운 것)로 채운다. 등급은 등급칩 안에서만 색을 쓰고, 이 막대는 "그 등급 중 몇 개를
  채웠나"를 말하지 등급 자체를 말하지 않는다.
- 진행 수치(%, 잔여값 등)는 표시하지 않는다 — 등급별 분모 자체가 이미 등급 체계를
  드러내는 정보라 그것으로 충분하다.
