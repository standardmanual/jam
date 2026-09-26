---
id: "20260926_1620"
category: API
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260926_1602"
  - "20260925_0238"
---

# [API] 공용 bulk 헬퍼 변경 뒤 남은 공백: 호출부 라우트의 갱신 실패 테스트, 「일부만 반영」 문구 중복, PATCH의 null 본문

> 프로덕션 배포(5ab1e2db) 전 점검(민지 모드 ③)에서 나온 범위 밖 발견물을 3.2절대로 자동 티켓화했다. 오류 응답에 원문이 새는 문제는 아니며 모두 현재 동작에는 회귀가 없다.

## 핵심 요약

- 요구사항
  1. **[주의] 호출부 라우트 수준 테스트 없음**: `updateByIdsAllOrNothing`이 고정 문장을 돌려주는 것은 `bulk-server.test.ts`가 닫지만, 이 헬퍼를 쓰는 라우트(`tribes/bulk`·`today/bulk`·`missions/bulk`·`poi/bulk`·`itembooks/bulk`는 `__tests__`가 없고, `drop-policy/exclusions/bulk`·`badges/list-bulk` 테스트의 갱신 스텁은 성공 고정)가 그 값을 응답에 그대로 싣는지는 코드 읽기로만 확인된다. 라우트가 `update.error`를 버리거나 바꿔도 테스트가 잡지 못한다. 라우트별로 「갱신 실패 → 500 + 고정 문장 + 원문 미노출」을 추가한다.
  2. **[주의] 「일부만 반영」 문구 중복**: `jam-web/src/lib/admin/mission-bulk.ts:105`의 `applyMissionShow`는 `일부만 반영됐어요. 반영 실패: ${secondError} / 되돌리기 실패: ${revert.error}`를 조립한다. 헬퍼가 긴 고정 문장을 돌려주면서 두 자리에 같은 문장이 반복되고 원인 구분이 사라진다. 조립 방식을 정리하고, 실제 헬퍼 문장으로 만든 결과 문구를 `mission-bulk.test.ts`로 고정한다(지금은 손으로 만든 짧은 문자열만 넣는다).
  3. **[주의] PATCH의 null 본문**: `itembooks/[id]` PATCH(`route.ts:92`)와 `missions/[id]` PATCH(`route.ts:24`)는 본문이 JSON `null`이면 여전히 500이다(PUT·`today` PATCH에만 400 검사가 들어갔다). 잘못된 JSON 문법(`req.json()` 예외)도 두 파일 모두 처리하지 않는다. `req.json()` 뒤 null 검사 없이 `body.`를 읽는 다른 라우트(`badges/[id]/assign`, `badges/bulk`, `itembooks/[id]/drop-exclude`, `missions/route.ts` 등)도 같은 구조라 공용 파싱 헬퍼로 정리할지 정한다.
  4. **[참고]** `PARTIAL_ERROR_MESSAGE`는 「반영된 항목을 확인한 뒤」라고 안내하지만 라우트가 실패 응답에서 `updatedIds`를 버려 어떤 항목이 반영됐는지 화면에 전달되지 않는다(이전에도 같았다). `poi/[id]`는 이 헬퍼를 호출하지 않는다(주석에만 언급).
- 관련 파일: `jam-web/src/lib/admin/bulk/server.ts`, `jam-web/src/lib/admin/mission-bulk.ts`, `jam-web/src/lib/admin/__tests__/mission-bulk.test.ts`, `jam-web/src/app/api/admin/{tribes,today,missions,poi,itembooks}/bulk/route.ts`, `itembooks/[id]/route.ts:92`, `missions/[id]/route.ts:24`

## 완료 조건

- 위 (1)~(3)이 테스트로 고정되고 `scripts/verify.sh`가 통과한다. (4)는 알림 방식을 정한 뒤 별도로 다룬다.

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
