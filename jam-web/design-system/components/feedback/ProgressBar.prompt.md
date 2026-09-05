진행도 바. `labelType` prop으로 단독 / +퍼센트 / +n분의n 3가지 표기 패턴을 한 컴포넌트로 표현한다.
트랙은 `var(--color-border)`, 필은 `var(--color-primary)`(prop으로 오버라이드 가능 — 순위별
그라데이션 등), radius는 `var(--radius-pill)`가 기본값이다(`radius` prop으로 오버라이드 가능 —
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

⚠️ **기본 동작을 바꾸지 마라.** 서비스 8곳과 `DualAxisGauge`가 이 컴포넌트를 쓴다.
새 표현은 `fillMode`로만 켠다.
