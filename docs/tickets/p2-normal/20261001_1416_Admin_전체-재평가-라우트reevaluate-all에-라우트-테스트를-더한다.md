---
id: "20261001_1416"
category: Admin
priority: P2
status: OPEN
created: 2026-10-01
closed:
---

# [Admin] 전체 재평가 라우트(reevaluate-all)에 라우트 테스트를 더한다

> `/jam-ship` 2026-10-01 병렬 점검(민지 모드 ③) 범위 밖 발견물. 점검 범위 `efd7be8d..946ebad7`(origin/main → origin/staging).

## 핵심 요약

- 요구사항: `POST /api/admin/badges/reevaluate-all`의 발급 대상이 JAM! 행동 지표와 사용량 지표 6종(포인트 지급 포함)까지 넓어졌는데 라우트 테스트가 없다. `dryRun` 기본값 true, 비관리자 403, `userIds` 형식 400, 500명 상한 400, 대상 0명 응답의 새 필드 6개가 테스트 밖이다. 소요 시간 상한은 20261001_1036이 따로 맡는다. [정확성/주의]
- 구현 계획: 라우트 테스트 파일을 새로 만들어 위 다섯 경로를 고정한다.
- 관련 파일: `jam-web/src/app/api/admin/badges/reevaluate-all/route.ts:42`, `jam-web/src/lib/badge-engine/reevaluateCatalog.ts`

## 완료 조건

- `dryRun` 기본값·권한·입력 검증·상한·빈 대상 응답이 라우트 테스트로 고정된다.
