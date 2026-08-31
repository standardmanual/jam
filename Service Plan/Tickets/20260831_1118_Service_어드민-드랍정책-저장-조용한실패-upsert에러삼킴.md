---
id: 20260831_1118
category: Service
status: CLOSED
created: 2026-08-31
closed: 2026-08-31
---

# [Service] 어드민 드랍 정책 저장이 조용히 실패 — upsert 에러 삼킴 + 컬럼명 불일치

## 배경 / 문제 정의

어드민 드랍 정책 화면(`/admin/drop-policy`)에서 저장하면 "저장되었습니다"가 뜨지만
**DB에는 아무 값도 반영되지 않는다.** 2026-07-21 이후 이 화면으로 저장된 값이 하나도 없다.

### 실측으로 확인한 사실 (2026-08-31 조사)

1. **DB 컬럼명 불일치** — `drop_policy` 테이블의 실제 컬럼은 `rarity_legendary`인데
   코드는 `rarity_legend`를 읽고 쓴다.
   - 티켓 20260813_003(`legendary`→`legend` 전면 변경)에서 enum만 rename하고 이 컬럼은 누락됐다.
   - 같은 성격의 `ambient_drop_config`는 `rarity_legend`로 정상 개명돼 두 테이블이 어긋나 있다.

2. **upsert 전체 실패** — PostgREST에 `updateDropPolicy()`와 동일한 페이로드를 보낸 결과:
   ```
   HTTP 400
   {"code":"PGRST204","message":"Could not find the 'rarity_legend' column of 'drop_policy' in the schema cache"}
   ```
   같은 요청에 실어 보낸 `bonus_drop_rate=0.99`도 **함께 롤백**돼 `0.150` 그대로였다.
   즉 rarity 외 필드(bonus_drop_rate, rare_pity_threshold 등)까지 전부 저장되지 않는다.

3. **에러를 삼킨다** — `updateDropPolicy()`가 `await table.upsert(...)`만 하고 반환된 `error`를
   확인하지 않는다(`Promise<void>`). API 라우트는 그대로 200 + 정책 JSON을 돌려주고,
   폼은 `res.ok`만 보므로 성공 메시지가 뜬다. 실패 신호가 어디에도 남지 않는다.

4. **`updated_at`이 2026-07-21T01:26:10에 멈춰 있다.** 위 재현 테스트 후에도 변동 없음
   (전체 롤백이므로 데이터 원복 불필요).

5. **타입 체크로도 안 잡힌 이유** — 수기 타입 `database.ts:524`는 `rarity_legend`인데
   Supabase 생성 타입 `database.generated.ts:476`은 `rarity_legendary`다. 코드가 수기 타입을
   참조하고, upsert의 `@ts-expect-error`가 남은 오류까지 눌러 컴파일 단계에서 드러나지 않았다.

6. **읽기 경로도 오염** — `getDropPolicy()`는 `DEFAULT_DROP_POLICY` 키로 순회하므로
   `row['rarity_legend']`가 undefined → NaN → 기본값 `0.09`로 폴백한다. DB 실제값도 0.090이라
   현재는 증상이 안 드러나지만, 드랍 엔진(`layers.ts:27`)과 API의 rarity 합 검증
   (`route.ts:35`)이 DB 실제값이 아니라 항상 기본값을 쓰고 있다.

## 상세 요구사항

### 서비스/코드베이스 관점

- **(핵심) upsert 에러를 삼키지 않는다.** `updateDropPolicy()`가 반환 `error`를 확인하고,
  실패 시 호출부가 인지할 수 있게 예외를 던진다.
- **API 라우트가 실패를 사용자에게 전파한다.** `PUT /api/admin/drop-policy`가 저장 실패를
  성공(200)으로 응답하지 않도록 하고, 에러 응답 본문을 폼이 이미 읽는 `json.error` 형식으로 맞춘다.
- **앱 키 ↔ DB 컬럼 매핑을 `policy.ts` 안에 둔다.** 앱 전역은 `rarity_legend`를 유지하되,
  `drop_policy` 테이블 입출력 시점에만 `rarity_legendary`로 변환한다. 읽기(`getDropPolicy`)와
  쓰기(`updateDropPolicy`) 양쪽에 적용해 저장 기능과 엔진 읽기 경로를 함께 복구한다.
- **`@ts-expect-error`로 눌러둔 타입 오류를 재점검한다.** 억제가 여전히 필요하면 사유를
  주석에 정확히 남기고, 불필요해졌으면 제거한다.

### UI/UX 관점

- 저장 실패 시 어드민 폼에 실패가 드러나야 한다. 폼은 이미 `!res.ok`일 때 `json.error`를
  표시하므로 **API가 올바른 상태 코드와 메시지를 주기만 하면 된다.**
- 에러 문구는 `Specs/UX_WRITING_GUIDELINE.md`의 [현상]→[원인]→[해결책] 3단계 구조를 따른다.
  단 어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다.

### 범위 밖 (이번 티켓에서 하지 않는다)

- **`drop_policy.rarity_legendary` 컬럼 자체의 개명은 하지 않는다.**
  배지 등급명을 `common/rare/legend/mythic` → `common/rare/epic/mystic`으로 바꾸는 별도 작업이
  예정돼 있고 거기에 `rarity_legendary` → `rarity_epic` 개명이 포함된다. 컬럼을 두 번 건드리지
  않도록 이번엔 코드 측 매핑으로만 대응한다.
- 따라서 **이번에 추가하는 매핑은 개명 작업 시 제거 대상**이다. 매핑 위치에 그 사실을
  주석으로 남겨 다음 작업자가 놓치지 않게 한다.

## 구현 계획

1. `jam-web/src/lib/drop-engine/policy.ts`
   - 앱 키 → DB 컬럼 매핑 상수를 추가(현재 대상은 `rarity_legend` → `rarity_legendary` 1건).
     개명 작업 시 제거해야 함을 주석으로 명시.
   - `getDropPolicy()`: 행을 읽을 때 DB 컬럼명을 앱 키로 되돌린 뒤 기존 숫자 정규화 로직을 태운다.
     기존의 "실패 시 기본값 폴백" 동작은 그대로 유지한다(드랍 엔진이 죽으면 안 됨).
   - `updateDropPolicy()`: patch의 앱 키를 DB 컬럼명으로 변환해 upsert하고,
     반환 `error`를 확인해 실패 시 throw. 시그니처 변경 시 호출부와 함께 정리.
2. `jam-web/src/app/api/admin/drop-policy/route.ts`
   - `updateDropPolicy` 호출을 감싸 실패를 500(또는 적절한 코드) + `error` 메시지로 응답.
3. `jam-web/src/types/database.ts`
   - `DropPolicyRow`가 앱 키 기준임을 주석으로 명확히 하고, 생성 타입과 다른 이유를 남긴다.
     (타입 자체를 `rarity_legendary`로 바꾸면 앱 전역 호출부가 흔들리므로 이번엔 주석 정리만)
4. 검증
   - 어드민 저장 → DB `updated_at`과 실제 값이 갱신되는지 확인
   - 일부러 잘못된 페이로드를 보내 실패가 어드민 화면에 드러나는지 확인
   - 드랍 엔진이 DB 실제 rarity 값을 읽는지 확인 (기본값 폴백이 아니라)

> 참고: 이 저장소는 staging·프로덕션이 **단일 Supabase DB**를 공유한다. 검증 중 쓰기가
> 발생하면 프로덕션에 즉시 반영되므로, 값 변경 테스트 전 현재 행을 백업하고 끝나면 원복한다.
> 조사 시점 백업값: `rarity_legendary=0.090`, `bonus_drop_rate=0.150`,
> `updated_at=2026-07-21T01:26:10.849614+00:00`

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

1. **upsert 에러 삼킴 제거** — `updateDropPolicy()`가 upsert 반환 `error`를 확인해
   서버 로그(`[drop-policy] 저장 실패`)를 남기고 `drop_policy upsert 실패 (코드): 메시지`
   형태로 예외를 던진다.
2. **API가 실패를 전파** — `PUT /api/admin/drop-policy`가 `updateDropPolicy` 호출을
   try/catch로 감싸 실패 시 500 + `error` 메시지로 응답한다. 폼은 기존 `!res.ok` 분기로
   그대로 표시되므로 폼 구조 변경 없음.
3. **앱 키 ↔ DB 컬럼 매핑을 `policy.ts`에 격리** — `APP_KEY_TO_DB_COLUMN`
   (`rarity_legend` → `rarity_legendary`) 1건과 변환 함수 `toAppKeys`/`toDbColumns`를 추가.
   읽기(`getDropPolicy`)·쓰기(`updateDropPolicy`) 양쪽에 적용해 저장 기능과 드랍 엔진
   읽기 경로를 함께 복구했다. `drop_policy`에 접근하는 코드는 `policy.ts`뿐임을 grep으로 확인.
4. **읽기 폴백은 유지** — `getDropPolicy()`의 `DEFAULT_DROP_POLICY` 폴백은 드랍 엔진이
   죽지 않게 하는 의도적 설계라 그대로 두되, 지금까지 무음이던 실패에 `console.error`를 추가했다.
5. **`@ts-expect-error` 재점검** — 지시자를 제거하고 tsc를 돌려 실제 오류
   (`TS2345: ... not assignable to parameter of type 'never[]'`)를 확인, 억제가 여전히
   필요함을 실증하고 사유 주석을 정확히 갱신했다.
6. **DB 컬럼 개명은 하지 않았다.** 마이그레이션 SQL 신규 작성 없음. 매핑 상수와
   `DropPolicyRow` 양쪽에 "등급명 개명(legend → epic) 작업에서 함께 제거할 것" 주석을 남겼다.

### 변경된 파일
```
jam-web/src/lib/drop-engine/policy.ts
jam-web/src/app/api/admin/drop-policy/route.ts
jam-web/src/types/database.ts
```

### 테스트 결과
- [x] `npx tsc --noEmit` 통과 (오류 0)
- [x] `npm run lint` 전체 실행 — 오류 0 / 경고 25건 (전부 기존 미사용 변수 경고, 변경 파일과 무관)
- [x] `npm run build` 성공
- [x] `@ts-expect-error` 제거 실험으로 억제 필요성 실증
- [x] **실패 재현** (수정 전, PostgREST 직접 호출) — 구 페이로드(`rarity_legend` 포함)는
      `HTTP 400 / PGRST204: Could not find the 'rarity_legend' column of 'drop_policy'`.
      같은 요청에 실은 `bonus_drop_rate=0.99`도 함께 롤백돼 `0.150` 유지 → 전체 실패 확정
- [x] **저장 복구 확인** (수정 후, 사용자 승인 하에 실행) — 새 코드가 만드는 페이로드
      (`rarity_legendary` 포함 24개 필드)로 upsert 실행 결과 **HTTP 200**,
      `updated_at`이 `2026-07-21T01:26:10` → `2026-08-31T02:40:00`으로 **41일 만에 갱신**.
      값은 현재값을 그대로 재저장해 **정책 값 변경분 0건**(운영 영향 없음)
- [x] 저장 실패 시 API가 500 + `error` 메시지를 응답하고, 폼의 기존 `!res.ok` 분기로 노출됨을
      코드 경로로 확인 (폼 구조 미변경)
- [ ] 어드민 실화면 저장 확인 — 어드민은 staging 검증 대상이 아니므로 **프로덕션 배포 후**
      `/admin/drop-policy`에서 수행

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

추가된 노출 문구는 저장 실패 시 어드민 폼에 표시되는 오류 1건이다.

> 드랍 정책이 저장되지 않았어요. 데이터베이스가 요청을 거부했어요. 다시 시도해도 같으면
> 괄호 안 오류 내용을 개발자에게 전달해 주세요. (drop_policy upsert 실패 (PGRST204): …)

개선 리뷰 지적을 반영해 위치 지시어를 "아래" → "괄호 안"으로 고쳤다. 폼(`DropPolicyForm.tsx`)이
메시지를 단일 `<p>` 한 줄로 렌더하므로 DB 오류가 같은 문장 괄호 안에 인라인으로 붙는다.
"아래"에 해당하는 영역이 화면에 없었다.

- [x] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [x] 톤앤매너: 오류 상황 = 전문적인 톤
- [x] 에러 메시지: [현상] 저장되지 않았어요 → [원인] 데이터베이스가 요청을 거부했어요
      → [해결책] 다시 시도, 반복되면 오류 내용 전달. 어드민 화면이므로 원인 특정을 위해
      DB 오류 메시지를 괄호로 함께 노출
- [x] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [x] 표기 규칙: 해당 없음 (날짜/금액 표기 없음)

### 배포 정보
- 배포일: 2026-08-31
- 환경: staging (프로덕션 승격은 `/jam-ship`으로 별도 진행)
- 커밋: `bb994469`(구현), `ec456530`(UX 문구 교정)

### 주요 의사결정 / 핵심 메모

- **DB 컬럼을 고치지 않고 코드 매핑으로 대응했다.** 등급명 개명(common/rare/legend/mythic →
  common/rare/epic/mystic) 작업에 `rarity_legendary` → `rarity_epic`이 포함돼 있어 컬럼을 두 번
  건드리지 않기 위함. 이번 매핑은 그 작업의 **제거 대상**이며, `policy.ts`의
  `APP_KEY_TO_DB_COLUMN` 주석과 `database.ts`의 `DropPolicyRow` 주석 두 곳에 명시했다.
- **앱 전역 키는 `rarity_legend`를 유지**했다. 호출부를 `rarity_legendary`로 바꾸지 않았다.
- `drop_policy` 테이블 접근 지점이 `policy.ts` 한 곳뿐임을 확인해 매핑 누락 위험이 없다.

### 잔여 이슈

- 등급명 개명 작업 시 `APP_KEY_TO_DB_COLUMN`·`toAppKeys`·`toDbColumns`와 관련 주석을 제거할 것.
  PRD `02_DATA_MODEL.md`의 `drop_policy` 절에도 이 사실을 명시해뒀다.
- `database.ts`(수기)와 `database.generated.ts`(생성)가 이 컬럼에서 여전히 어긋나 있다.
  이번엔 주석으로만 정리했고, 개명 작업에서 양쪽을 일치시켜야 근본 해소된다.
- **어드민 실화면 저장 확인이 남아 있다.** 프로덕션 배포 후 `/admin/drop-policy`에서 수행.

#### 범위 밖 발견물 — 후속 티켓으로 분리 (사용자 승인, 2026-08-31)

1. **`/admin/abusing` 저장도 동일하게 조용히 실패 중.** DB 실제 컬럼은
   `soft_legendary_rate`/`hard_legendary_rate`인데 코드는 `soft_legend_rate`/`hard_legend_rate`를
   쓴다(실측 확인). `updateAbusingPolicy()`도 `error`를 버리고,
   `api/admin/abusing/policy/route.ts:18`은 무조건 `{ ok: true }`를 응답한다.
   게다가 이쪽은 `body`를 **키 화이트리스트 없이** 그대로 upsert에 넘겨 위험도가 더 높다.
   `abusing_policy.updated_at`은 2026-08-13에 멈춰 있다.
2. **에러 삼킴 패턴 잔존 5곳** — `combine/policy.ts:50`, `drop-engine/index.ts:422`,
   `poi/search-cache.ts:47`, `abusing/poi-block.ts:39·45`, `abusing/shadow-ban.ts:70·78`.
   읽기 로더의 "키 누락 무음 폴백"도 함께 정리 대상.
3. **타입 파일 불일치 전수 점검** — 수기 `database.ts` ↔ 생성 `database.generated.ts`를
   전체 diff해 `drop_policy`·`abusing_policy` 외 어긋난 테이블이 더 있는지 확인.

#### 운영 안내 필요

2026-07-21 이후 어드민에서 저장한 드랍 정책 값이 **하나도 반영되지 않았다.** 그동안 조정했다고
믿은 값이 실제로는 미적용이므로, 프로덕션 배포 후 운영자에게 **정책 값 재확인**을 안내해야 한다.
(`abusing_policy`도 2026-08-13 이후 동일 상태)

### 프로세스 반영

`Specs/DEV_PROCESS_GUARDRAILS.md`에 **패턴 9 — 쓰기 호출의 반환 `error`를 읽지 않아, 실패한
저장이 성공으로 응답됨**을 신설했다. 패턴 4("로그만 남기고 흡수")의 한 단계 더 나쁜 변종으로,
감지 수단이 0인 사례다.
