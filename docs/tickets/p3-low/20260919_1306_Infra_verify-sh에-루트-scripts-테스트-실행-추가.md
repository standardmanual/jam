---
id: 20260919_1306
category: Infra
priority: P3
status: OPEN
created: 2026-09-19
closed:
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
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 사용자 노출 텍스트 없음 (내부 검사 스크립트)

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
