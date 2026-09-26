---
id: "20260926_1345"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260924_1636"
  - "20260926_1340"
  - "20260925_0238"
---

# [Admin] 어드민 정합성·테스트 공백 묶음: 제재 필터 한도 초과(1636), 배지 라우트 오류 경로 테스트(1340), list-bulk DB 원문 노출(0238 일부)

> 티켓 세 건을 한 번의 구현·게이트·병합으로 처리하기 위한 묶음 티켓이다(사용자 지시, 2026-09-26). 끝나면 `1636`·`1340`을 함께 닫는다. `0238`은 관례 전반 정리라 이번에는 `list-bulk` 부분만 처리하고 열어 둔다. 세부 배경은 `docs/tickets/p2-normal/20260924_1636_*`, `docs/tickets/p3-low/20260926_1340_*`, `20260925_0238_*`를 읽는다.

## 핵심 요약

- 요구사항: (1) `fetchActiveBanUserIds`가 `user_shadow_bans`를 `.limit(1000)`으로 읽어 제재 행이 1,000건을 넘으면 조용히 잘린 결과를 낸다. 현재 행은 0건이라 잠재 위험이므로, 한도에 닿으면 **조용히 틀린 결과 대신 명시적 오류**를 내게 하고 사실과 어긋난 주석을 고친다. 필터 구조 전체(제재 id를 `.in()`·`.not()`에 통째로 넣는 방식은 수백 건에서 요청 주소 길이 한계가 먼저 온다)를 바꾸는 재설계는 하지 않는다. 제재 행이 실제로 수백 건에 가까워지면 재설계한다는 근거를 코드 주석에 남긴다. (2) 어드민 배지 단건 PATCH·`list-bulk`·`export` 라우트의 오류 경로와 경계 테스트를 채운다(티켓 1340). (3) `list-bulk`가 DB 오류 원문(`error.message`)을 응답에 그대로 내는 곳을 고정 한국어 문장으로 바꾸고 원문은 로그에 남긴다(티켓 0238의 `list-bulk` 부분).
- 관련 파일: `jam-web/src/lib/admin/user-list.ts`(`fetchActiveBanUserIds`), `jam-web/src/lib/admin/__tests__/user-list.test.ts`, `jam-web/src/app/api/admin/badges/[id]/route.ts:258-272`, `jam-web/src/app/api/admin/badges/list-bulk/route.ts:51,59-73,67,103-105,119,224`, `jam-web/src/app/api/admin/badges/export/route.ts`, 각 라우트의 `__tests__/route.test.ts`.

## 상세 요구사항

### 서비스/코드베이스 관점

- (1) `fetchActiveBanUserIds`는 읽은 행 수가 한도(1,000)와 같거나 크면 "제재 기록이 한도(1,000건)를 넘어 제재 필터를 신뢰할 수 없습니다" 취지의 한국어 문장으로 오류를 던진다(기존 조회 오류 처리와 같은 방식으로 화면이 오류를 보이게). 잘림을 부정하던 옛 주석은 사실대로 고친다.
- (2) 각 라우트 테스트의 `fakeClient`에 오류 주입 옵션을 추가한다: 단건 PATCH의 조회 오류(`readError`)가 500과 한국어 안내를 돌려줄 것, `list-bulk` deactivate의 사전 조회(`fetchBadgeDeactivationCandidates`) 오류 500·`READ_CHUNK_SIZE` 경계(묶음이 둘 이상)·빈 `ids` 입력, `export`의 정상 경로와 `CHUNK_SIZE` 경계.
- (3) `list-bulk/route.ts`의 51·67·119·224행 부근 오류 응답을 고정 한국어 문장으로 바꾸고 `console.error`로 원문을 남긴다. 같은 파일에서 이미 바꾼 export·ids·PATCH의 문장 스타일(`docs/specs/UX_WRITING_GUIDELINE.md` "현상 → 원인 → 해결책")을 따르고, DB 원문이 응답에 없음을 테스트로 확인한다.

## 구현 계획

### 파일 단위 계획 (규모 사전 판정, 2026-09-26)

| # | 파일 | 하는 일 | 예상 줄 수 |
|---|---|---|---|
| 1 | `jam-web/src/lib/admin/user-list.ts` (`fetchActiveBanUserIds`) | 한도 도달 시 명시적 오류, 주석 정정 | 약 10 |
| 2 | `jam-web/src/lib/admin/__tests__/user-list.test.ts` | 1,000건 미만은 정상, 1,000건이면 오류 | 약 30 |
| 3 | `jam-web/src/app/api/admin/badges/list-bulk/route.ts` | 51·67·119·224행 오류 응답을 고정 문장으로, 원문은 로그 | 약 15 |
| 4 | `jam-web/src/app/api/admin/badges/list-bulk/__tests__/route.test.ts` | 조회 오류 500·원문 미노출, 묶음 경계, 빈 `ids` | 약 60 |
| 5 | `jam-web/src/app/api/admin/badges/[id]/__tests__/route.test.ts` | `readError` 케이스와 `fakeClient` 오류 주입 | 약 30 |
| 6 | `jam-web/src/app/api/admin/badges/export/__tests__/route.test.ts` | 정상 경로, `CHUNK_SIZE` 경계 | 약 40 |

- 예상 합계 약 185줄(대부분 테스트)이라 100줄 기준을 넘긴다. 파일 6개, 위 파일·줄 위치가 적혀 있으므로 `planOnlyWaiver`로 첫 호출부터 면제한다. DB 변경·마이그레이션 없음. 어드민 유형이라 격리 워크트리에서 실렌더를 시도하지 않는다.

## 완료 조건

- 제재 행이 한도에 닿으면 `fetchActiveBanUserIds`가 조용한 잘림 대신 오류를 던지고, 한도 미만에서는 종전과 같다(단위 테스트).
- 단건 PATCH 조회 오류, `list-bulk` 사전 조회 오류·묶음 경계·빈 `ids`, `export` 정상 경로·경계가 테스트로 고정된다.
- `list-bulk`의 오류 응답에 DB 원문이 없고 원문은 로그에 남는다(단위 테스트). `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 티켓 세 건을 한 번의 구현·게이트·병합으로 처리했다. `1636`·`1340`은 함께 CLOSED로 바꿨고, `0238`은 관례 전반 정리라 이번에는 `list-bulk` 부분만 처리하고 열어 뒀다.
- 1636: 제재 필터가 한도에 닿으면 명시적 오류. 1340: 배지 라우트 오류 경로·경계 테스트. 0238(일부): `list-bulk`의 DB 오류 응답 6곳(트라이브 지정 조회, 비활성화 사전 조회, 드랍 수 집계, 트라이브 조회, 컬렉션 조회, 삭제)을 고정 한국어 문장(현상 → 원인 → 해결책)으로 바꾸고 원문은 `console.error`로만 남겼다. 티켓이 적은 51·67·119·224행에 더해 같은 유형인 151·160행도 함께 바꿨다.

### 변경된 파일
```
- jam-web/src/lib/admin/user-list.ts, __tests__/user-list.test.ts
- jam-web/src/app/api/admin/badges/list-bulk/route.ts, __tests__/route.test.ts
- jam-web/src/app/api/admin/badges/[id]/__tests__/route.test.ts
- jam-web/src/app/api/admin/badges/export/__tests__/route.test.ts
```

### 테스트 결과
- [x] `scripts/verify.sh` 전 항목 통과, CI `verify` 성공(실행 36218956589, 커밋 19b13ae7)
- [x] 민지 게이트 **PASS**. 점검 12항목 중 1·2·3·4·5·9·10·11 통과, 나머지 해당 없음. 검토 범위 2d542d5c..19b13ae7

### 배포 정보
- 배포일: 2026-09-26 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 커밋: 구현 6664cdbd·c083f929·19b13ae7, 병합 bde821c7 (리뷰 브랜치 `claude/jamwork-20260926_1345-admin-consistency-tests`)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 (묶음 3건) | 113,498 | 34,487 / 4,576 | 9.6분 | 40 |
| 합계 | 2 | 113,498 | 34,487 / 4,576 | 9.6분 | 40 |

### 주요 의사결정 / 핵심 메모
- **1636은 재설계가 아니라 최소 수정으로 처리했다.** 제재 행이 0건이라 급하지 않고, 필터 구조 전체(제재 id를 `.in()`·`.not()`에 넣는 방식)는 수백 건에서 요청 주소 길이 한계가 먼저 온다. 그래서 한도에 닿으면 조용히 틀린 결과 대신 명시적 오류를 내게 하고, 재설계 트리거를 후속 티켓으로 남겼다.
- **0238 범위를 좁혔다.** 관례 전반 정리는 크므로 이번에는 `list-bulk`의 티켓 지정 행만 다뤘다. 공용 헬퍼 `updateByIdsAllOrNothing`가 `update.error`를 그대로 내는 3곳은 공용 헬퍼 변경이 필요해 손대지 않았고 0238에 위치를 덧붙였다.
- **범위 확장 1건.** 티켓이 적은 4곳 외에 같은 유형인 151·160행도 함께 바꿨다. 같은 오류 유형·같은 파일이라 게이트가 범위 이탈로 보지 않았다.
- **계획 반환 면제.** 파일 6개·예상 약 185줄이라 티켓에 파일 단위 계획을 적고 첫 호출부터 면제했다. 실제 diff는 310줄(테스트 비중이 큼)로 예상의 1.7배였다.

### 잔여 이슈
- `list-bulk`의 공용 헬퍼 `update.error` 노출 3곳(티켓 0238에 덧붙임).
