컬렉션(아이템북) 그리드 셀 패턴. 흰 면(`--surface`) + 1px `--border` 카드 안에 썸네일 + 타이틀 + 진행 바 + 슬롯 카운트를 수직으로 쌓는다(BadgeGridCard와 같은 면, 그림자 없음).

```jsx
// 기본
<CollectionGridCard
  name="서울 지하철 2호선"
  imageUrl="/collections/line2.png"
  collected={7}
  total={20}
  href="/collections/line2"
/>

// 완성 뱃지 표시
<CollectionGridCard
  name="강남 3대 공원"
  imageUrl="/collections/gangnam-park.png"
  collected={3}
  total={3}
  completed={true}
  href="/collections/gangnam-park"
/>

// 이미지 없음 (플레이스홀더)
<CollectionGridCard name="미지의 컬렉션" collected={0} total={10} />
```

그리드 레이아웃은 호출부에서 결정한다 (예: `grid-template-columns: repeat(2, 1fr)`).
썸네일은 투명 배경이라 카드의 흰 면이 그대로 비친다 — 배지 이미지가 투명 PNG인 경우 자연스럽게 보임.
진행 바는 `ProgressBar`(트랙 `--border`, 필 `--accent`, 높이 6px)를 쓴다.
