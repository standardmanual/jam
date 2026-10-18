# LockedTile

잠긴 아이템 배지의 «잠금 타일». 티켓 20261018_0054 2회 신규.

열기 전의 아이템 배지는 이름·그림을 가린다(운영 로직 7.3절). 그림 자리에 이 타일을 넣는다.

```jsx
<LockedTile size={90} />
```

## 쓰이는 곳

- `BadgeRevealCarousel` — 고르기·결과 카드의 `locked` 항목(그림 자리, `size`는 이미지 영역의 0.8배).
- `BadgeGridCard` — `locked`일 때 썸네일 자리(`size` 90).
- 서비스 `LockedItemDetail` — 상세 상단의 큰 정사각.

## 규칙

- props는 `size`(한 변 px, 기본 90) 하나뿐이다(`className`·`style`은 배치용). 변형 prop을 만들지 않는다.
- 면 `--background`(크림), 1px `--border`, `--radius-2xl`, 자물쇠 `--muted`. **등급 색·그라데이션·글로우를 더하지 않는다** — 등급은 `RarityBadge` 칩 하나로만 전달한다.
- 자물쇠 크기는 `size`의 0.45배다.
- 장식이라 `aria-hidden`이다. 잠겼다는 사실은 호출부가 «잠김» 문구(`LabelChip`)나 가린 이름 줄로 글자로 전달한다.
- `maxWidth: 100%` + `aspectRatio: 1`이라 부모가 `size`보다 좁으면 정사각형을 유지한 채 줄어든다.
- `BadgeRevealCarousel`의 인라인 잠금 타일을 이 컴포넌트로 교체했다. 타일 한 변은 그대로(`이미지 영역 × 0.8`)이고, 자물쇠 크기는 이전에 «이미지 영역 × 0.8 × 0.45»를 한 번에 반올림하던 것을 «타일 한 변을 반올림한 값 × 0.45»로 계산해 극히 드물게 1px 차이가 날 수 있다.
