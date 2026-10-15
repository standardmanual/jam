# LabelChip

카드 좌상단 라벨 필. 티켓 20261001_1204(상위 20260930_1453 b0) 신규.

## 왜 기존 컴포넌트가 아닌가

- `ShapeTag` — minHeight 44px · padding 10/16 · letterSpacing · 태그 팔레트가 붙어 있다.
- `RarityBadge` — 등급(Common~Mystic) 전용.
- `BadgeLevelChip` — `Lv.N` 필 전용.

## 규칙

- 변형은 `tone` 하나뿐이다(`default` | `inverse`, 기본 `default`). `size` 변형 prop을 만들지 않는다.
  `inverse`는 배경 `--background-inverse` + 글자 `--snow`이고 나머지(12px bold 대문자 ·
  padding 6px 10px · `--radius-full` · lineHeight 1)는 `default`와 같다. 티켓 20261001_1737(1248)에서 더했다.
- `default`는 흰 `Card tone="inverse"` 위에서 쓴다. 검정 캔버스 위에서는 `#1a1a1a` 칩 경계가 거의 안 보인다.
  검정 바탕 위(기사 화면)에서는 `tone="inverse"`를 쓴다.
- `self-start`는 호출부 `className`으로 넘긴다. flex-col 카드 안에서 칩이 가로로 늘어나지 않게
  하는 배치이고, 부모 레이아웃에 따라 달라지므로 컴포넌트에 굳히지 않는다.
- `children`이 `null`·`undefined`·`''`이면 null을 반환한다.
- 안쪽 여백 6px 10px는 spacing 토큰(4/8/12…)에 없는 현재 렌더값이다. 토큰에 맞추려면 디자인 변경이다.
- 영문 입력은 대문자로 보인다(`textTransform: uppercase`). 한글은 영향 없다.
- 비인터랙티브 `<span>`이라 44px 터치 영역 규칙에 해당하지 않는다.
