---
id: 20260827_009
category: API
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [API] 아이템북 수정 API 부분 body 필드 null 덮어쓰기 버그 수정

## 배경 / 문제 정의
`PUT /api/admin/itembooks/[id]`(`jam-web/src/app/api/admin/itembooks/[id]/route.ts:6-23`)는 요청
body를 구조분해한 뒤 `image_url ?? null` / `faction_id ?? null` / `story_text ?? null` /
`background_color ?? null` / `background_shader_id ?? null` / `background_image_url ?? null` /
`background_video_url ?? null` 패턴으로 update 페이로드를 구성한다. 이 7개 필드는 body에 아예
없어도(= `undefined`) `null`로 강제 변환되어 Supabase update 페이로드에 명시적으로 포함되므로,
**부분 body로 호출하면 해당 필드가 조용히 사라진다.**

추가로 `is_active`는 `is_active ?? true`로 처리된다(15행) — body에 `is_active`가 없으면
기존 값이 `false`(비활성화 상태)였더라도 `true`로 강제 복원된다. 이 역시 부분 body 호출 시
의도치 않은 덮어쓰기다.

(`name`/`description`/`required_activity_badge_id`/`reward_badge_id`는 `?? null`이 없어
`undefined`인 채로 update 객체에 들어가고, `JSON.stringify`가 `undefined` 키를 드롭하므로 실제로는
영향받지 않는다 — 티켓 20260827_005의 factions 사례와 동일한 메커니즘.)

동일한 패턴의 버그가 `PUT /api/admin/factions/[id]`에도 있었고 티켓 20260827_005에서 이미
수정됐다(커밋 `9d7ccfd1`). 그 티켓 완료 기록의 "잔여 이슈"에 item_books PUT이 동일 버그를 가진
채 남아있다는 sideFinding이 기록돼 있었고, 이 티켓이 그 후속 작업이다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `PUT /api/admin/itembooks/[id]`가 body에 없는 필드는 기존 DB 값을 유지하도록 수정한다.
  - 방향: update 이전에 기존 row를 `select('*').eq('id', id).single()`로 먼저 조회하고, 각 필드를
    `body.field !== undefined ? body.field : existing.field` 패턴으로 병합해 update한다(factions
    PUT과 동일 패턴). 존재하지 않는 id면 update 시도 전에 404로 응답한다.
  - 병합 대상 필드: `name, description, image_url, required_activity_badge_id, reward_badge_id,
    faction_id, story_text, is_active, background_color, background_shader_id,
    background_image_url, background_video_url` (12개 전체 — undefined-drop 묵시적 동작에 기대지
    않고 일관되게 처리, factions 티켓과 동일 원칙).
  - `existing`은 `jam-web/src/types/database.ts`의 `ItemBookRow`로 명시 타입 단언한다
    (factions 티켓에서 확인된 Supabase 타입 추론 문제 — `select` 반환이 `never`로 좁혀져
    `existing.필드` 접근이 TS2339를 내는 것을 회피하기 위함).
- `PATCH /api/admin/itembooks/[id]`(51-89행, `is_active` 단일 필드 즉시 토글 전용)는 건드리지
  않는다 — 이미 body에 `is_active`만 받는 좁은 계약이라 이번 버그와 무관하다.
- `POST /api/admin/itembooks`(신규 등록)가 있다면 이번 버그와 무관하다(신규 생성은 "기존 값 유지"
  개념이 없음) — 존재 여부만 확인하고 손대지 않는다.
- 이 PUT을 호출하는 프론트엔드(폼 등)가 이미 전체 필드를 채워 보내는지 확인한다(factions
  티켓에서 `FactionForm.tsx`를 회귀 확인한 것과 동일한 절차). 부분 body로 호출하는 곳이 있다면
  이번 수정으로 정상화되는지, 전체 필드 호출부라면 회귀 없는지 확인한다.

## 구현 계획
1. `route.ts`의 `PUT`에 기존 row 조회(`select('*').eq('id', id).single()`)를 추가하고, 404 처리
   후 update 페이로드를 12개 필드 전체에 대해 `body.field !== undefined ? body.field :
   existing.field` 병합으로 교체한다.
2. `existing`은 `ItemBookRow`로 명시 타입 단언한다.
3. `npx tsc --noEmit`, `npm run build`로 타입 오류 없는지 확인한다(factions 티켓 1차 게이트
   리뷰 FAIL 사유가 타입 오류였으므로 동일 실수 방지).
4. 이 PUT을 호출하는 프론트엔드 호출부를 확인해 회귀 여부를 점검한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `PUT /api/admin/itembooks/[id]`에서 update 이전에 기존 row를 `select('*').eq('id', id).single()`로
  먼저 조회하도록 추가했다. 조회 실패/없음이면 404(`아이템북을 찾을 수 없습니다.`)로 즉시 응답하고
  update를 시도하지 않는다(factions PUT과 동일 패턴, `existingData`를 `ItemBookRow`로 명시 타입
  단언한 `existing` 변수로 병합에 사용).
  - `name, description, image_url, required_activity_badge_id, reward_badge_id, faction_id,
    story_text, is_active, background_color, background_shader_id, background_image_url,
    background_video_url` 12개 필드 전부를 `body.field !== undefined ? body.field : existing.field`
    패턴으로 통일해 병합했다(티켓 지시대로 undefined-drop 묵시적 동작에 기대지 않음).
  - `is_active`는 별도 변수(`nextIsActive`)로 먼저 계산해 update 페이로드와 아래 캐스케이드
    비활성화 분기(`if (nextIsActive === false)`)에서 공유하는 기존 구조를 그대로 유지했다 —
    `is_active ?? true` → `body.is_active !== undefined ? body.is_active : existing.is_active`로만
    바꿨다.
- `PATCH /api/admin/itembooks/[id]`(is_active 단일 필드 즉시 토글 전용, 51→76행)는 티켓 지시대로
  건드리지 않았다.
- `POST /api/admin/itembooks`(신규 등록)를 확인했다 — 티켓 지시대로 존재만 확인하고 손대지 않았다.
- 프론트엔드 호출부를 확인했다:
  - `ItemBookForm.tsx`(`persist()`, 171-197행)는 이미 12개 필드 전부를 채워 body에 담아 PUT을
    호출하고 있어(변경 없음) 이번 PUT 병합 로직 변경으로 인한 회귀가 없다.
  - `ItemBookTable.tsx`의 `handleBulkDeactivate`(203-219행)는 `PUT`이 아니라 이미 `PATCH`(is_active
    단일 필드 토글)를 호출하고 있어 이번 변경과 무관하다.
  - `ItemBookActiveToggleButton.tsx`도 `PATCH`를 호출해 이번 변경과 무관하다.
  - 부분 body로 이 PUT을 호출하는 다른 곳은 발견되지 않았다.

### 변경된 파일
```
jam-web/src/app/api/admin/itembooks/[id]/route.ts
```

### 테스트 결과
- [x] `npx tsc --noEmit -p tsconfig.json` — 출력 0줄, exit code 0(타입 에러 0건).
- [x] `npx eslint "src/app/api/admin/itembooks/[id]/route.ts"` — 신규 lint 에러 0건.
- [x] `npm run build`(Storybook + Next.js production build) — exit code 0, 에러 0건. 빌드 로그에
      `No story files found` 경고가 있으나 `git stash`로 변경 전 상태에서도 동일하게 재현되는
      기존 이슈로, 이번 변경과 무관함을 확인했다.
- [ ] 실제 어드민 화면에서의 수동 PUT 호출 테스트는 수행하지 못했다(로컬 서버 미기동, DB 접근
      권한이 이 서브에이전트에 위임되지 않음 — 절대 규칙 3, 5). 로컬 테스트 방법은 요약 참조.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 신규 문구는 404 에러 메시지 `아이템북을 찾을 수 없습니다.` 하나뿐이며, 기존
      GET 계열 라우트(예: 세계관 PUT의 `세계관을 찾을 수 없습니다.`)와 동일한 어투·구조를 따랐다.
- [x] 톤앤매너: 관리자 도구 오류 메시지로 전문적인 톤 유지.
- [x] 에러 메시지: "아이템북을 찾을 수 없습니다."는 [현상] 단일 문장으로 충분한 단순 404 케이스 —
      기존 유사 패턴(factions GET/PUT)과 동일.
- [x] 문장 규칙: 해요체, 마침표 위치 정확.
- [x] 표기 규칙: 해당 없음(날짜/시간/금액/기간 문구 없음).

### 게이트 리뷰 / 개선 리뷰
- 게이트 리뷰 판정: WARN(코드 결함 아님 — 티켓 번호 충돌만 사유). 12개 필드 병합 패턴, 404 처리,
  `nextIsActive` 공유 구조, PATCH/DELETE/POST 미변경, 프론트엔드 호출부 회귀 없음, tsc/eslint
  통과를 모두 직접 재실행해 확인한 뒤 PASS에 준하는 결론이었다.
- 개선 리뷰 제안(참고용, 이번 티켓 범위에서는 미반영):
  - `select` 실패를 전부 404로 뭉뚱그리지 말고 조회 오류(네트워크/권한 등)와 "행 없음"을
    구분하는 것을 고려할 만하다.
  - factions·item_books 두 라우트에 동일한 "기존 row 조회 + 병합" 패턴이 반복 작성됐다 —
    세 번째로 같은 패턴을 쓰게 되면 공용 헬퍼(`mergePartialUpdate`)로 추출을 고려한다.
  - select→update 2단계 구조라 이론상 동시 편집 레이스가 있다 — 관리자 도구라 발생 빈도는
    낮지만, 실제 이슈가 보고되면 `updated_at` 비교 기반 낙관적 락을 검토한다.

### 배포 정보
- 배포일: 2026-08-27 (staging)
- 환경: staging (프로덕션 반영은 `/jam-ship`으로 별도 진행 — 사용자 명시 승인 필요)
- 커밋: `6c5cc65c` (origin/staging에 fast-forward push)

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.
- factions PUT(티켓 20260827_005)과 완전히 동일한 병합 패턴을 그대로 적용했다 — 새로운 설계
  판단은 없었다.
- `id !== undefined ? id : existing.id` 병합은 대상에서 제외했다 — `id`는 URL 경로 파라미터로만
  결정되고 update도 `.eq('id', id)`만 사용하므로 body의 `id` 필드는 애초에 무시된다(factions
  티켓과 동일 근거).
- **티켓 번호 재조정(2회)**: 최초 생성 시 로컬·origin/staging 확인 결과 `20260827_007`이 다음
  번호였으나, 구현 완료 후 게이트 리뷰 시점에 origin/staging에 이미 다른 내용(어드민 API HTTP
  메서드 표기 정정)으로 CLOSED 처리된 동일 번호 티켓이 먼저 병합돼 있어 `20260827_008`로
  재번호(커밋 `0ac69dde`)했다. staging 머지 직전 재확인에서 그 사이 또 다른 병렬 세션(인증
  미들웨어 publicPaths 접두어 오매칭 수정)이 `20260827_007→008`로 재번호해 먼저 병합한 것을
  발견해 재차 `20260827_009`로 재번호(커밋 `a7b087a2`)했다. 이후 `git merge origin/staging`으로
  review 브랜치를 최신화하고 tsc/eslint/build를 모두 재검증한 뒤 fast-forward push했다 — 티켓
  20260827_005의 003→005 재번호 사례와 동일한 패턴이 이번엔 2회 연속 발생했다.

### 잔여 이슈
- `badges/[id]/route.ts` PUT 핸들러(38-52행)에 이번 티켓과 동일한 버그 클래스가 남아있다
  (`faction_id ?? null` 등 다수 필드 + 존재하지 않는 id에 대한 404 처리 자체가 없음) —
  개선 리뷰에서 발견된 범위 밖 항목, 별도 작업 칩으로 분리함.
