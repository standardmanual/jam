배지 그리드 셀 패턴. 배지 썸네일 + 이름 + 희귀도 필을 하나의 카드로 묶는다.

```jsx
// 기본 (획득 완료)
<BadgeGridCard name="도봉산 정상" rarity="rare" imageUrl="/badges/dobong.png" href="/badges/123" />

// 미획득 (흑백+반투명)
<BadgeGridCard name="한강 완주" rarity="epic" earned={false} />

// 미발견 (아이템북 — ??? 표시)
<BadgeGridCard name="???" rarity="common" undiscovered={true} />

// 선택 모드
<BadgeGridCard name="북한산" rarity="mystic" selected={true} onClick={() => setSelected(id)} />

// 컬렉션 슬롯 장착 모드 — "지금 넣을 수 있는 칸" 강조
<BadgeGridCard name="장착 가능 칸" rarity="epic" highlighted={true} href="/collections/1?slot=1" />
```

`children`에 만료일 문구나 "슬롯에 넣기" 버튼을 추가할 수 있다.
그리드 레이아웃은 호출부에서 결정한다 (예: `grid-template-columns: repeat(3, 1fr)`).

- `highlighted`는 컬렉션 슬롯 장착 모드(`/collections/[id]?slot=1`)에서 "지금 넣을 수 있는
  칸"을 짚어주는 강조 링이다. `selected`(배경톤 채움)와는 시각적으로 다르며 둘은 독립적으로
  쓸 수 있다.
- `onNavigate`는 `href` 모드에서만 의미가 있다 — `<a href>`로 이동하기 직전에 실행할 부수효과
  클릭 핸들러다(`onClick`은 Button 모드 전용이라 href와 상호 배타).
