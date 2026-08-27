---
id: 20260827_012
category: API
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [API] 배지 관리 API DELETE·PATCH 핸들러 존재하지 않는 id 처리 불일치 수정

## 배경 / 문제 정의
티켓 20260827_011에서 `jam-web/src/app/api/admin/badges/[id]/route.ts`의 PUT 핸들러에
select-후-병합 패턴을 적용하며, 존재하지 않는 id에 대해 `{ error: '배지를 찾을 수 없습니다.' }`
404를 반환하도록 고쳤다. 이 개선 리뷰에서 같은 파일의 DELETE·PATCH가 여전히 서로 다르고
PUT과도 불일치한다는 점이 범위 밖 발견물로 지적됐다.

현재 상태(origin/staging 기준 실제 라인):
- **DELETE**(93-109행): select 없이 바로 `update({ deleted_at: ... }).eq('id', id)`만 실행한다.
  Supabase는 매칭 0건에 대해 별도 에러를 주지 않으므로, 존재하지 않는 id로 호출해도 조용히
  `{ ok: true }`를 반환한다 — 실제로는 아무것도 삭제되지 않았는데 성공한 것처럼 보인다.
- **PATCH**(117-146행, 목록/상세 화면 즉시 활성/비활성 토글): `.select().single()`로 조회하지만,
  존재하지 않는 id면 Supabase의 raw 에러 메시지가 그대로 500으로 노출된다
  (138행 `{ error: error.message }`). 사용자 친화적인 404가 아니다.
- **PUT**(7-85행, 이미 수정 완료): select-후-병합 패턴으로 명확한 404를 반환한다. 이 패턴을
  DELETE·PATCH에도 동일하게 적용한다.

## 상세 요구사항

### 서비스/코드베이스 관점
- **DELETE**: update 실행 전에 `select('id').eq('id', id).single()` (또는 PUT과 동일하게
  `select('*')`)로 존재 여부를 확인한다. `error || !data`면 `{ error: '배지를 찾을 수 없습니다.' }`
  404를 반환하고, 이 경우 `invalidateUnclaimedDrops` 호출도 일어나지 않도록 한다(404 반환 후
  update·무효화 로직에 도달하지 않게 순서 배치). 존재가 확인된 이후의 update·
  `invalidateUnclaimedDrops(supabase, [id], 'admin badges DELETE')` 호출 흐름은 그대로 유지한다.
- **PATCH**: 기존에 이미 `.update(...).select().single()`로 조회하고 있으므로, 그 결과의
  `error || !data`를 raw 500 대신 `{ error: '배지를 찾을 수 없습니다.' }` 404로 변환한다.
  단, PATCH는 현재 update-후-select 패턴이라 존재하지 않는 id여도 update 자체(무매칭)는 이미
  실행된 뒤 select만 실패하는 구조다 — `active: false` 방향일 때의
  `invalidateUnclaimedDrops(supabase, [id], 'admin badges PATCH')` 호출(146행 부근)이 404
  반환 이후에 실행되지 않도록, 404 조기 반환을 무효화 호출보다 먼저 배치한다. (PUT·factions
  패턴처럼 update 이전에 별도 select로 존재를 먼저 확인하는 방식으로 바꿔도 무방하다 — 셋 중
  더 간결하고 기존 로직 변경이 적은 쪽을 택할 것.)
- 에러 메시지 문구는 PUT과 동일하게 `'배지를 찾을 수 없습니다.'`로 통일한다.
- 참고 패턴: `jam-web/src/app/api/admin/factions/[id]/route.ts` GET(6-15행)의
  `select('*').eq('id', id).single()` 후 `error || !data`면 `'세계관을 찾을 수 없습니다.'` 404
  반환하는 짧은 패턴, 그리고 이번 PUT(20260827_011)의 select-후-병합 구조.

### UI/UX 관점
- 에러 메시지 문구는 PUT과 동일한 톤(`'OO를 찾을 수 없습니다.'`)으로 통일 — 신규 문구 작성 아님.

### 컨텐츠 관점
- 해당 없음

## 구현 계획
DELETE·PATCH 각각에 존재 여부 확인 후 404를 반환하는 로직을 추가하되, 두 핸들러 모두
`invalidateUnclaimedDrops` 연쇄 호출이 존재하지 않는 id에서는 절대 실행되지 않도록 순서를
배치한다. PUT의 select-후-병합 패턴을 그대로 재사용할 수 있으나, DELETE·PATCH는 병합할 필드가
없으므로(단순 update) select는 존재 확인 용도로만 쓰면 된다. 구현 후 존재하지 않는 id로
DELETE·PATCH 호출 시 404가 반환되는지, 존재하는 id에 대한 기존 동작(소프트 삭제·토글·드랍
무효화)이 회귀 없이 그대로인지 확인한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`jam-web/src/app/api/admin/badges/[id]/route.ts`의 DELETE·PATCH 핸들러에 PUT(20260827_011)과
동일한 톤의 404 처리를 추가했다.

- **DELETE**: update 실행 전에 `select('id').eq('id', id).single()`로 존재 여부를 확인하는
  단계를 새로 추가했다. `fetchError || !existing`이면 update·`invalidateUnclaimedDrops` 호출
  이전에 `{ error: '배지를 찾을 수 없습니다.' }` 404를 즉시 반환한다. 존재가 확인된 이후의
  update·무효화 흐름은 변경하지 않았다.
- **PATCH**: 기존 update-후-select 구조는 그대로 유지하고(티켓이 제시한 두 방식 중 "기존 로직
  변경이 적은 쪽"을 택함), select 결과의 `error || !data`를 raw 500 대신
  `{ error: '배지를 찾을 수 없습니다.' }` 404로 변환했다. 이 404 반환이
  `invalidateUnclaimedDrops(supabase, [id], 'admin badges PATCH')` 호출보다 코드상 먼저
  배치되어 있어(404 시 함수가 그 지점에서 반환), 존재하지 않는 id에서는 무효화 호출에 도달하지
  않는다. update 자체는 무매칭으로 여전히 실행되지만(부작용 없는 no-op), 이는 티켓 본문이
  명시적으로 허용한 범위다.
- 에러 문구는 PUT과 동일하게 `'배지를 찾을 수 없습니다.'`로 통일했다.

### 변경된 파일
```
jam-web/src/app/api/admin/badges/[id]/route.ts
```

### 테스트 결과
- [x] `npx tsc --noEmit -p .` — 프로젝트 전체 에러 없음 (worktree에 node_modules 존재, 심볼릭
      링크 조치 불필요)
- [x] `npx eslint src/app/api/admin/badges/\[id\]/route.ts` — 경고/에러 없음
- [ ] 로컬 실행 환경(Supabase 접속)이 없어 실제 DELETE·PATCH 요청(존재하지 않는 id → 404,
      존재하는 id → 기존 동작 유지) 수동 호출 테스트는 미실시 — PUT(20260827_011)과 동일한
      select-확인 패턴이라 회귀 위험 낮음으로 판단.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

새로 노출되는 텍스트는 PUT에서 이미 쓰던 `'배지를 찾을 수 없습니다.'`를 그대로 재사용한 것으로,
신규 문구 작성은 아니다.

- [x] 용어 일관성: 고정 용어("배지") 사용, PUT·factions·item_books와 동일 문구
- [x] 톤앤매너: 오류=전문적·간결한 톤
- [x] 에러 메시지: 어드민 내부 API 오류로 [현상]만으로 충분한 짧은 케이스(기존 패턴과 동일)
- [x] 문장 규칙: 해요체(합니다체 통일 기존 패턴 유지), 마침표 정확
- [ ] 표기 규칙: 해당 없음 (날짜/시간/금액/기간 텍스트 아님)

### 주요 의사결정 / 핵심 메모
- **작업 브랜치 재분기**: 최초 배정된 세션 브랜치(`claude/gifted-swirles-483082`)가 티켓
  20260827_011의 origin/staging 병합 이전 시점에서 분기되어 있어, PUT이 아직 select-후-병합
  패턴으로 고쳐지지 않은 구버전 파일을 대상으로 작업이 시작됐다. 절대 규칙 5(review 브랜치는
  반드시 origin/staging 기점 분기)에 따라 구버전 파일에 가한 편집을 되돌리고
  `git fetch origin staging && git checkout -b claude/jamwork-20260827_012-badges-delete-patch-404
  origin/staging`로 다시 분기한 뒤, 011 반영이 포함된 최신 파일에 동일한 수정을 재적용했다.
- PATCH는 티켓이 제시한 두 옵션(기존 update-후-select 패턴에서 에러 변환만 하는 방식 vs
  PUT/factions처럼 update 이전에 별도 select로 먼저 확인하는 방식) 중 전자를 택했다 — 코드
  변경이 더 작고, update 자체가 무매칭 no-op이라 부작용이 없다.

### 잔여 이슈
- 없음
