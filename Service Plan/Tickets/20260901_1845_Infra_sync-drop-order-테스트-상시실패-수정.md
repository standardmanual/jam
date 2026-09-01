---
id: 20260901_1845
category: Infra
status: CLOSED
created: 2026-09-01
closed: 2026-09-01
---

# [Infra] sync-drop-order.test.ts 상시 red 2건 수정

## 배경 / 문제 정의
티켓 [20260831_1149](20260831_1149_Service_어드민-어뷰징정책-저장-조용한실패-upsert에러삼킴.md)의
"미분리(기록만)" 항목: `sync-drop-order.test.ts`가 상시 red(실패) 상태인 테스트를 2건 갖고
있다. 원인은 관련 티켓
[20260831_1327](20260831_1327_Infra_유닛테스트가-실DB에-접속-createServiceClient-미모킹.md)에서
지적된 `createServiceClient()` 미모킹과 연관되어 있을 가능성이 높다 — 해당 티켓의 수정과
순서를 맞춰 진행한다(먼저 처리되어 있다면 이 테스트가 이미 해소됐을 수 있으니 재확인부터).

## 상세 요구사항

### 서비스/코드베이스 관점
- `sync-drop-order.test.ts`를 실행해 현재 실패하는 2건의 정확한 원인 확인
- `createServiceClient()` 모킹 적용 후에도 실패가 남으면 테스트 자체의 assertion·픽스처
  문제인지 별도로 규명
- 상시 red 테스트가 CI/lint 신호를 무력화하지 않도록 반드시 green으로 만들거나, green이
  불가능한 정당한 사유가 있다면 `.skip` + 사유 주석으로 명시

## 구현 계획
- 티켓 20260831_1327과 동일 파일을 다루므로, 그 티켓이 먼저 처리됐다면 이 티켓에서는
  잔여 2건 실패만 확인 후 처리

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
티켓 [20260831_1327](20260831_1327_Infra_유닛테스트가-실DB에-접속-createServiceClient-미모킹.md)에서
`sync-drop-order.test.ts`의 근본 원인(`findCompletableItemBooks()` 등 부수 모듈이 주입
사슬 밖에서 자체적으로 `createServiceClient()`를 호출)을 수정하면서 이 티켓이 다루려던
"상시 red 2건"이 함께 해소됐다. `npx vitest run src/lib/strava/__tests__/sync-drop-order.test.ts`로
재확인한 결과 2개 테스트 모두 green — 별도 구현 불필요, 재확인만 하고 종료.

### 변경된 파일
```
(없음 — 20260831_1327의 수정으로 함께 해소됨)
```

### 테스트 결과
- [x] `npx vitest run src/lib/strava/__tests__/sync-drop-order.test.ts` — 2개 테스트 전체 green

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (내부 테스트 코드)

### 배포 정보
해당 없음 (코드 변경 없음, 20260831_1327 배포에 이미 포함됨)

### 주요 의사결정 / 핵심 메모
티켓 작성 시점에 예상했던 의존관계(1327을 먼저 처리하면 이 문제도 함께 풀릴 가능성)가
그대로 맞아떨어져, 별도 구현 없이 재확인만으로 종결했다.

### 잔여 이슈
-
