진행도 바. `labelType` prop으로 단독 / +퍼센트 / +n분의n 3가지 표기 패턴을 한 컴포넌트로 표현한다.
트랙은 `var(--border)`, 필은 `var(--accent)`(prop으로 오버라이드 가능 — 순위별
그라데이션 등), radius는 `var(--radius-full)`가 기본값이다(`radius` prop으로 오버라이드 가능 —
MissionStatusClient의 3px 임의값 등).

```jsx
<ProgressBar current={3} total={10} labelType="fraction" />
<ProgressBar percent={60} labelType="percent" />
<ProgressBar percent={45} labelType="none" />
```

## v5 추가 — 트랙 기준 그라데이션 (티켓 20260905_0036)

- `fillMode` — `'solid'`(기본, 예전과 완전히 동일) / `'track-gradient'`.
- `gradient` — `track-gradient`일 때 트랙 **전체**에 까는 그라데이션.
  fill은 `clip-path: inset(0 calc(100% - var(--ds-progress-fill)) 0 0)`으로 잘라 낸다.

**왜 fill에 그라데이션을 넣지 않는가.** `background: linear-gradient(...)`를 fill 엘리먼트에
주면 그라데이션이 fill 폭 안에서 압축돼 **진행률과 무관하게 늘 같은 그림**이 된다.
10%든 90%든 같은 색 분포가 보인다. 트랙 기준으로 깔고 잘라야 진행에 따라 색이 실제로 이동한다.

⚠️ **기본 동작을 바꾸지 마라.** 서비스 8곳이 이 컴포넌트를 쓴다(`DualAxisGauge`는 티켓 20261018_1817에서 삭제).
새 표현은 `fillMode`로만 켠다.

## 추가 — 외곽선 (티켓 20261018_0054)

- `outlined` — 기본 `false`(예전과 완전히 동일). `true`이면 트랙에 1px `--border` 외곽선을 둔다.
  `box-sizing: border-box`라 `height`가 외곽선을 포함한다(`height={10}`이면 채움이 그려지는 안쪽은 8px).
  채움은 외곽선 안쪽에만 그려진다.
- 기본 `trackColor`가 `--border`와 같은 색이라 외곽선만 켜서는 보이지 않는다. 트랙 면을 따로 정한다.
  서비스(캡슐·잠긴 아이템 배지)의 호출: `<ProgressBar outlined percent={n} fillMode="track-gradient" trackColor="var(--background)" height={10} labelType="none" />`.
- 숫자가 필요한 자리에는 쓰지 않는다(`labelType="none"`로 둔다). 캡슐은 진행 수치를 화면에 내지 않는다.

## 추가 — span 렌더 (티켓 20261107_2156)

- `as` — `'div'`(기본, 예전과 완전히 동일) / `'span'`. `ProgressBar` 한정 prop이다(다른 컴포넌트로 확산하지 않는다).
- **언제 켜는가.** 바가 `<a>`·`<button>`·`Link` 같은 클릭 영역 안에 놓일 때만 켠다. 이 안에는 `<div>`를 둘 수 없다(phrasing 요건).
  예: 순위 행 `Link` 안에 이름 한 줄과 6px 바가 세로로 쌓이는 경우 — `<ProgressBar as="span" percent={n} labelType="none" height={6} radius="3px" />`.
- 바깥·트랙·채움(라벨이 있으면 래퍼 포함)이 모두 span이 되고, span 경로에서만 바깥·트랙에 `display:block`이 붙는다.
  채움은 절대 배치라 따로 붙지 않는다. 모양을 내는 값은 div와 같다.
- 이 prop은 `role`·`aria-*`를 더하지 않는다. 태그만 바꾼다. 진행 바의 접근성 속성은 읽기가 바뀌는 판단이라 호출부 또는 별도 티켓에서 정한다.
