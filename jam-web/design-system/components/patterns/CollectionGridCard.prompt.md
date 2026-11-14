컬렉션(아이템북) 그리드 셀 패턴. `--card-bg` 면 카드 안에 썸네일 + 타이틀 + 맨 아래 한 행(진행 바 + 슬롯 카운트, 또는 완성 칩)을 수직으로 쌓는다(BadgeGridCard와 같은 면, 외곽선·그림자 없음).

```jsx
// 기본
<CollectionGridCard
  name="서울 지하철 2호선"
  imageUrl="/collections/line2.png"
  collected={7}
  total={20}
  href="/collections/line2"
/>

// 완성 카드 — 면이 강조색 그린(--jam-green), 바·숫자 없이 맨 아래에 «완성» 칩
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
진행 바는 `ProgressBar shape="capsule"`(어두운 트랙 `--capsule-track`, 필 강조색 그린 `--jam-green`, 높이 16px)를 쓴다.
완성 카드는 면만 `--jam-green`이고 글자는 `--foreground`다. «완성» 칩은 accent 검정 면(`ListRowChip` 규격, 20px)이며 가운데 정렬하거나 키우지 않는다.
맨 아래 행은 완성·미완성 모두 최소 높이 20px이라 두 카드의 높이가 같다. 등급 칩은 좌상단 그대로다.
