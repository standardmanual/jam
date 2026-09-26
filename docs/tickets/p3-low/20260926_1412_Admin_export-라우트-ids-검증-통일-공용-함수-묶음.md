---
id: "20260926_1412"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260924_1630"
  - "20260924_1631"
  - "20260924_1635"
---

# [Admin] 어드민 export 라우트의 ids 개수 상한·UUID 형식 검증을 공용 함수로 통일한다

> 어드민 목록 공통화(20260924_0916)의 범위 밖 발견물 묶음 티켓들에서 결함성 항목만 골라 한 번의 구현·게이트·병합으로 처리하는 묶음 티켓이다(사용자 지시, 2026-09-26). 원본 항목은 각 하위 발견물 티켓의 「배경」에 있다. 처리하지 않는 항목은 그 티켓을 닫을 때 항목별로 사유를 적는다.

## 핵심 요약

- 요구사항: 어드민 export 라우트들이 요청 본문의 `ids`를 똑같이 복사한 코드(`Array.isArray(body.ids) ? ... .filter(typeof string)` → `new Set`)로 읽고, **개수 상한과 UUID 형식 검증이 없다.** 형식이 틀린 값이 `.in('id', …)`에 그대로 들어가면 PostgREST 오류 메시지가 500 응답에 실릴 수 있다(어드민 전용이라 영향은 작음). bulk 라우트의 `readBulkRequest`(`lib/admin/bulk/server.ts`)는 1,000건 상한·UUID 검사를 한다. 이 기준으로 export 라우트도 통일한다.
- 대응 항목: 티켓 20260924_1630 #2(missions export), 1631 #1(today export), 1635 #2(points ledger export, item-badges export, orphaned export).
- 구현 계획: 공용 함수 `parseExportIds(body, emptyMessage)`를 만들고 ids를 받는 export 라우트가 쓰게 한다. 아래 「파일 단위 계획」.
- 관련 파일: `jam-web/src/app/api/admin/{missions,today,points/ledger,item-badges,item-badges/orphaned,badges,itembooks,poi,recipes,users,badge-families}/export/route.ts`, `jam-web/src/lib/admin/bulk/server.ts`(기준).

## 상세 요구사항

### 서비스/코드베이스 관점

- 새 `lib/admin/export-ids.ts`의 `parseExportIds(body: unknown, emptyMessage: string)`는 반환이 `{ ok: true, ids: string[] }`(중복 제거) 또는 `{ ok: false, status: 400, error: string }`이다. 문자열이 아닌 값은 무시하고(기존 동작), 문자열 중 UUID 형식이 아닌 것이 하나라도 있으면 400 "선택한 항목의 식별자 형식이 올바르지 않습니다. 목록을 새로 고친 뒤 다시 시도해 주세요."로, 개수가 상한(`MAX_EXPORT_IDS = 1,000`)을 넘으면 400 "한 번에 최대 1,000건까지 내보낼 수 있습니다. 선택을 줄여 다시 시도해 주세요."로, 0건이면 `emptyMessage`(각 라우트가 지금 쓰는 문구 그대로)로 응답한다. 문구는 UX Writing 가이드의 "현상 → 원인 → 해결책" 구조를 따른다.
- ids를 받는 라우트가 이 함수를 쓴다. **`ids`가 UUID가 아닌 키(예: 배지 계열 `badge-families`의 계열 키)이거나 ids를 받지 않는 라우트는 대상에서 뺀다.** 어떤 라우트가 UUID `ids`를 받는지는 아현이 각 라우트를 열어 확인하고, 제외한 라우트와 사유를 보고에 적는다.
- 각 라우트의 기존 정상 경로 동작(응답 형식·파일 이름·청크 조회)은 바꾸지 않는다. 오류 응답 문구는 기존 빈 선택 문구를 그대로 쓴다.

## 구현 계획

### 파일 단위 계획 (규모 사전 판정, 2026-09-26)

| # | 파일 | 하는 일 | 예상 줄 수 |
|---|---|---|---|
| 1 | `jam-web/src/lib/admin/export-ids.ts` (신규) | `parseExportIds`와 상수 `MAX_EXPORT_IDS` | 약 40 |
| 2 | `jam-web/src/lib/admin/__tests__/export-ids.test.ts` (신규) | 정상·중복 제거·비문자열 무시·UUID 아님·상한 초과·정확히 상한·빈 선택 | 약 70 |
| 3 | 위 「관련 파일」의 export 라우트 중 UUID `ids`를 받는 것(최소 missions, today, points/ledger, item-badges, item-badges/orphaned) | 복사된 파싱 코드를 `parseExportIds` 호출로 교체 | 라우트당 약 −8 +5 |
| 4 | 각 교체한 라우트의 `__tests__/route.test.ts` (없으면 신규, 있으면 케이스 추가) | UUID 아님 → 400, 상한 초과 → 400, 정상 경로 유지 | 라우트당 약 25 |

- 예상 합계 300줄 안팎, 변경 파일 약 15개이므로 100줄·5파일 기준을 넘긴다. 위 파일이 라우트 단위로 적혀 있으므로 `planOnlyWaiver`로 첫 호출부터 면제한다. DB 변경 없음. 어드민 유형이라 실렌더는 시도하지 않는다.

## 완료 조건

- 교체한 모든 export 라우트에서 UUID가 아닌 값과 상한 초과가 400으로 거절되고 DB 오류 원문이 응답에 없다(단위 테스트). 정상 경로의 응답은 바뀌지 않는다.
- 제외한 라우트와 사유가 완료 기록에 있다. `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 신규 공용 함수 `parseExportIds(body, emptyMessage)`와 상수 `MAX_EXPORT_IDS = 1000`을 `jam-web/src/lib/admin/export-ids.ts`에 만들었다. 문자열이 아닌 값은 무시하고 중복은 제거하며, 0건이면 각 라우트의 기존 빈 선택 문구, UUID가 아닌 값이 하나라도 있거나 중복 제거 뒤 1,000건을 넘으면 400과 안내 문구로 거절한다. 거절은 DB 조회보다 먼저 일어난다.
- UUID `ids`를 받는 export 라우트 **10개**(badges, item-badges, item-badges/orphaned, itembooks, missions, poi, points/ledger, recipes, today, users)의 복사된 파싱 코드를 이 함수 호출로 교체했다. 정상 경로(응답 형식·파일 이름·200건 청크 조회)는 그대로다. `users`와 `recipes`가 따로 갖고 있던 1,000건 상한 검사는 공용 함수로 옮겼다.
- **제외한 라우트: `badge-families/export`.** `ids`가 UUID가 아니라 계열 키라(`badge-families/export/route.ts` 25~31행) UUID 검증을 걸면 정상 요청이 막힌다. `ids`를 받지 않는 export 라우트는 없었다(11개 중 10개 적용, 1개 제외).

### 변경된 파일
```
- jam-web/src/lib/admin/export-ids.ts (신규), __tests__/export-ids.test.ts (신규)
- jam-web/src/app/api/admin/__tests__/export-ids-routes.test.ts (신규, 10개 라우트를 describe.each로)
- jam-web/src/app/api/admin/{badges,item-badges,item-badges/orphaned,itembooks,missions,poi,points/ledger,recipes,today,users}/export/route.ts
- jam-web/src/app/api/admin/badges/export/__tests__/route.test.ts (비UUID id를 UUID로 교체)
```

### 테스트 결과
- [x] 공용 함수 단위 테스트 10건, 라우트 10개 × 4건(UUID 아님 400, 1,001건 400, 기존 빈 선택 문구, 유효 요청은 DB 단계로 진행). 거절 케이스는 `createServiceClient` 미호출과 응답에 DB 원문 없음을 확인한다
- [x] `scripts/verify.sh` 전 항목 통과, CI `verify` 성공(실행 36220373101, 커밋 e049144e)
- [x] 민지 게이트 **PASS**. 점검 12항목 중 1·2·3·4·5·9·10·11 통과, 나머지 해당 없음. 검토 범위 dd616370..e049144e

### 배포 정보
- 배포일: 2026-09-26 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 커밋: 구현 e049144e(외 이전 커밋), 병합 56325a2f (리뷰 브랜치 `claude/jamwork-20260926_1412-export-ids`)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 (게이트 PASS) | 116,335 | 45,587 / 14,380 | 10.1분 | 44 |
| 합계 | 2 | 116,335 | 45,587 / 14,380 | 10.1분 | 44 |

### 주요 의사결정 / 핵심 메모
- **라우트별 테스트를 표 하나로 묶었다.** 티켓 계획은 라우트마다 `route.test.ts`를 두라고 했지만 10개 라우트가 같은 검증을 쓰므로 `describe.each`로 도는 통합 테스트 1개로 묶었고 게이트가 완료 조건 충족으로 인정했다.
- **사용자에게 보이는 문구 변경**: `users/export`와 `recipes/export`의 상한 초과 문구가 "최대 1000명/건까지 내보낼 수 있습니다."에서 공용 문구("한 번에 최대 1,000건까지 내보낼 수 있습니다. 선택을 줄여 다시 시도해 주세요.")로 바뀐다(티켓 지시).
- **UUID 가정의 근거**: 대상 테이블(badges, missions, today_cards, point_transactions, poi, combination_recipes, users, item_books, inventory_items)의 id가 UUID이고 각 일괄 라우트가 `idFormat: 'uuid'`를 쓴다. `item_badges`라는 이름의 테이블 정의는 찾지 못했으나 라우트가 실제로 조회하는 `inventory_items`가 UUID임을 확인했다.
- **계획 반환 면제.** 파일 약 15개·예상 300줄 안팎이라 티켓에 파일 단위 계획을 적고 첫 호출부터 면제했다. 실제 diff는 333줄(예상 범위 안)이었다.

### 잔여 이슈
- 프론트에서 export에 UUID가 아닌 id를 보내는 경로가 있는지는 확인하지 않았다. `badge-families` 외에는 목록의 id 컬럼을 그대로 보낸다.
- 사용자가 1,000건을 넘게 직접 고르는 경로가 생기면 export가 400이 된다(현재 UI의 전체 선택 상한도 1,000이라 즉시 문제는 없다).
