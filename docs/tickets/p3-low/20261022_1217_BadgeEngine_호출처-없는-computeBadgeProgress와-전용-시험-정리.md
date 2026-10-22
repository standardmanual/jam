---
id: "20261022_1217"
category: BadgeEngine
priority: P3
status: OPEN
created: 2026-10-22
parent: "20261022_0938"
---

# [BadgeEngine] 앱 코드에서 호출하는 곳이 없는 `computeBadgeProgress`와 전용 시험을 정리한다

> 출처: 티켓 20261022_0938 1회 게이트(민지) 범위 밖 발견물 [구조/참고]. 사용자가 2026-10-22 머지 승인 때 «후속 티켓으로» 넘기기로 정했다.

## 핵심 요약

- 요구사항: `lib/badge-engine/badgeProgress.ts`의 `computeBadgeProgress`(1161줄, 파일 전체 약 500줄 안팎)는 앱 코드에서 부르는 곳이 없고 시험만 쓴다. 0938 1회가 «계열 진행» 스냅샷 쓰기를 지우면서 마지막 앱 호출처가 사라졌다. 지울지, 다른 화면(배지 진행 표시)에서 쓸 계획이 있는지 정하고 정리한다.
- 구현 계획: 먼저 `grep`으로 앱 코드 호출처 0건을 다시 확인한다. 같은 파일의 `classifyBadgeProgressKind`와 `computeUserPeriodMetrics`처럼 다른 곳에서 쓰는 함수가 있는지 가려 남길 것과 지울 것을 나눈다.
- 관련 파일: `jam-web/src/lib/badge-engine/badgeProgress.ts`, 이 함수를 쓰는 시험 `jam-web/src/lib/badge-engine/__tests__/badgeProgress.test.ts`·`progress-layer-v5.test.ts`·`rest-conditions.test.ts`(28·300줄)·`condition-registry.test.ts`(900줄 주석), 주석에서 이 함수를 가리키는 `jam-web/src/lib/badge-engine/metricLabels.ts` 8줄·`jam-web/src/types/database.ts` 353줄.

## 배경 / 문제 정의

배지 진행 계산 엔진은 «후속 3b 화면»(배지 진행 표시)이 쓰려고 만들었지만 그 화면은 만들어지지 않았고 배지 트리는 제거됐다. 0938 1회에서 `sync.ts`의 `updateFamilyProgressSnapshots`가 사라지면서 앱 코드 호출처가 0건이 됐다. 시험 4개 파일이 이 함수를 쓰므로, 함수만 지우면 시험이 깨지고 시험까지 지우면 변경이 커서 0938 1회에는 넣지 않았다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 지우기로 하면 함수, 그 함수만 쓰는 도우미, 전용 시험, 이 함수를 가리키는 주석과 문서를 같이 정리한다.
- 배지 진행 표시를 JAM 2.0에서 다시 만들 계획이 있으면 지우지 않고 이 티켓을 닫는다(결정은 사용자).

## 완료 조건

- 앱 코드에서 호출하는 곳이 없는 진행 계산 코드와 그 전용 시험이 없거나, 남기기로 한 이유가 이 티켓에 적혀 있다.
- 전체 시험과 타입 검사가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
