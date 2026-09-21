---
id: 20260919_1306
category: Infra
priority: P3
status: CLOSED
created: 2026-09-19
closed: 2026-09-21
---

# [Infra] verify.sh에 루트 scripts 테스트 실행 추가

> 발견 경위: 티켓 20260919_1245(T1) 게이트 리뷰(민지)의 범위 밖 발견물. 상위 티켓 20260919_1223과 직접 관련은 없다.

## 핵심 요약

- 요구사항: `scripts/verify.sh`가 루트 `scripts/*.test.mjs`를 실행하지 않아, 이 테스트가 깨져도 아현의 제출 전 검사와 push 시점 `.githooks/pre-push`가 잡지 못한다. verify.sh에서 이 테스트들을 실행하게 한다.
- 구현 계획: verify.sh에 `scripts/*.test.mjs` 순회 실행 단계를 추가한다. 먼저 현재 테스트가 모두 통과하는지 확인한다.
- 관련 파일: `scripts/verify.sh`(검사 단계 목록), `scripts/ticket-dashboard.test.mjs`, `scripts/ga4-weekly-metrics.test.mjs`, `scripts/doc-check.test.mjs`, `scripts/doc-check-hook.test.mjs`(T1에서 추가)

## 배경 / 문제 정의

`verify.sh`는 lint·typecheck·test·ds:check·slop을 돌리지만 `jam-web/` 안쪽만 대상으로 하고, 루트 `scripts/`의 `*.test.mjs`(현재 4개)는 `node scripts/<파일>.test.mjs`로 직접 실행해야 한다. 따라서 이 테스트가 깨져도 자동으로 드러나지 않는다. 특히 `doc-check`는 모든 커밋에서 도는 훅의 엔진이라 회귀가 곧 전체 커밋 차단이나 무음 통과로 이어질 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `verify.sh`가 `scripts/*.test.mjs`를 순서대로 실행하고, 하나라도 실패하면 실패로 끝난다.
- 실행 시간이 크게 늘지 않아야 한다(테스트가 파일시스템·git에 의존하는지 확인하고, 임시 저장소를 쓰는 테스트는 정리까지 확인한다).
- `.githooks/pre-push`의 "jam-web 변경 없음이면 lint 게이트를 건너뜀" 동작과 어떻게 만나는지 확인한다(문서·스크립트만 바뀐 push에서도 이 테스트를 돌릴지 판단한다).

### UI/UX 관점 (해당 시)
- 해당 없음.

### 컨텐츠 관점 (해당 시)
- 해당 없음.

## 구현 계획

1. 현재 `scripts/*.test.mjs` 4개를 직접 실행해 모두 통과하는지 확인한다.
2. `verify.sh`에 실행 단계를 추가하고 실패 시 종료 코드를 확인한다.
3. `pre-push`와의 상호작용을 확인한다.

## 완료 조건

- 루트 `scripts/`의 테스트 파일 하나를 일부러 깨뜨리고 `scripts/verify.sh`를 실행하면 실패한다.
- 복구 후 `scripts/verify.sh`가 통과한다.
- 완료 기록에 추가된 실행 시간(초)이 적혀 있다.

## 관련 티켓

- 발견 경위 20260919_1245(T1)


---
## 완료 기록

### 구현 내용 요약
`scripts/verify.sh`에 루트 `scripts/*.test.mjs`를 순서대로 실행하는 `scripts-test` 단계를 추가했다. 하나라도 실패하면 단계가 실패하고 로그에 실패한 파일 이름이 남는다. 통과 문구와 머리 주석에도 단계를 반영했다.

### 변경된 파일
```
scripts/verify.sh
```

### 테스트 결과
- [x] 루트 테스트 5개(`doc-check-hook`·`doc-check`·`ensure-hooks-path`·`ga4-weekly-metrics`·`ticket-dashboard`)가 모두 통과한다. 합계 약 16초
- [x] `scripts/verify.sh` 전체 통과: lint · typecheck · test · ds:check · slop · scripts-test · contract · team-doc (42초)
- [x] 일부러 실패하는 임시 테스트 파일을 두고 실행하면 `verify 실패: scripts-test`(종료 코드 1). 파일 제거 후 통과
- 추가된 실행 시간: 약 16초 (verify 전체 42초 중)

### 배포 정보
- 배포일: 2026-09-21 (staging, 경미 수정·문서 경로 — 카리나 직접 처리, 리뷰 브랜치 없음)
- 환경: staging
- 커밋: 정리 묶음 커밋(티켓 8건 한 커밋)

### 주요 의사결정 / 핵심 메모
- **`pre-push`는 바꾸지 않았다.** `verify.sh`는 리뷰 브랜치(`claude/jamwork-*`) push에서만 호출되고 staging push에서는 호출되지 않는다(staging은 jam-web 변경 시 lint만 돈다). 그래서 문서·스크립트만 바뀐 staging push는 이 테스트를 돌리지 않는다.
- 티켓은 테스트가 4개라고 적었으나 실제로는 5개다(`ensure-hooks-path.test.mjs` 추가분).

### 잔여 이슈
- staging push에서도 루트 테스트를 돌릴지는 미결정이다. 필요하면 신규 티켓으로 진행한다.
