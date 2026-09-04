---
id: 20260904_1513
category: Service
status: CLOSED
created: 2026-09-04
closed: 2026-09-04
---

# [Service] BadgeRevealCarousel 라이브 리전에서 Common 등급 라벨 누락 수정

## 배경 / 문제 정의

`design-system/components/patterns/BadgeRevealCarousel.stories.tsx`의 `CenterCardAnnouncement`
(name: '접근성 — 중앙 카드 텍스트 라이브 리전') 스토리 play 함수가 `npm test`(vitest storybook
프로젝트)에서 실패한다.

```
BadgeRevealCarousel.stories.tsx:268
expect(liveText()).toContain('Common')
→ expected '한강 러너 1. 한강을 따라 10km를 달리면 획득해요. 러닝 코스의 시작을 알리는 배지예요.'
   to contain 'Common'
```

직전 줄(267)의 `waitFor(() => expect(liveText()).toContain('한강 러너 1'))`는 통과한다 — 라이브
리전에 배지 이름·설명은 들어가지만 등급 라벨('Common')만 빠져 있다.

### 근본 원인 (조사 완료)

- `BadgeRevealCarousel.jsx:354-362`의 라이브 리전은 등급 텍스트를 직접 조합하지 않고
  `<RarityBadge rarity={...} />`(시각용 칩 컴포넌트)를 그대로 렌더링해 그 자식 텍스트 노드를
  스크린 리더가 읽게 하는 방식이었다(20260823_008에서 도입 당시엔 RarityBadge가 모든 등급에서
  라벨 span을 렌더링했으므로 문제가 없었다).
- 이후 티켓 `20260827_024`("배지 등급칩 — Common 미표시 정책")가
  `RarityBadge.jsx:22`에 `if (rarity === 'common') return null;`을 추가했다. 이는 **시각적으로
  불필요한 COMMON 칩을 그리드/리스트에서 감추기 위한 의도된 정책**이었고, 그 티켓의 변경 파일
  목록에는 `BadgeGridCard`·`CollectionGridCard`·`FeedSection`만 있을 뿐 `BadgeRevealCarousel`은
  없다 — 이 컴포넌트가 RarityBadge를 텍스트 조합 용도로 재사용하고 있다는 사실이 검토되지 않은
  채 사이드 이펙트로 영향을 받았다.
- 결과: common 등급 배지를 열람할 때 스크린 리더 사용자는 라이브 리전에서 등급 언급을 전혀
  듣지 못하는 실제 접근성 회귀였다.

## 병렬 세션 중복 발견 — 처리 경위

**본 티켓의 조사·구현이 완료된 시점에, 완전히 별개의 병렬 세션이 다른 작업(티켓
20260904_1426) 도중 같은 회귀를 우연히 발견해 별도 티켓
[`20260904_1502`](./20260904_1502_UI_배지획득캐러셀-Common등급-라이브리전-공지누락-수정.md)로
분리하고, 구현→게이트 리뷰→개선 리뷰를 거쳐 **본 티켓보다 먼저 `origin/staging`에 배포하고
CLOSED 처리까지 완료**한 것을 push 직전 확인했다. 근본 원인 분석·수정 방향(`RarityBadge.jsx`에
`getRarityLabel(rarity)` 헬퍼 추가, `BadgeRevealCarousel.jsx` 라이브 리전만 교체, 시각적 common
미표시 정책은 유지)이 두 세션에서 독립적으로 사실상 동일하게 도출됐다.

이에 따라 본 티켓의 구현(브랜치 `claude/jamwork-20260904_1513-rarity-live-region-label`, 3커밋)은
핵심 로직이 이미 staging에 반영된 것과 중복이라고 판단해 **머지하지 않고 브랜치를 삭제**했다.
다만 본 티켓 구현에만 있던 차이점 — `RarityBadge.stories.tsx`에 `getRarityLabel` 헬퍼 자체를
칩 노출 여부와 무관하게 4개 등급 모두에서 검증하는 회귀 방지 Story(`LabelHelperParity`) — 는
20260904_1502가 "테스트가 아니라 컴포넌트를 고치는 것"이라는 판단으로 의도적으로 생략했던
부분이라, 사용자 확인 후 이 Story만 별도 브랜치(`claude/jamwork-20260904_1513-rarity-label-story`,
최신 `origin/staging` 기점)로 분리해 반영했다.

## 상세 요구사항 / 구현 계획

(원안은 20260904_1502와 사실상 동일한 내용이라 생략 — 위 링크 참조)

---
## 완료 기록

### 구현 내용 요약
- 조사 단계에서 근본 원인·수정 방향을 20260904_1502와 독립적으로 동일하게 도출했으나,
  push 직전 병렬 세션이 이미 동일 회귀를 먼저 고쳐 staging에 배포·CLOSED 처리했음을 확인.
- 본 티켓 브랜치(`claude/jamwork-20260904_1513-rarity-live-region-label`)의 핵심 구현
  (`RarityBadge.jsx`의 `getRarityLabel` 추가, `BadgeRevealCarousel.jsx` 라이브 리전 교체)은
  20260904_1502가 이미 반영한 내용과 중복이라 머지하지 않고 브랜치를 삭제(원격+로컬)했다.
- 본 티켓 구현에만 있던 `RarityBadge.stories.tsx`의 `LabelHelperParity` 회귀 방지 Story만
  최신 `origin/staging`에서 새로 분기한 `claude/jamwork-20260904_1513-rarity-label-story`
  브랜치로 별도 반영해 staging에 fast-forward 머지·push했다.

### 변경된 파일
```
jam-web/design-system/components/cards/RarityBadge.stories.tsx  (LabelHelperParity Story 추가)
```

### 테스트 결과 (Story 반영 브랜치 기준, 최신 origin/staging)
- [x] `npx vitest run --project storybook design-system/components/cards/RarityBadge.stories.tsx`
      — 7 tests passed (기존 6 + 신규 `LabelHelperParity` 1)
- [x] `npx vitest run --project storybook design-system/components/patterns/BadgeRevealCarousel.stories.tsx`
      — 14 tests passed (`CenterCardAnnouncement` 포함, 원래 보고된 실패가 20260904_1502의
      수정으로 이미 해소됐음을 재확인)
- [x] `npx tsc --noEmit` — 에러 없음
- [x] `cd jam-web && npm run lint` (전체) — 0 errors, 13 warnings (기존 경고 그대로, 신규 경고 없음)

### UX Writing 검증
- [x] 해당 없음 — 라벨 문자열은 `RarityBadge.jsx` 기존 `config`를 그대로 재사용, 신규 문구 없음

### 배포 정보
- 배포일: 2026-09-04 (staging)
- 환경: staging
- 커밋: `709b0be2` (`claude/jamwork-20260904_1513-rarity-label-story` → `staging` fast-forward push)

### 주요 의사결정 / 핵심 메모
- **병렬 세션 충돌 처리**: 두 세션이 동일 버그를 독립적으로 발견·조사·구현까지 마쳤으나 배포는
  20260904_1502가 먼저 완료했다. 이미 배포된 로직을 다시 머지하는 대신, 두 구현의 차이점(회귀
  방지 Story 유무)만 선별해 반영하는 방식으로 정리했다 — 오케스트레이터가 사용자에게 상황을
  보고하고 (1) Story 반영 여부 (2) 중복 티켓/브랜치 정리 방식을 직접 확인받아 진행했다.
- **CLOSED 커밋은 `docs/20260904_1513-close` 브랜치에서 처리** — `claude/jamwork-*` 브랜치의
  `.githooks/pre-commit`이 CLOSED 상태 커밋을 차단하는 프로젝트 규칙에 따름
  ([[project-jamwork-closed-needs-docs-branch]]).

### 잔여 이슈
- 게이트 리뷰(conservative-reviewer) 중 이번 변경과 무관한 기존 결함을 발견: storybook
  프로젝트 전체 테스트 실행 시 `ListRowCard` 스토리에서 `<button>` 안에 `<button>`이 중첩된다는
  React 콘솔 에러(hydration 경고)가 관찰됨. 유효하지 않은 HTML 중첩이라 브라우저별 클릭/키보드
  동작 차이를 유발할 수 있는 잠재 결함으로 보이나 이번 범위 밖이라 손대지 않음 — 별도 버그
  티켓화가 필요해 보인다.
