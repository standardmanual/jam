---
id: "20261001_1200"
category: Admin
priority: P2
status: OPEN
created: 2026-10-01
closed:
parent: "20260930_1450"
---

# [Admin] 레시피 삭제 가드가 JAM! 배지의 `recipe_first_success` 참조를 센다

> 상위: 20260930_1450 · 영향 티켓(진행 규칙 4) · 1458 시작 검토 D6에서 발견 · 20261001_1158(레시피 예약 취소)보다 먼저 한다

## 핵심 요약

- 요구사항: 티켓 20261001_0631(마이그레이션 199·200)부터 배지 조건 `recipe_first_success.recipe_id`가 레시피를 가리킨다. 그런데 레시피 삭제 가드
  (`lib/admin/recipe-references.ts`)는 「레시피를 가리키는 참조는 없다」(항상 0건)로 동작한다. 운영자가 그 레시피를 지우면(단건·일괄) 아무도 얻을 수 없는 JAM! 배지가 남는다.
  1458-②의 「예약 취소 = 삭제」와 1500의 연결 항목 되돌림이 이 가드를 지나므로 먼저 막는다. 라이브에는 해당 배지가 0개다(2026-10-01 조회). 지금 피해는 없다.
- 구현 계획: 가드가 `badges.condition_json->'recipe_first_success'->>'recipe_id'`로 레시피를 가리키는 배지(삭제 표시 안 된 것)를 세고, 1개 이상이면 삭제를 막고 「이 레시피를 가리키는
  배지가 N개 있어요」를 보여 준다. 조회가 실패하면 삭제를 막는다(fail-closed 계약 유지). `user_combine_success_logs.recipe_id`는 FK가 없는 것이 의도(`200_user_combine_success_logs.sql:40-41`)라
  가드 대상이 아니다.
- 관련 파일:
  - `jam-web/src/lib/admin/recipe-references.ts`(머리 주석 7-8, 39, 56-65 `collectRecipeReferences`)
  - `jam-web/src/app/api/admin/recipes/[id]/route.ts:13-51`(단건 DELETE)
  - `jam-web/src/app/api/admin/recipes/bulk/route.ts:35-45`(일괄 삭제)
  - `jam-web/src/lib/admin/badge-validation.ts:87-113`(`recipe_first_success` 형식 검증, 키 모양 참고)
  - `jam-web/src/lib/badge-engine/jamActionBadges.ts:115-120,237`(조건 읽기 참고)
  - 문서 `docs/specs/prd/02_DATA_MODEL.md`(레시피 삭제 가드 서술)

## 완료 조건

- `recipe_first_success.recipe_id`가 가리키는 레시피는 단건·일괄 삭제가 막히고, 응답과 화면에 「이 레시피를 가리키는 배지가 N개 있어요」가 나온다(테스트).
- 가드 조회가 실패하면 삭제를 막는다(테스트).
- `recipe-references.ts` 머리 주석과 02_DATA_MODEL 서술이 바뀐 사실과 맞는다.
- 유형은 `admin`, 경로 ③(표준). 약 5개 파일·100줄 안팎(혜린 추정)이라 계획 반환 기준 근처다. 넘으면 이 「관련 파일」을 계획으로 면제한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-
