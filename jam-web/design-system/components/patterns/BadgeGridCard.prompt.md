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
```

`children`에 만료일 문구나 "슬롯에 넣기" 버튼을 추가할 수 있다.
그리드 레이아웃은 호출부에서 결정한다 (예: `grid-template-columns: repeat(3, 1fr)`).
