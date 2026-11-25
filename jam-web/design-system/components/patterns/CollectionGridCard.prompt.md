컬렉션(아이템북) 그리드 셀 패턴. `--card-bg` 면 카드 안에 썸네일 + 타이틀 + 맨 아래 한 행(진행 바 + 슬롯 카운트, 또는 완성 카드의 등급 칩)을 수직으로 쌓는다(BadgeGridCard와 같은 면, 외곽선·그림자 없음).

```jsx
// 기본
<CollectionGridCard
  name="서울 지하철 2호선"
  imageUrl="/collections/line2.png"
  collected={7}
  total={20}
  href="/collections/line2"
/>

// 완성 카드 — 면이 검정(--accent), 바·숫자 없이 맨 아래에 등급 칩(낮은 등급부터, Common 포함)
<CollectionGridCard
  name="강남 3대 공원"
  imageUrl="/collections/gangnam-park.png"
  collected={3}
  total={3}
  completed={true}
  rarities={['common', 'rare']}
  href="/collections/gangnam-park"
/>

// 이미지 없음 (플레이스홀더)
<CollectionGridCard name="미지의 컬렉션" collected={0} total={10} />

// 전체 슬롯 수를 모를 때 — 바·숫자 없이 썸네일과 이름만
<CollectionGridCard name="새 컬렉션" imageUrl="/collections/new.png" collected={0} total={0} hideProgress />
```

그리드 레이아웃은 호출부에서 결정한다 (예: `grid-template-columns: repeat(2, 1fr)`).
썸네일은 투명 배경이라 카드의 흰 면이 그대로 비친다 — 배지 이미지가 투명 PNG인 경우 자연스럽게 보임.
진행 바는 `ProgressBar shape="capsule"`(어두운 트랙 `--capsule-track`, 필 홈 캡슐 게이지와 같은 `--capsule-fill`, 높이 16px)를 쓴다.
완성 카드는 면이 `--accent`(검정)이고 글자는 `--accent-foreground`다. 맨 아래 행에는 «완성» 칩 없이 `rarities`의 등급 칩(`RarityBadge md`, 20px)을 낮은 등급부터 왼쪽 정렬로 놓고 Common도 그린다. 칩이 넘치면 줄을 바꾼다.
맨 아래 행은 완성·미완성 모두 최소 높이 20px이라 두 카드의 높이가 같다. 썸네일 위에는 등급 칩을 얹지 않는다(2026-11-25 사용자 지시).
`hideProgress`는 맨 아래 행을 아예 그리지 않아 카드가 그만큼 낮아진다. `completed`이면 등급 칩 행은 유지된다(서비스 `src/components/ui/CollectionGridCard.tsx`의 `completed || !hideProgress` 조건과 같다).
