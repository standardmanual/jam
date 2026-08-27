---
id: 20260827_011
category: API
status: OPEN
created: 2026-08-27
closed:
---

# [API] 배지 수정 API 부분 body PUT 시 필드 null/기본값 덮어쓰기 버그 수정

## 배경 / 문제 정의
`jam-web/src/app/api/admin/badges/[id]/route.ts`의 PUT 핸들러가 body에 없는(undefined) 필드를
`?? null`/`?? 기본값`으로 조용히 강제 덮어쓴다. 부분 body로 PUT을 호출하면 기존 값이 사라진다.
동일 패턴 버그가 세계관(티켓 20260827_005)과 아이템북(티켓 20260827_009) PUT에서도 발견돼
이미 수정됐다 — 배지 PUT만 아직 남아 있다.

추가로 이 PUT은 **존재하지 않는 id에 대한 404 처리가 아예 없다** — select 없이 바로 update한다.
factions·item_books는 이미 select 후 병합하며 404를 반환하도록 고쳐졌다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `faction_id ?? null`(40행), `item_book_id ?? null`(41행), `drop_weight ?? 1.0`(42행),
  `valid_from ?? null`(43행), `valid_until ?? null`(44행), `background_color ?? null`(46행),
  `background_shader_id ?? null`(47행)을 `body.field !== undefined ? body.field : existing.field`
  병합 패턴으로 교체한다 (factions·item_books와 동일 패턴).
- update 전에 `select('*').eq('id', id).single()`로 기존 row를 조회 → 없으면
  `{ error: '배지를 찾을 수 없습니다.' }`로 404 반환. `existing`은 Supabase 타입 추론 문제
  (TS2339) 회피를 위해 `jam-web/src/types/database.ts`의 `BadgeRow`로 명시 타입 단언한다.
- **`condition_json`(39행)** — `type === 'checkin' ? null : condition_json`의 조건부 강제 null
  로직은 유지한다. 단, `type`과 `condition_json` 각각을 먼저 undefined-병합(body 값 우선,
  없으면 existing)한 뒤 그 병합된 값에 조건부 로직을 적용한다. 조건부 로직 자체를 단순 병합으로
  대체하지 않는다.
- **`point_reward`(45행)** — `BadgeForm.tsx:374`(`Math.max(0, parseInt(pointReward, 10) || 0)`)를
  확인한 결과 프론트는 이 PUT의 유일한 호출자이고 항상 계산된 정수를 채워 보낸다(undefined로
  보내지 않음). 따라서 다른 필드와 동일하게
  `body.point_reward !== undefined ? Math.max(0, Math.trunc(Number(body.point_reward) || 0)) : existing.point_reward`
  형태로 병합해도 BadgeForm 호출 경로에는 영향이 없다. 부분 body 방어 차원에서 동일 패턴 적용.
- **`background_image_url`/`background_video_url`(51-52행)** —
  `BadgeForm.tsx:328-378`을 확인한 결과, 프론트는 배경 3모드(단색/정적 제너레이터/애니메이션
  제너레이터) 정리를 이미 클라이언트에서 마치고, 제너레이터 모드에서 이번 세션에 새 이미지를
  올리지 않은 경우에도 `badge?.background_image_url ?? null`로 기존 값을 명시적으로 채워 보낸다
  (335-356행) — 즉 이 두 필드도 undefined로 보내지 않는다. 따라서 다른 필드와 동일한
  `body.field !== undefined ? body.field : existing.field` 병합 패턴을 적용해도 무방하다.
  기존 20260819_012 설계 주석("정리 책임은 BadgeForm에 있다")은 유지하되, undefined 부분 body
  방어를 추가하는 것으로 보완한다.
- 위 병합 패턴 적용 후에도 `image_url`(34행), `activity_types`(35행), `patch_available`(36행),
  `patch_price_krw`(37행) 등 원래 `?? null` 없이 그대로 대입되던 필드들도 undefined 시 기존값이
  사라지는 동일한 부분 body 문제가 있는지 함께 점검하고, 있다면 동일 병합 패턴을 적용한다.

### UI/UX 관점
- 해당 없음 (API 내부 로직 수정, 사용자 노출 텍스트 변경은 404 에러 메시지 문구뿐이며
  factions/item_books와 톤 일치)

### 컨텐츠 관점
- 해당 없음

## 구현 계획
`jam-web/src/app/api/admin/factions/[id]/route.ts` PUT(티켓 20260827_005)과
`jam-web/src/app/api/admin/itembooks/[id]/route.ts` PUT(티켓 20260827_009)의 select-후-병합
패턴을 그대로 적용하되, 위에 명시한 badges 전용 3개 필드(condition_json 조건부 로직,
point_reward 숫자 변환, background 상호배타 필드)는 병합 패턴과 기존 특수 로직을 조합해서
처리한다. 구현 후 로컬에서 부분 body PUT(예: `{ name: '변경' }`만 전송)으로 다른 필드가
유지되는지, 존재하지 않는 id로 PUT 시 404가 나는지 확인한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`factions`(20260827_005)·`item_books`(20260827_007) PUT과 동일한 select-후-병합 패턴을
`badges` PUT에 적용했다.

- update 전 `select('*').eq('id', id).single()`로 기존 row를 조회 → 없으면
  `{ error: '배지를 찾을 수 없습니다.' }` 404 반환 (기존엔 select 없이 바로 update).
  `existing`은 `BadgeRow`로 명시 타입 단언.
- `name·description·rarity·image_url·activity_types·patch_available·patch_price_krw`(원래
  `?? null` 없이 그대로 대입되던 필드) 포함 모든 필드를 `body.field !== undefined ?
  body.field : existing.field` 병합 패턴으로 교체.
- `type`·`condition_json`은 먼저 각각 undefined-병합(body 우선, 없으면 existing)한 뒤,
  그 병합된 값에 기존 조건부 강제 null 로직(`type === 'checkin' ? null : conditionJson`)을
  적용 — 조건부 로직 자체는 그대로 유지. 사전 검증(`findCumulativeConditionError`,
  `findUnknownConditionKeyError`)도 병합된 `type`/`conditionJson`을 사용하도록 함께 정리.
- `point_reward`는 `body.point_reward !== undefined ? Math.max(0, Math.trunc(Number(...) ||
  0)) : existing.point_reward` 형태로 병합 (BadgeForm.tsx가 유일 호출자이고 항상 계산된
  정수를 보내 기존 동작에 영향 없음).
- `background_image_url`/`background_video_url`도 동일 병합 패턴 적용. 20260819_012 설계
  주석("정리 책임은 BadgeForm에 있다")은 유지.
- DELETE·PATCH(즉시 토글) 핸들러는 티켓 범위 밖이라 손대지 않음.

### 변경된 파일
```
jam-web/src/app/api/admin/badges/[id]/route.ts
```

### 테스트 결과
- [x] `npx tsc --noEmit`으로 타입 검증 — 대상 파일 포함 프로젝트 전체 에러 없음
      (worktree에 node_modules가 없어 메인 체크아웃의 node_modules를 임시 심볼릭 링크로
      연결해 검증 후 즉시 제거 — 커밋에는 포함되지 않음).
- [ ] 로컬 실행 환경(Supabase 접속)이 없어 실제 PUT 요청(부분 body 유지·404) 수동 호출
      테스트는 미실시 — factions/item_books와 동일 패턴이라 회귀 위험 낮음으로 판단.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

새로 추가된 노출 텍스트는 404 에러 메시지 `'배지를 찾을 수 없습니다.'` 하나뿐이며
factions(`'세계관을 찾을 수 없습니다.'`)·item_books(`'아이템북을 찾을 수 없습니다.'`)와
동일한 어투·구조로 맞췄다.

- [x] 용어 일관성: 고정 용어("배지") 사용
- [x] 톤앤매너: 오류=전문적·간결한 톤
- [x] 에러 메시지: 어드민 내부 API 오류로 [현상]만으로 충분한 짧은 케이스(factions/item_books와 동일 패턴)
- [x] 문장 규칙: 해요체(합니다체 통일 기존 패턴 유지), 마침표 정확
- [ ] 표기 규칙: 해당 없음 (날짜/시간/금액/기간 텍스트 아님)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- 사전 검증 함수(`findCumulativeConditionError`, `findUnknownConditionKeyError`)를 병합된
  `type`/`conditionJson`으로 호출하도록 함께 정리했다. 티켓 본문은 update 페이로드의 조건부
  강제 null 로직만 명시했지만, 병합 이전의 raw body 값으로 검증하면 `type`만 빠진 부분
  body에서 검증이 무력화되는 동일 계열 버그가 남기 때문에 일관되게 병합값을 쓰는 쪽을
  선택했다. BadgeForm.tsx가 유일 호출자이고 항상 전체 필드를 보내 현재 동작 변화는 없다.
- `image_url`/`activity_types`/`patch_available`/`patch_price_krw`(원래 `?? null` 없이 그대로
  대입되던 필드)는 JSON.stringify가 `undefined` 값 키를 자동으로 드롭하는 JS 동작 때문에
  엄밀히는 기존에도 부분 body 시 컬럼이 아예 update 페이로드에서 빠져 기존값이 보존됐다(실질
  버그는 없었음). 다만 factions/item_books 수정 PR이 이런 필드들도 모두 명시적 병합 패턴으로
  통일했던 선례를 따라 badges도 동일하게 전체 필드를 병합 패턴으로 맞춰 일관성과 방어적
  명확성을 확보했다.

### 잔여 이슈
- 없음
