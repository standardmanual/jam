눈금이 1개뿐인 계열 전용 그리드 셀. 진행을 선형 막대·연결선이 아니라 **배지 이미지 보더를
따라 도는 링**으로 보여준다(20260906_1425). 눈금 2개 이상인 계열은 연결선이 의미를 갖는
`BadgeStageRail`을 그대로 쓴다 — 이 카드로 바꾸지 않는다.

```jsx
<BadgeProgressRingCard
  name="100km 클럽"
  imageUrl="..."
  rarity="rare"
  status="not-reached"          // earned/ready/locked/not-reached — BadgeStageRail과 같은 어휘
  fraction={0.42}
  captionText="42.0/100.0km"    // 완성 문자열만 받는다(문구 조립은 src/lib/badgeProgressText.ts)
  ariaLabel="100km 클럽 Rare, 미도달. 42.0/100.0km"
  href="/badges/b1"             // 또는 onClick(잠금 해제 조건 시트 오픈)
/>
```

- `status`가 `ready`/`locked`면 우상단에 자물쇠 마커, `earned`면 체크 마커가 **링 바깥**에
  뜬다(같은 원 둘레에 얹으면 진행 아크와 부딪힌다). `not-reached`는 마커가 없다.
- **링은 상태색 하나로만 채운다** — 앰버(`--status-short-solid`, 채우는 중) /
  라임(`--status-done-solid`, `earned`이거나 `fraction>=1`). **등급색을 링에 올리지 않는다** —
  등급은 이름 아래 `RarityBadge` 칩(`common`은 칩을 그리지 않는 기존 관례 그대로)에 남는다.
- `muted:true`(§08 H, 진행 미지원)면 링이 앰버/라임 대신 중립색(`--color-text-secondary`)
  전체 트랙으로 그려진다 — `fraction`을 쓰지 않는다.
- **캡션은 항상 남는다.** 원형 진행은 작은 값(2%)과 0%가 눈으로 구분되지 않아 링은
  "대략 어디쯤"의 앰비언트 신호일 뿐이고, 정확한 값은 `captionText` 한 줄이 말한다.
  `ariaLabel`에도 값이 그대로 들어가야 한다(형태만으로는 값이 전달되지 않는다) — 이 컴포넌트는
  값을 만들지 않으므로 호출부가 완성 문장으로 조립해서 넘긴다.
- `pending:true`는 「진행 표시 준비 중」같은 **임시 상태 표기**만 기울인다. 조건값
  (「4km」)은 중립색이어도 사실 표기라 기울이지 않는다(`BadgeStageRail`과 같은 규칙).
- 카드가 처음 나타날 때 페이드+스케일로 들어온다(`transform`/`opacity`만) —
  `prefers-reduced-motion: reduce`에서는 이 진입 효과 자체가 꺼진다. 채우기 %(링 각도)에는
  전이를 걸지 않는다 — 도착 즉시 값을 그리는 스냅샷이라 애니메이션 대상이 아니다.
- **프레젠테이션 전용** — `condition`·`kind`를 모른다. 완성 문자열과 0~1 숫자만 받는다.
- 인터랙션은 `href`(링크 이동) 또는 `onClick`(잠금 해제 조건 시트 등) 중 하나만 넘긴다.
  둘 다 없으면 정적 `<div>`.
