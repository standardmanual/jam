---
id: "20260926_1340"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260926_1241"
  - "20260924_1404"
  - "20260924_1405"
---

# [Admin] 어드민 배지 단건 PATCH·list-bulk·export의 오류 경로와 경계 테스트 공백을 채운다

> 2026-09-26 프로덕션 배포 전 점검(민지 모드 ③) 발견물이다. 신호: 주의(1번)·참고(2·3번).

## 핵심 요약

- 요구사항: 이번 배포에 들어간 어드민 배지 라우트 변경(티켓 20260926_1241 묶음)의 실패 경로와 경계가 테스트로 고정되어 있지 않다. 세 곳이다.
  1. **단건 PATCH의 조회 오류**: 신규 `readError` 분기가 500과 한국어 안내를 돌려주는지 검증하는 케이스가 없다. 테스트는 비활성 중복·활성·404·되살리기 4건뿐이고 `fakeClient`가 항상 성공만 돌려준다(`badges/[id]/route.ts:258-272`, 테스트 `[id]/__tests__/route.test.ts:63-110`). [주의]
  2. **list-bulk deactivate의 사전 조회 오류**: `fetchBadgeDeactivationCandidates` 실패 시 500 경로, `READ_CHUNK_SIZE` 경계(묶음이 둘 이상), 빈 `ids` 입력을 검증하지 않는다(`badges/list-bulk/route.ts:59-73,103-105`). [참고]
  3. **export 라우트**: 신규 오류 테스트 1건뿐이고 정상 경로와 `CHUNK_SIZE` 경계 테스트가 없다(`badges/export/__tests__/route.test.ts:26`). [참고]
- 구현 계획: 각 라우트의 기존 `fakeClient`에 오류 주입 옵션을 추가하고 위 케이스를 채운다. 코드 변경은 없다.

## 완료 조건

- 세 라우트에서 조회 오류가 500과 한국어 안내로 응답하는지, 묶음 경계와 빈 입력이 기대대로 처리되는지를 단위 테스트가 고정한다.


---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 묶음 티켓 20260926_1345로 처리했다. 상세와 실행 지표는 그 티켓의 완료 기록에 있다. 코드 변경 없이 테스트만 추가했다.
- 단건 PATCH 조회 오류(`readError`) 500, `list-bulk` 사전 조회 오류·드랍 수 집계 오류·삭제 오류의 500과 원문 미노출, `READ_CHUNK_SIZE` 경계(200건은 한 묶음, 201건은 두 묶음), 빈 `ids` 400, `export` 정상 CSV·중복 제거·`CHUNK_SIZE` 경계·빈/잘못된 입력을 테스트로 고정했다.

### 변경된 파일
```
- jam-web/src/app/api/admin/badges/list-bulk/__tests__/route.test.ts
- jam-web/src/app/api/admin/badges/[id]/__tests__/route.test.ts
- jam-web/src/app/api/admin/badges/export/__tests__/route.test.ts
```

### 테스트 결과
- [x] 추가 테스트 통과, CI 성공. 트라이브 지정 경로(트라이브·컬렉션 조회)는 같은 상수를 쓰는 동일 패턴이라 전용 테스트를 만들지 않았다
