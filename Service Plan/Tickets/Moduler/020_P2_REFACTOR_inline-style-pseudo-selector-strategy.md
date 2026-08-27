---
id: DS-020
status: CLOSED
severity: P2
type: REFACTOR
category: Architecture
---

# DS-020 — inline style 방식 한계 해결 전략 결정

## Problem
DS v2의 모든 컴포넌트가 React inline style 방식을 사용한다. 이는 다음 기능을 구조적으로 지원하지 못한다:
- `:hover`, `:focus`, `:nth-child()` 등 CSS pseudo-selector
- `@media` 쿼리 (반응형)
- CSS `transition`이 pseudo-state 변화에 반응하지 않음
- CSS `currentColor` 상속이 복잡해짐

DS가 성장할수록 이 구조적 한계가 점점 더 많은 기능을 막게 된다.

## Evidence
```jsx
/* 모든 컴포넌트 — 동일 패턴 */
<button style={{ background: 'var(--color-primary)', ... }}>
/* :hover { opacity: 0.8 } — 불가 */
/* @media (max-width: 375px) { fontSize: 14px } — 불가 */
```
`styles.css`에 전역 `button:hover`, `button:active` 규칙을 추가해서 일부 보완하고 있지만, 컴포넌트별 세밀한 pseudo-state 제어가 불가능하다.

## Reference
기존 DS는 Tailwind를 사용해 pseudo-selector 문제가 없음. v2에서 Tailwind를 제거한 이유는 번들 크기 감소와 DS 독립성 확보였으나, 대안 전략이 없었다.

## Recommendation
장기 아키텍처 방향을 결정해야 한다. 세 가지 옵션:

**Option A — CSS Modules 도입**
각 컴포넌트에 `.module.css` 파일을 추가. Next.js 기본 지원.
```
Button.jsx + Button.module.css
```
장점: pseudo-selector, media query 완전 지원. Next.js와 궁합 최고.
단점: 컴포넌트 파일 수 2배 증가. 기존 inline style 방식과 혼재 기간 발생.

**Option B — styles.css 유틸리티 클래스 레이어 확장**
DS 전용 유틸리티 클래스를 `styles.css`에 추가하고 컴포넌트에서 `className` 조합.
```css
/* styles.css */
.ds-btn-primary:hover { opacity: 0.85; }
```
장점: 추가 파일 없음. 단점: Tailwind의 축소판이 되어 유지보수 복잡도 상승.

**Option C — 현상 유지 + styles.css 전역 보완 (단기)**
DS-006(hover 전략)으로 전역 button:hover만 추가하고, 나머지는 수용.
모바일 터치 기기 우선이므로 hover 부재가 데스크탑에서만 문제.

단기: Option C. 중기: Option A로 마이그레이션. 아키텍처 결정이 필요한 티켓이므로 팀 논의 후 진행.

## Impact
- Option A 선택 시: 전 컴포넌트 리팩토링 필요 — 대규모 작업
- Option B 선택 시: `styles.css` 규모 증가, Tailwind 의존성 없지만 유사 문제 재발
- Option C: 현상 유지, 기술 부채 누적

## Risk
- Option A로 마이그레이션 중 기존 inline style과 CSS Module 충돌 가능
- 이 결정을 미루면 DS-006, DS-007 등 개별 수정이 점점 더 많아지고 일관성이 깨짐

## Acceptance Criteria
- [ ] 팀 논의를 통해 세 가지 옵션 중 하나 선택 및 문서화
- [ ] 선택한 방향으로 Button, Card 2개 컴포넌트 파일럿 마이그레이션
- [ ] 파일럿 결과 기반으로 전체 마이그레이션 티켓 분리 생성

## 완료 기록

- **구현 내용**: 코드 변경 없음 — 아키텍처 결정 문서화.
- **채택 결정**: Option C (단기) + Option A 중기 로드맵.
  - 단기: DS-006에서 `styles.css` 전역 `button:hover` + `@media (hover: hover)` 가드로 보완 완료.
  - 중기: CSS Modules(`*.module.css`) 도입 — Next.js 기본 지원, pseudo-selector/media query 완전 지원. 마이그레이션 범위가 크므로 별도 대규모 티켓으로 분리 예정.
  - Option B(유틸리티 클래스 레이어) 미채택: Tailwind 축소판화 우려, 유지보수 복잡도 상승.
- **배포**: 2026-08-14
