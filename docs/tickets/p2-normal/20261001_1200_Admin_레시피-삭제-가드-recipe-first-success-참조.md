---
id: "20261001_1200"
category: Admin
priority: P2
status: CLOSED
created: 2026-10-01
closed: 2026-10-01
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

- `collectRecipeReferences`(`lib/admin/recipe-references.ts`)가 삭제 표시 없는 배지 중 `condition_json->recipe_first_success->>recipe_id`가 대상 레시피인 것을 센다(80개씩 분할, count head).
  입력 id는 소문자로 맞춘다(주소로 대문자 uuid가 들어와도 text 비교가 놓치지 않게).
- 1개 이상이면 단건 DELETE는 409, 일괄 삭제는 건너뜀 사유로 막는다. 거부 문구는 `recipeDeleteBlockedMessage` 한 곳(「삭제할 수 없어요. 이 레시피를 가리키는 배지가 N개 있어요…」).
  조회가 실패하면 삭제를 막는다(fail-closed 유지). 화면 코드는 바뀌지 않았다(일괄 미리보기가 `skipped[].reason`을 그대로 보여 준다, 단건 DELETE를 부르는 화면은 없다).
- `user_combine_success_logs.recipe_id`는 FK 없음이 의도라 세지 않는다. 02_DATA_MODEL에 「삭제 가드」 단락을 더했다.

### 변경된 파일
```
jam-web/src/lib/admin/recipe-references.ts
jam-web/src/lib/admin/recipe-bulk.ts
jam-web/src/app/api/admin/recipes/[id]/route.ts
jam-web/src/lib/admin/__tests__/recipe-references.test.ts (신규)
jam-web/src/lib/admin/__tests__/recipe-list.test.ts
jam-web/src/app/api/admin/recipes/[id]/__tests__/route.test.ts (신규)
docs/specs/prd/02_DATA_MODEL.md
```

### 테스트 결과
- [x] 신규 14건: `recipe-references.test.ts` 10건(집계·경로·`deleted_at`, 0건, 빈 목록, 80개 분할 합산, 조회 실패 fail-closed, 일괄 후보·건너뜀, 문구, 대문자 id 정규화),
  `[id]/__tests__/route.test.ts` 4건(0건 삭제, 409+문구+삭제 미실행, 조회 실패 500+삭제 미실행, 404).
- [x] CI `verify` 통과(1차 run 36810690025, 패치 run 36812052691), 패치 push의 pre-push verify 전 항목 통과.
- [x] 실제 DB 조회 모양 확인(2026-10-01, 읽기 전용): 같은 모양(`.is('deleted_at', null).in('condition_json->cross_between_axis->>min_rarity', [...])`, count head)의
  supabase-js 조회가 72건을 돌려줘 SQL 집계 72건과 같았다. `recipe_first_success` 배지가 라이브에 0개라 그 키로는 확인하지 못했다(잔여 이슈).

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

해당없음: 어드민 화면 문구라 가이드 §4.0의 적용 대상이 아니다. 거부 문구는 해요체로 맞췄다.

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: (프로덕션 미배포, staging 머지 2026-10-01)
- 환경: staging
- 커밋: 리뷰 브랜치 `claude/jamwork-20261001_1200-recipe-delete-guard`(5e0a404e1..41bc86c8f), staging 머지 0d2cb21f1

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 2 | 149,421 | 25,337 / 20,030 | 13분 1초 | 69 |
| 게이트만 재실행 | 1 | 41,404 | 0 / 6,847 | 4분 7초 | 12 |
| 합계 | 3 | 190,825 | 25,337 / 26,877 | 17분 8초 | 81 |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

- 1차 게이트 WARN 사유 3개: ① `recipe-references.ts:156` 낡은 「인바운드 참조 없음」 주석 ② 대문자 uuid로 단건 DELETE를 부르면 text 비교인 가드가 0건으로 셀 수 있음
  ③ 실제 DB 매칭 미확인. 사용자가 「작은 패치 후 머지」를 골랐다(2026-10-01). 카리나가 ①·②를 직접 고치고(코드 5줄, 테스트 9줄. 테스트 때문에 `gateOnly` 기준 10줄을 넘었지만
  새 로직 판단이 없어 이 경로를 유지했다) 게이트만 재실행했다. 재판정 WARN의 남은 사유는 ③ 하나였고, 머지 전에 같은 모양의 조회로 라이브에서 확인했다(테스트 결과 3번째 줄).
- 문구는 어드민 기존 격식체(「삭제할 수 없습니다…건」) 대신 티켓의 해요체로 바꿨다. UX 가이드 §4.0은 어드민 라우트를 적용 대상에서 뺀다(아현 가정).
- 재판정의 `[참고/정합성]`(`BADGE_RECIPE_ID_PATH` 주석이 「`badge-list-query.ts`와 같은 표기」라고 잘못 적음)은 머지 뒤 카리나가 주석 한 줄을 실측 근거로 고쳤다(경미 수정).
- 범위 밖 발견물(1차 게이트): P3 20261001_1245(배지 조건 레시피 id 대소문자 정규화), 20261001_1246(일괄 삭제 반복 조회), 20261001_1247(마이그레이션 200 주석).
- 어드민 실렌더 검증은 생략했다. 화면 코드 변경이 없다.

### 잔여 이슈
- 첫 `recipe_first_success` 배지가 생기면(1500 또는 첫 JAM! 배지 오픈) 그 레시피의 일괄 삭제 `dry_run`이 「배지 1개」로 막히는지 한 번 확인한다.
