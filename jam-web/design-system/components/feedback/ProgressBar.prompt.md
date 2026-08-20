진행도 바. `labelType` prop으로 단독 / +퍼센트 / +n분의n 3가지 표기 패턴을 한 컴포넌트로 표현한다.
트랙은 `var(--color-border)`, 필은 `var(--color-primary)`(prop으로 오버라이드 가능 — 순위별
그라데이션 등), radius는 `var(--radius-pill)`가 기본값이다.

```jsx
<ProgressBar current={3} total={10} labelType="fraction" />
<ProgressBar percent={60} labelType="percent" />
<ProgressBar percent={45} labelType="none" />
```
