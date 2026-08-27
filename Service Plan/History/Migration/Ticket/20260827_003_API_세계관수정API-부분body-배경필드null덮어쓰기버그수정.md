---
id: 20260827_003
category: API
status: OPEN
created: 2026-08-27
closed:
---

# [API] 세계관 수정 API 부분 body 배경 필드 null 덮어쓰기 버그 수정

## 배경 / 문제 정의
`PUT /api/admin/factions/[id]`(`jam-web/src/app/api/admin/factions/[id]/route.ts`)는 요청 body를
구조분해한 뒤 `background_color ?? null` / `background_shader_id ?? null` /
`background_image_url ?? null` / `background_video_url ?? null` 패턴으로 update 페이로드를
구성한다. 이 네 필드는 body에 아예 없어도(= `undefined`) `null`로 강제 변환되어 Supabase
update 페이로드에 명시적으로 포함되므로, **부분 body로 호출하면 배경 설정이 조용히 사라진다.**
(그 외 `name`/`tagline`/`drop_weight` 등은 `?? null`이 없어 `undefined`인 채로 update 객체에
들어가고, `JSON.stringify`가 `undefined` 키를 드롭하므로 실제로는 이 필드들만 영향받는다.)

이 버그는 티켓 20260826_015(어드민 shadcn Data Table 3단계b, 세계관 일괄 비활성화 기능 구현)
작업 중 발견됐다. 그 작업에서는 `FactionsTable.tsx`의 일괄 비활성화가 이미 서버에서 불러온
`FactionRow` 전체 필드를 그대로 스프레드해 `is_active`만 덮어써 보내는 방식으로 이 버그를
우회했다(`jam-web/src/app/admin/factions/FactionsTable.tsx:38-47`, `177-210`) — 즉 지금 세계관
화면의 일괄 액션 자체는 이 버그를 밟지 않지만, 다른 호출부가 부분 body로 이 엔드포인트를
재사용하면 여전히 걸린다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `PUT /api/admin/factions/[id]`가 body에 없는 필드는 기존 DB 값을 유지하도록 수정한다.
  - 방향: PUT 핸들러 안에서 update 이전에 기존 row를 먼저 조회(GET 핸들러와 동일한
    `select('*').eq('id', id).single()`)하고, 각 필드를
    `body.field !== undefined ? body.field : existing.field` 패턴으로 병합해 update한다.
    존재하지 않는 id면 update 시도 전에 404("세계관을 찾을 수 없습니다.")로 응답한다.
  - 대안으로 검토했던 "item_books처럼 별도 PATCH 엔드포인트 신설"은 채택하지 않는다 —
    `item_books`의 PATCH(`jam-web/src/app/api/admin/itembooks/[id]/route.ts:51-89`)는 범용
    부분 업데이트가 아니라 `is_active` 단일 필드 즉시 토글 전용으로 좁게 설계된 것이고, 그
    PUT 본체는 여전히 이 티켓과 동일한 `?? null` 버그를 그대로 갖고 있다(이번 티켓 범위 밖 —
    별도 발견물로 기록). 세계관 쪽은 "부분 body 호출을 안전하게 만든다"는 게 목적이므로
    PUT 자체를 멱등한 병합으로 고치는 쪽이 더 맞는다.
- `FactionsTable.tsx`의 일괄 비활성화 우회 코드(전체 필드 스프레드 + 주석)는 PUT 수정 후에는
  더 이상 필요 없다. body를 `{ is_active: false }`만 보내도록 단순화하고, 이제는 사실과
  다른 기존 주석(38-47행, 185-187행 — "PUT이 부분 body를 지원하지 않는다"는 전제)도 함께 고친다.
- `FactionForm.tsx`(수정 폼, `persist()`)는 이미 매번 전체 필드를 채워 보내므로 이번 수정과
  무관하게 그대로 동작해야 한다 — 회귀 확인 대상.
- `POST /api/admin/factions`(신규 등록, `jam-web/src/app/api/admin/factions/route.ts`)는 이번
  버그와 무관하다(신규 생성은 "기존 값 유지" 개념이 없음) — 손대지 않는다.

## 구현 계획
1. `route.ts`의 `PUT`에 기존 row 조회를 추가하고, update 페이로드를
   `body.field !== undefined ? body.field : existing.field` 병합으로 교체한다(11개 필드 전체
   적용 — background_* 4종뿐 아니라 name 등도 동일 원칙으로 일관되게 처리해 undefined-drop
   묵시적 동작에 기대지 않는다).
2. `FactionsTable.tsx`의 `handleBulkDeactivate`가 보내는 body를 `{ is_active: false }`로
   단순화하고, 관련 주석을 현재 동작에 맞게 갱신한다.
3. `FactionForm.tsx`는 변경하지 않되, 수동/코드 확인으로 전체 필드 전송 여부를 재검증한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `PUT /api/admin/factions/[id]`에서 update 이전에 기존 row를 `select('*').eq('id', id).single()`로
  먼저 조회하도록 추가했다. 조회 실패/없음이면 404(`세계관을 찾을 수 없습니다.`)로 즉시 응답하고
  update를 시도하지 않는다.
  - `id !== undefined ? id : existing.id` 방식 병합은 대상에서 제외했다 — `id`는 요청 body로
    바뀌지 않는 불변 식별자이고 update도 `.eq('id', id)`로 URL 경로의 id만 사용하므로 병합 대상
    11개 필드에 포함하지 않음(티켓의 11개 필드 목록과 일치).
  - `name, tagline, description, image_url, drop_weight, is_active, sort_order, background_color,
    background_shader_id, background_image_url, background_video_url` 11개 필드 전부를
    `body.field !== undefined ? body.field : existing.field` 패턴으로 통일해 병합했다.
  - `adjacent_faction_ids`는 기존과 동일하게 별도 처리(배열일 때만 `faction_adjacency` 테이블
    갱신)를 유지했다 — 병합 대상 11개 필드에 포함되지 않는 별개 관계 데이터라 티켓 범위와도
    일치한다.
- `FactionsTable.tsx`의 `handleBulkDeactivate`가 보내는 body를 `{ is_active: false }`만으로
  단순화했다. "PUT이 부분 body를 지원하지 않아 전체 필드 스프레드로 우회한다"는 기존 주석
  (컴포넌트 상단 doc 주석 + fetch 호출부 인라인 주석)을 현재 동작(부분 body 병합 지원)에 맞게
  고쳤다.
- `FactionForm.tsx`의 `persist()`는 코드 확인 결과 매번 11개 필드 전부를 채워 body에 포함해
  보내는 구조를 그대로 유지하고 있어(변경 없음) 이번 PUT 병합 로직 변경으로 인한 회귀가 없다.
- `POST /api/admin/factions`(신규 등록)는 티켓 지시대로 손대지 않았다.
- `item_books`의 PUT(`jam-web/src/app/api/admin/itembooks/[id]/route.ts`)에 동일한 `?? null`
  패턴 버그가 있는 것을 재확인했다 — 티켓 지시대로 수정하지 않고 sideFinding으로만 기록한다.
- **(재시도)** 1차 게이트 리뷰 FAIL 사유였던 타입 오류를 수정했다: 기존 row 조회 결과(`data`)를
  `existingData`로 받고, null 체크 직후 `FactionRow`(`jam-web/src/types/database.ts`에서 import)로
  명시적으로 타입 단언한 `existing` 변수를 병합 로직에서 사용하도록 고쳤다. `@ts-expect-error`가
  `.update({` 한 줄만 억제해 그 아래 `existing.필드` 접근 11곳이 억제 범위 밖에서 TS2339를 내던
  문제가 해결됐다 — `npx tsc --noEmit`과 `npm run build` 모두로 실제 실행 확인(테스트 결과 참조).

### 변경된 파일
```
jam-web/src/app/api/admin/factions/[id]/route.ts
jam-web/src/app/admin/factions/FactionsTable.tsx
```

### 테스트 결과
- [x] `npx eslint`로 변경 파일 2개 린트 확인 — `FactionsTable.tsx`의 `themeContainer` useEffect
      관련 `react-hooks/set-state-in-effect` 에러 1건은 변경 전(git stash 후 재확인)에도 동일하게
      발생하는 기존 이슈로, 이번 변경과 무관함을 확인했다(20260827_002에서 도입된 코드).
      `route.ts`는 신규 lint 에러 0건.
- [x] **(재시도 — 1차 게이트 리뷰 FAIL 사유 해결)** 1차 시도에서 `node_modules` 미설치로 실행하지
      못했던 `npx tsc --noEmit`을 이번엔 `npm ci`로 의존성을 설치한 뒤 실제로 실행해 확인했다.
      - 수정 전 재현: `existing.name` 등 `select('*').eq('id', id).single()`의 반환값(`data`)을
        `existing`이라는 이름으로 그대로 쓰던 기존 코드에서 `Property 'name' does not exist on
        type 'never'` 등 TS2339가 11곳(필드별 1개씩) 발생함을 재확인했다 — 1차 게이트 리뷰가
        지적한 것과 동일한 에러.
      - 원인: `select` 반환 타입이 `never`로 좁혀지는 것을 `@ts-expect-error`가 `.update({` 앞
        한 줄만 억제하고, 그 아래 `existing.필드` 접근 11곳은 억제 범위 밖이라 그대로 에러로
        노출됨.
      - 수정: `existing`을 `data`(→ `existingData`로 개명) 그대로 쓰지 않고, null 체크 직후
        `jam-web/src/types/database.ts`의 `FactionRow`를 import해 `const existing = existingData
        as FactionRow`로 명시적으로 타입을 확정한 뒤 그 `existing`을 병합 로직에서 사용하도록
        고쳤다.
      - 수정 후 `npx tsc --noEmit -p tsconfig.json`을 프로젝트 전체 기준으로 재실행해 출력 0줄,
        exit code 0(에러 0건)을 확인했다.
      - 추가로 `npm run build`(production build, Next.js)까지 실행해 타입체크를 포함한 전체
        빌드가 에러 없이 완료됨을 확인했다(1차 게이트 리뷰가 "이 상태로는 next build 자체가
        막힌다"고 지적했던 부분의 실제 해소 확인).
- [ ] 실제 어드민 화면에서의 수동 PUT 호출 테스트는 수행하지 못했다(로컬 서버 미기동, DB 접근
      권한이 이 서브에이전트에 위임되지 않음 — 절대 규칙 3, 5). 로컬 테스트 방법은 요약 참조.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 신규/변경된 사용자 노출 문구 없음(기존 404 에러 메시지 `세계관을 찾을 수
      없습니다.`를 GET 핸들러와 동일하게 재사용했을 뿐, 문구 자체는 이번 티켓에서 새로 만들지
      않았다).
- [x] 톤앤매너: 해당 없음(문구 변경 없음)
- [x] 에러 메시지: 해당 없음(문구 변경 없음)
- [x] 문장 규칙: 해당 없음(문구 변경 없음)
- [x] 표기 규칙: 해당 없음(문구 변경 없음)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.
- 구현 중 `jam-web/src/app/admin/factions/[id]/AdjacencyEditor.tsx`가 `PUT /api/admin/factions/[id]`를
  `{ adjacent_faction_ids: [...] }`만 담아 호출하는 것을 발견했다 — 티켓 본문에 명시적으로
  언급되지는 않았지만, 이 코드가 정확히 이 티켓이 고치려는 버그의 실제 피해 사례였다(인접
  세계관을 저장할 때마다 배경 4개 필드가 조용히 null로 덮어써지고 있었음). 이번 PUT 병합 로직
  수정으로 이 호출부도 함께 정상화됐다 — 별도 코드 수정은 필요 없었다(AdjacencyEditor.tsx 자체는
  변경하지 않음).
- 티켓 지시대로 item_books PATCH 신설 대안은 채택하지 않았고, PUT 자체를 병합 로직으로 고치는
  방향으로만 구현했다.

### 잔여 이슈
- `item_books`의 PUT(`jam-web/src/app/api/admin/itembooks/[id]/route.ts:12-23`)에 동일한
  `?? null` 부분 body 버그가 남아있다(이번 티켓 범위 밖, sideFinding).
