큰 이미지 위에 제목을 얹는 세로 목록 카드. 미션 목록처럼 «그림이 먼저 보이는» 목록에 쓴다. 도메인을 모르고 자유 `children`은 없다.

구조는 `[이미지 칸 + 왼쪽 아래 제목] → [칩 줄 + 오른쪽 값] → [설명] → [footer]`다. 카드 전체가 하나의 `<a>`(`href`) 또는 `<button>`(`onClick`)이고 그 안은 전부 `<span>`이다.

## 슬롯
| prop | 쓰임 |
|---|---|
| `imageUrl` · `imageAlt` · `imagePosition` | 이미지 칸. `alt`는 기본 `""`(제목 글자가 카드 안에 있다), 위치는 기본 가운데 |
| `imageDim` · `grayscale` | 이미지에만 거는 딤·흑백(글자는 받지 않는다). 잠김·시작 전 모사 |
| `imageOverlay` | 이미지 칸 가운데 노드(잠금 아이콘 자리) |
| `title` | 이미지 위 왼쪽 아래 20px 굵게, 최대 2줄 |
| `chips` | 칩 줄 왼쪽. `ListRowChip`을 3개 이하로 |
| `value` | 칩 줄 오른쪽 끝. 보통 `PointText`. 줄지 않고 위쪽 정렬 |
| `description` | 14px `--muted`, 최대 2줄 |
| `footer` | 설명 아래 줄(조건·보상 줄 등). phrasing 요소만 |

```jsx
<ListCard
  href="/missions/m1"
  imageUrl={mission.imageUrl}
  title="주말 러닝"
  chips={<><ListRowChip tone="red">참가중</ListRowChip><ListRowChip>3일 4시간 남음</ListRowChip></>}
  value={<PointText value={20} />}
  description="10km를 달려요"
  footer={<RarityBadge rarity="rare" size="row" />}
/>

// 눌러서 안내하는 카드 — disabled가 아니라 aria-disabled
<ListCard onClick={showToast} aria-disabled="true" imageUrl={url} imageDim={0.4} grayscale imageOverlay={<LockIcon />} title="잠긴 미션" />
```

## 글자
- 제목 20px(`--text-xl`) 700, 설명 14px(`--text-sm`) `--muted`, 값 14px 700, 칩·footer는 12px. 크기는 `--text-*`만 쓴다.
- 제목은 이미지 위에서 `--snow` 하나다. 불투명도로 만든 흰색·`text-shadow`·`backdrop-filter`·글로우를 쓰지 않는다.
- 이미지가 없거나(자리표시 면) `imageDim`이 1 미만이거나 `grayscale`이면 흰 글자가 묻히므로 제목이 `--foreground`로 바뀐다.

## 면과 모양
- 카드 `--card-bg` + `--radius-2xl` + 안쪽 `--spacing-12`. 이미지 칸 `--radius-xl`, 폭 100%, 비율 16:9, `object-fit: cover`, 자리표시 `--background-secondary`.
- 카드 사이 간격은 호출부가 `--gap-card-detail`(12)로 둔다.
- 이미지가 깨지면 «이미지 없음»(자리표시 면 위 제목)으로 내려간다.

## 동작
- 눌림은 `--scale-press-card`(0.98) 하나, hover 없음, 포커스는 바깥 2px `--link` 아웃라인. `prefers-reduced-motion`이면 눌림 축소를 끈다.
- `disabled`는 `--opacity-disabled` + 클릭 차단이다. 눌렀을 때 안내를 주는 카드는 `disabled` 없이 `onClick` + `aria-disabled="true"`를 쓴다.

## 하지 않는 것
- 이미지 위에 어두운 막(그라데이션)을 덮지 않는다. 카드 안에 카드·회색 띠·그림자·외곽선을 만들지 않는다.
- 제목을 가운데 정렬하지 않는다(왼쪽 아래).
- 칩을 3개 넘기지 않는다. «n일 남음»은 마감이 있을 때만 쓴다(가짜 긴급감 금지).
- 한 카드에서 색으로 강조하는 곳은 칩의 `red`·값의 포인트색 정도로 절제한다.
- 이미지 안에 박힌 글자는 컴포넌트가 가리거나 읽지 않는다. 새 이미지는 글자 없는 배경으로 만든다.
- 이미지 높이를 140처럼 고정하지 않는다. 비율(16:9)이 카드 폭을 따라간다.

새 색·새 토큰은 없다. 쓰는 토큰: `--card-bg` `--background-secondary` `--snow` `--foreground` `--muted` `--link` `--radius-2xl` `--radius-xl` `--spacing-4/8/12` `--text-xl/sm` `--scale-press-card` `--opacity-disabled`.
