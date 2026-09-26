---
id: "20260926_1512"
category: API
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260926_1509"
  - "20260926_1455"
  - "20260926_1456"
---

# [API] 입력 검증 보강 묶음: 어드민 GET id의 UUID 검증(1509), `itembooks`·`today`의 `image_url` 400(1455), 프리셋 `layers` 비객체 원소 400(1456 일부)

> 하위 티켓들을 한 번의 구현·게이트·병합으로 처리하기 위한 묶음 티켓이다(사용자 지시, 2026-09-26). 끝나면 하위 티켓도 함께 닫는다. **각 하위 티켓의 본문이 세부 기준이다. 아래 표는 파일 단위 실행 범위다.**

## 핵심 요약

- 요구사항: (1) `GET /api/admin/content-corpus`의 `tribeIds`·`itemBookIds`·`badgeIds`와 `GET /api/admin/asset-generator/presets/[id]`의 `id`를 UUID 형식으로 검증해 틀리면 DB 조회 전에 400으로 거절하고, DB 오류 원문은 고정 한국어 문장으로 바꾼다(티켓 20260926_1509, 2026-09-26 프로덕션 런타임 오류 `invalid input syntax for type uuid: "3"`의 원인). (2) `itembooks/[id]`·`today/[id]`에도 `imageUrlTypeError` 400 검사를 붙인다(티켓 20260926_1455). (3) 프리셋 POST의 `layers` 배열에 객체가 아닌 원소가 있으면 400으로 거절한다(티켓 20260926_1456 (1)).
- **하지 않는 것 (결정, 근거 기록)**: 티켓 20260926_1456 (2) "`apply`의 컬럼 갱신 실패 시 올라간 파일 정리"는 구현하지 않는다. `apply`는 `upsert: true`로 **같은 경로**에 올리므로(`apply/route.ts:167,174`) 정리를 위해 지우면 방금 덮어쓴 **기존에 쓰이던 이미지까지 함께 사라질 수 있다**. 재시도하면 덮어쓰는 현재 동작이 더 안전하다. 이 결정과 근거를 하위 티켓 1456의 완료 기록에 적는다. `assetUrl` 외부 URL 저장(티켓 1509의 참고)도 이번에 하지 않고 결정만 기록한다(어드민 전용, 악용 가능성 낮음).
- 관련 파일: `jam-web/src/app/api/admin/content-corpus/route.ts`(`parseIds`, 42행 부근), `jam-web/src/app/api/admin/asset-generator/presets/[id]/route.ts:14-27`(GET), `presets/route.ts:110`, `jam-web/src/app/api/admin/itembooks/[id]/route.ts`, `today/[id]/route.ts`, `jam-web/src/lib/admin/imageSourceReset.ts`(`imageUrlTypeError`), `jam-web/src/lib/admin/export-ids.ts`(UUID 정규식).

## 구현 계획

### 파일 단위 계획 (규모 사전 판정, 2026-09-26)

| # | 파일 | 하는 일 | 예상 줄 수 |
|---|---|---|---|
| 1 | `jam-web/src/lib/admin/uuid.ts` (신규), `export-ids.ts` | `isUuid(value)`를 만들고 `export-ids.ts`가 같은 정규식을 이 함수로 쓰게 한다(정규식 한 곳). `export-ids.ts`의 동작은 바꾸지 않는다 | 약 15 |
| 2 | `content-corpus/route.ts`(`parseIds`) | UUID 아닌 값이 있으면 400 고정 한국어 문장. 오류 응답의 DB 원문은 고정 문장으로 바꾸고 원문은 `console.error`로 | 약 20 |
| 3 | `content-corpus/__tests__/route.test.ts` (기존) | UUID 아닌 `tribeIds=3` → 400·DB 미호출, 정상 UUID 목록 유지, DB 오류 시 원문 미노출 | 약 45 |
| 4 | `presets/[id]/route.ts`(GET) | `id` 형식 검증 400, 오류 문장 고정 | 약 12 |
| 5 | `presets/[id]/__tests__/route.test.ts` (기존) | GET의 형식 오류 400·DB 미호출, 정상 | 약 30 |
| 6 | `itembooks/[id]/route.ts`, `today/[id]/route.ts` | `badges/[id]`·`missions/[id]`와 같은 방식으로 `imageUrlTypeError` 400 (진입부) | 각 약 8 |
| 7 | `itembooks/[id]/__tests__/route.test.ts`, `today/[id]/__tests__/route.test.ts` (신규) | 비문자열 `image_url` → 400, 정상 수정 유지 | 각 약 45 |
| 8 | `presets/route.ts:110`, `presets/__tests__/route.test.ts` | `layers` 원소가 객체가 아니면 400, 테스트 추가 | 약 25 |

- 예상 합계 약 270줄, 변경 파일 약 12개라 100줄·5파일 기준을 넘긴다. 위 파일이 라우트 단위로 적혀 있으므로 `planOnlyWaiver`로 첫 호출부터 면제한다. DB와 스토리지는 스텁으로만 다루고 실제 조회는 하지 않는다. 어드민 라우트라 실렌더는 시도하지 않는다.

## 완료 조건

- 형식이 틀린 id·후보 ID 목록이 `content-corpus`와 프리셋 단건 조회에서 400이고 DB에 닿지 않는다. `itembooks`·`today`에서 비문자열 `image_url`이 400이다. 비객체 `layers` 원소가 400이다(단위 테스트). `export-ids.ts`의 기존 테스트가 그대로 통과한다. `scripts/verify.sh` 통과.

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
