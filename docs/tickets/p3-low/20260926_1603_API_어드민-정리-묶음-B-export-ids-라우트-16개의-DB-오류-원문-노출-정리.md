---
id: "20260926_1603"
category: API
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260925_0238"
  - "20260926_1602"
---

# [API] 어드민 정리 묶음 B: export·ids 라우트 16개의 DB 오류 원문 노출 정리

> 묶음 티켓이다(사용자 지시, 2026-09-26). 티켓 `20260925_0238`의 나머지 중 **내보내기(export)와 선택 ID 조회(ids) 라우트**만 다룬다. 같은 유형의 기계적 정리라 한 번에 처리한다. 묶음 A(`20260926_1602`)와 파일이 겹치지 않아 병렬로 진행한다. 끝나도 `0238`은 닫지 않는다(그 밖의 어드민 라우트가 남는다).

## 핵심 요약

- 요구사항: 아래 라우트에서 DB 오류의 `error.message`를 응답에 싣지 않고 **고정 한국어 문장 + 서버 `console.error`** 로 바꾼다. 문장 형식은 `badges/list-bulk/route.ts:32-34`의 상수와 같다(「~하지 못했어요. 서버에서 ~ 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.」), 로그 접두어는 `[<라우트 이름> <무엇> 오류]`. **앱이 직접 만든 안내 문장은 바꾸지 않는다.** 특히 `drop-policy/exclusions/ids/route.ts:45`의 `catch`에서 `e.message`를 내는 곳은 `parseExportIds`가 만든 안내 문장일 가능성이 있으니 출처를 확인해, 앱이 만든 문장이면 그대로 두고 DB 오류일 때만 바꾼다.
- 대상(경로 앞은 `jam-web/src/app/api/admin/`):
  - ids: `drop-policy/exclusions/ids:49`, `today/ids:30`, `missions/ids:28`, `poi/ids:25`, `poi/review/ids:29`, `recipes/ids:31`, `points/ledger/ids:27`, `item-badges/ids:29`
  - export: `today/export:35`, `missions/export:46`, `itembooks/export:40`, `poi/export:31`, `recipes/export:36,37`, `points/ledger/export:43,53`, `item-badges/export:41`
- 테스트: `jam-web/src/app/api/admin/__tests__/export-ids-routes.test.ts`(J2가 라우트별 대역과 `call()`을 만들어 둠)에 라우트별로 「DB 오류 → 500·고정 문장·원문 미노출·`console.error` 접두어」를 추가한다. 라우트마다 기존 테스트 파일이 따로 있으면 거기에 둔다.
- **범위 제외**: 그 밖의 어드민 라우트, 묶음 A의 파일.

## 구현 계획

### 파일 단위 계획 (규모 사전 판정, 2026-09-26)

| # | 파일 | 하는 일 | 예상 줄 수 |
|---|---|---|---|
| 1 | 위 대상 라우트 16개 | 오류 응답 17곳을 고정 문장 + `console.error`로. 같은 문장 상수는 라우트마다 두거나 한 파일에 모아도 된다(모을 때는 `jam-web/src/lib/admin/` 아래 한 파일, 기존 관례가 있으면 그것을 따른다) | 약 70 |
| 2 | `export-ids-routes.test.ts` (+ 기존 라우트 테스트) | 라우트별 DB 오류 단언, 원문 노출 변조 시 실패 확인 | 약 110 |

- 예상 합계 약 180줄, 변경 파일 약 17개라 기준을 넘긴다. `planOnlyWaiver`로 첫 호출부터 면제한다. 실제 DB·스토리지·네트워크는 접근하지 않고 스텁으로만 한다.

## 완료 조건

- 위 라우트의 DB 오류 응답에 원문이 없고 각각 테스트가 있다(원문 노출 변조를 하면 테스트가 실패해야 한다). 기존 테스트는 그대로 통과한다. `scripts/verify.sh` 통과.

---
## 완료 기록

### 구현 내용 요약
- export·ids 라우트 15개의 DB 오류 응답 17곳에서 `error.message`를 빼고, 라우트별 상수 `READ_ERROR_MESSAGE`(고정 한국어 문장, `badges/list-bulk`와 같은 「~하지 못했어요. 서버에서 ~ 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.」 형식)로 바꿨다. 원문은 `console.error('[<라우트> <무엇> 오류]:', error.message)`로 서버 로그에만 남는다. 상태 코드·성공 경로·인증·입력 검증은 그대로다.
- `parseExportIds`가 만든 400 안내, 상한 초과 422 문장, `item-badges/export`의 기존 고정 문장 2곳은 바꾸지 않았다.
- `drop-policy/exclusions/ids`의 `catch`는 출처를 확인해 처리했다. `Error`의 유일한 출처는 `drop-exclusion-list.ts:113`이 `new Error(dbError.message)`로 던지는 DB 오류였다. 그래서 `Error`이면 고정 문장으로 바꾸고, `Error`가 아니면 앱 문장 「조회에 실패했습니다.」를 그대로 뒀다.
- **티켓 제목의 「16개」는 오기였다.** 본문에 나열한 라우트는 ids 8개 + export 7개 = 15개, 오류 지점은 17곳이고 전부 처리했다. 파일명은 이력 보존을 위해 바꾸지 않았다.

### 변경된 파일
```
- jam-web/src/app/api/admin/{drop-policy/exclusions/ids, today/ids, missions/ids, poi/ids, poi/review/ids, recipes/ids, points/ledger/ids, item-badges/ids}/route.ts
- jam-web/src/app/api/admin/{today/export, missions/export, itembooks/export, poi/export, recipes/export, points/ledger/export, item-badges/export}/route.ts
- jam-web/src/app/api/admin/__tests__/export-ids-routes.test.ts
```

### 테스트 결과
- [x] `scripts/verify.sh` 전 항목 통과, CI `verify` 성공(실행 36225205797, 커밋 86fda555). 병합 뒤 통합본에서 `src/app/api/admin`·`src/lib/admin` vitest 80개 파일 1087건 통과
- [x] 민지 게이트 **PASS**. 점검 12항목 중 1·2·3·4·5·9·10·11 통과, 나머지 해당 없음. 검토 범위 319374dd..86fda555
- 원문 노출 변조 확인: `points/ledger/export`(유저 조회)와 `drop-policy/exclusions/ids`(`catch`)를 원문 노출로 되돌리면 각 테스트가 실패하는 것을 아현이 확인하고 원복했다.

### 배포 정보
- 배포일: 2026-09-26 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 커밋: 구현 86fda555, 병합은 이 묶음 종료 기록과 함께 push (리뷰 브랜치 `claude/jamwork-20260926_1603-admin-cleanup-b-error-leak`)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 (게이트 PASS) | 137,587 | 71,479 / 11,030 | 12.0분 | 74 |
| 합계 | 2 | 137,587 | 71,479 / 11,030 | 12.0분 | 74 |

### 주요 의사결정 / 핵심 메모
- **문장 상수는 라우트마다 두었다.** 한 파일에 모으는 대신 `list-bulk`·`badges/ids`의 기존 관례를 따랐다. 명사는 라우트별로 정했다(ids는 「OO 목록을」, export는 「내보낼 OO 정보를」).
- **계획 반환 면제.** 파일 약 17개·예상 약 180줄이라 티켓에 파일 단위 계획을 적고 첫 호출부터 면제했다. 실제 diff는 219줄이었다.
- **범위 밖 발견물**은 `0238`에 위치를 덧붙였다: `drop-exclusion-list.ts:113`의 DB 원문 throw(`[주의]`), `item-badges/export` 문장 어미 불일치(`[참고]`).

### 잔여 이슈
- `0238`의 나머지(이번 묶음 A가 다루는 라우트를 제외한 그 밖의 어드민 라우트)가 남아 있어 `0238`은 닫지 않는다.
