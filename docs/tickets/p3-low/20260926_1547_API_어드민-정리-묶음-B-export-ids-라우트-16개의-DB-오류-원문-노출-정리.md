---
id: "20260926_1547"
category: API
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260925_0238"
  - "20260926_1546"
---

# [API] 어드민 정리 묶음 B: export·ids 라우트 16개의 DB 오류 원문 노출 정리

> 묶음 티켓이다(사용자 지시, 2026-09-26). 티켓 `20260925_0238`의 나머지 중 **내보내기(export)와 선택 ID 조회(ids) 라우트**만 다룬다. 같은 유형의 기계적 정리라 한 번에 처리한다. 묶음 A(`20260926_1546`)와 파일이 겹치지 않아 병렬로 진행한다. 끝나도 `0238`은 닫지 않는다(그 밖의 어드민 라우트가 남는다).

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
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
