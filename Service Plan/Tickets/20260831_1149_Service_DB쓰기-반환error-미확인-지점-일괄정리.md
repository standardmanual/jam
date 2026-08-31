---
id: 20260831_1149
category: Service
status: OPEN
created: 2026-08-31
closed:
---

# [Service] DB 쓰기 호출의 반환 `error` 미확인 지점 일괄 정리 (패턴 9 후속)

## 배경 / 문제 정의

티켓 20260831_1118에서 어드민 드랍 정책 저장이 **41일간(2026-07-21 ~ 08-31) 조용히 실패**하고
있었다. `await table.upsert(payload)`처럼 반환값을 통째로 버리면 `supabase-js`는 실패해도 예외를
던지지 않으므로 **로그조차 남지 않고**, 상위 API가 200을 응답해 화면에는 "저장되었습니다"가 뜬다.
감지 수단이 0이다. 이 패턴은 `Specs/DEV_PROCESS_GUARDRAILS.md`의 **패턴 9**로 문서화돼 있다.

1118은 `drop_policy` 한 곳만 복구했고, 나머지 지점은 **범위 밖 발견물 #2**로 넘겼다.
이 티켓이 그 후속이다.

### 전수 조사 결과 (2026-08-31, `origin/staging` e76d2c6c 기준)

`src/` 전체에서 **반환값을 아예 구조분해하지 않는 쓰기 호출 22곳**을 확인했다.
1118의 범위 밖 발견물이 지목한 5곳보다 넓다. 특히 **로그인 경로와 보상 경로**가 새로 드러났다.

읽기 로더의 "키 누락 무음 폴백"도 함께 대상이다 — 이번 사고를 첫날에 잡지 못한 직접 원인이다.
`getDropPolicy()`에만 `console.error`가 붙어 형제 로더 3종과 어긋나 있다.

## 상세 요구사항

### 서비스/코드베이스 관점

#### 원칙 — 기계적으로 전부 throw로 바꾸지 않는다

각 지점의 **원래 의도를 먼저 파악하고** 아래 세 부류로 판정한다. 어떤 곳은 "본 흐름을 막지
않으려고" 의도적으로 흡수한 것이다. 전부 throw로 바꾸면 오히려 서비스가 죽는다.

| 부류 | 처리 | 대상 성격 |
|---|---|---|
| **A. 전파** | `error` 확인 → throw, 호출 API가 4xx/5xx + `json.error`로 응답 | 어드민 저장·설정 변경. 운영자가 실패를 알아야 한다 |
| **B. 흡수 + 로그** | `error` 확인 → `console.error`, 본 흐름은 계속 | 엔진 상태·캐시·백그라운드 기록 |
| **C. 흡수 + 로그 + 구조화 로그** | B에 더해 `logEngineDecision()`으로 `engine_decision_log` 기록 | 보상(배지·아이템·포인트) 발급 경로 — 패턴 4 규칙 |

**함수와 호출부의 역할 분담**: 같은 함수가 어드민 경로와 자동 감지 경로 양쪽에서 호출되는
경우(`applyBan`·`blockPoiForUser`)는 **함수가 실패를 throw하고, 흡수는 자동 감지 호출부에서**
한다. 1118의 `updateDropPolicy()`가 세운 선례를 따른다.

#### 지점별 판정 초안 (구현 중 재검토 가능, 변경 시 근거를 완료 기록에 남길 것)

**A. 전파 — 어드민 저장 경로 (8곳)**

| 지점 | 내용 | 비고 |
|---|---|---|
| `lib/combine/policy.ts:54` | `updateCombinePolicy` upsert | `api/admin/combine-policy/route.ts:63`이 실패해도 `{ policy }`로 200 응답 → 500 전파 |
| `lib/abusing/policy.ts:53` | `updateAbusingPolicy` upsert | `api/admin/abusing/policy/route.ts:18`이 무조건 `{ ok: true }` 응답 → 500 전파 |
| `lib/abusing/poi-block.ts:45` | `unblockPoi` delete | 호출부 `api/admin/abusing/poi-blocks/route.ts:29` |
| `lib/abusing/shadow-ban.ts:78` | `removeBan` delete | 호출부 `api/admin/abusing/bans/route.ts:41` |
| `lib/abusing/shadow-ban.ts:70` | `applyBan` upsert | 어드민(`bans/route.ts:30`)은 전파, 자동 감지(`pickup`)는 흡수 — 아래 B 항목 참조 |
| `api/admin/factions/[id]/route.ts:62` | `faction_adjacency` delete | delete → insert 재작성의 앞단. 실패하면 중복 인접관계가 남는다 |
| `api/admin/simulate/route.ts:106,146` | `user_activity_badges` insert, `inventory.used_slots` update | 시뮬레이션 결과가 실제와 어긋난다 |
| `api/admin/users/[id]/reset/route.ts:136` | `users.initial_sync_done` update | **바로 아래 `stravaError`는 이미 500 전파 중** — 대칭을 맞춘다 |

**B. 흡수 + 로그 — 본 흐름을 막으면 안 되는 경로 (10곳)**

| 지점 | 내용 | 흡수 사유 |
|---|---|---|
| `auth/callback/route.ts:58` | 로그인 시 `users` upsert | **판단 필요.** 실패하면 유저 행 없이 앱이 진행된다. 로그인을 막을지(에러 리다이렉트) 흡수할지 구현 중 결정하고 근거를 남길 것 |
| `lib/drop-engine/index.ts:422` | `saveDropState` upsert | 드랍은 이미 발급됨. 상태 저장 실패로 픽업을 되돌릴 수 없다 |
| `lib/poi/search-cache.ts:47` | `markSearched` upsert | 캐시 실패 = 다음 요청에서 재검색. 무해하지만 네이버 API 한도를 먹는다. **`api/drops/route.ts:58`이 `Promise.all`로 await하므로 throw하면 드랍 지도 전체가 깨진다** |
| `lib/abusing/poi-block.ts:39` | `blockPoiForUser` upsert | 자동 감지 경로(`pickup/route.ts:89`). 아래 참조 |
| `lib/abusing/shadow-ban.ts:92` | `logAbusingEvent` insert | 이미 `try/catch`가 있으나 `supabase-js`는 throw하지 않아 **무의미하다** |
| `lib/abusing/gps-detector.ts:113` | `users` 위치 update | 다음 요청에서 재기록됨 |
| `lib/activity-feed/index.ts:118` | `user_activity_feed` insert | `catch`에 `console.error`가 있으나 위와 같은 이유로 도달하지 않는다 |
| `lib/badge-engine/index.ts:799` | `users.initial_sync_done` update | 실패하면 다음 싱크가 전체 이력을 다시 수집한다(비용만 발생) |
| `lib/combine/index.ts:273,287` | 조합 연패 카운터 upsert | 조합 결과는 이미 확정됨 |
| `lib/missions/checker.ts:150` | 미션 진행도 update | 다음 판정에서 재계산됨 |

> **`pickup/route.ts:87-98`의 `Promise.all` 주의** — `applyBan`·`blockPoiForUser`·
> `logAbusingEvent` 세 개가 한 `Promise.all`에 묶여 있고 그 뒤 `403 location_unverified`를
> 응답한다. 함수가 throw하도록 바꾸면 이 라우트가 403 대신 500을 내며 사용자 문구를 잃는다.
> `Promise.allSettled` + 실패 로그로 바꾸거나 호출부에서 개별 `.catch()`로 흡수할 것.

**C. 흡수 + 로그 + `engine_decision_log` — 보상 경로 (2곳, 패턴 4)**

| 지점 | 내용 |
|---|---|
| `lib/itembook/checker.ts:176` | 아이템북 완성 기록 upsert. 실패하면 완성 보상이 누락되거나 반복 발급될 수 있다 |
| `lib/missions/rewards.ts:126` | 미션 보상 지급 후 `inventory.used_slots` 증가. 실패하면 슬롯 카운트가 실제 아이템 수와 어긋난다 (바로 위 `inventory_items` insert는 이미 `error`를 확인 중 — 대칭이 깨져 있다) |

- `EngineDecisionEvent`에 값을 추가한다 (예: `'reward_write_failed'`).
  **`event`에는 DB CHECK 제약이 없으므로 마이그레이션이 필요 없다.** CHECK가 걸린 것은
  `engine` 컬럼뿐이고(`badge`/`drop`/`points`), 기존 값을 쓰면 된다.
  `lib/engine-log/index.ts`의 `EngineKind` 주석 참조.

#### 읽기 로더 — select `error` 확인 + 키 누락 경고 (4종)

`getDropPolicy()`(1118에서 처리 완료)를 기준으로 형제 로더 3종을 맞춘다.

| 지점 | 현재 상태 |
|---|---|
| `lib/combine/policy.ts:35,45` | select `error` 미확인, `catch {}`에 로그 없음 |
| `lib/abusing/policy.ts:40,43` | 동일 |
| `lib/ambient-drop/config.ts:42,59` | 동일 |

- **기본값 폴백 자체는 유지한다** — 엔진이 죽으면 안 되므로 의도적 설계다.
- `getDropPolicy()` 계열의 정규화 루프는 `row[key]`가 없으면 조용히 기본값으로 대체한다.
  `if (!(key in row)) console.error(...)` 수준의 경고를 추가하면 같은 루프를 쓰는
  **4개 로더가 전부 보호된다**(`drop-engine/policy.ts`·`combine/policy.ts`·
  `abusing/policy.ts`·`ambient-drop/config.ts`).
- `abusing/policy.ts`는 `getAbusingPolicy()`가 정규화 루프 없이 `data`를 그대로 반환한다.
  다른 셋과 형태가 다르므로 키 누락 경고를 어떻게 붙일지 별도 판단이 필요하다.

#### 문서 정합성

- `lib/ambient-drop/config.ts:64-69`의 JSDoc이 이번 사고로 반증됐다.
  "drop_policy 필드들은 전부 순수 숫자라 이 실패 경로가 없었다"는 서술이 남아 있는데,
  **순수 숫자여도 컬럼명 불일치로 400이 난다.** 한 줄 갱신한다.

### UI/UX 관점

- 사용자 노출 문구가 새로 생기는 곳은 **어드민 저장 실패 메시지**뿐이다.
  1118이 `api/admin/drop-policy/route.ts:59`에 세운 문구 형식을 그대로 따른다:
  > `{대상}이 저장되지 않았어요. 데이터베이스가 요청을 거부했어요. 다시 시도해도 같으면 괄호 안 오류 내용을 개발자에게 전달해 주세요. ({DB 오류})`
- `Specs/UX_WRITING_GUIDELINE.md`의 [현상]→[원인]→[해결책] 3단계 구조를 따른다.
  어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 괄호로 함께 노출한다.
- **서비스(비어드민) 화면에는 새 문구를 만들지 않는다.** B 부류는 전부 서버 로그로만 남는다.

### 범위 밖 (이번 티켓에서 하지 않는다)

- **`abusing_policy`의 컬럼명 불일치는 다루지 않는다.** DB 실제 컬럼은
  `soft_legendary_rate`/`hard_legendary_rate`인데 코드는 `soft_legend_rate`/`hard_legend_rate`를
  쓴다(1118 실측 확인). **별도 티켓 대상**이며, 이 티켓은 에러 처리 패턴만 정리한다.
  `updateAbusingPolicy`가 `error`를 확인하게 되면 이 불일치가 **500으로 드러날 것**인데,
  그건 의도된 결과다 — 감지 수단이 생겼다는 뜻이다.
- **`api/admin/abusing/policy/route.ts`의 키 화이트리스트 부재도 다루지 않는다.**
  `body`를 검증 없이 upsert에 넘기는 문제는 위 컬럼명 티켓에서 함께 처리한다.
- 수기 `database.ts` ↔ 생성 `database.generated.ts` 전수 diff (1118 범위 밖 발견물 #3).
- 마이그레이션 SQL 신규 작성 없음 — DB 스키마를 건드리지 않는다.

## 구현 계획

1. **A 부류(전파) 8곳** — `const { error } = await ...` → `console.error` + `throw`.
   호출 API 라우트를 `try/catch`로 감싸 4xx/5xx + `json.error` 응답. 어드민 폼은 대부분
   이미 `!res.ok` → `json.error` 분기를 갖고 있으므로 폼 수정은 최소화한다(확인 후 판단).
2. **B 부류(흡수) 10곳** — `const { error } = await ...` → `if (error) console.error(...)`.
   기존 `try/catch`가 `supabase-js`에서 무의미했던 곳은 주석으로 사유를 남긴다.
   `pickup/route.ts`의 `Promise.all`은 `allSettled`로 전환하거나 개별 흡수.
3. **C 부류(보상) 2곳** — B에 더해 `logEngineDecision()` 호출. `EngineDecisionEvent`에 값 추가.
4. **읽기 로더 3종** — select `error` 확인 + `console.error`, 정규화 루프에 키 누락 경고 추가.
   `getDropPolicy()`와 형태를 맞춘다.
5. **`ambient-drop/config.ts` JSDoc 한 줄 갱신.**
6. 검증
   - `npx tsc --noEmit` / `npm run lint` / `npm run build`
   - 기존 테스트 전체 통과 (`src/lib/engine-log/__tests__` 포함)
   - **회귀 재현 경로**: 어드민 조합 정책 저장이 정상 200을 돌려주는지, 일부러 잘못된
     페이로드로 500 + 문구가 나오는지 코드 경로로 확인
   - `pickup` 라우트가 GPS 조작 감지 시 여전히 **403 `location_unverified`**를 응답하는지
     (500으로 바뀌지 않았는지) 확인 — 이번 변경의 최대 회귀 위험 지점
   - `api/drops` 드랍 지도 조회가 `markSearched` 실패로 깨지지 않는지 확인

> ⚠️ 이 저장소는 staging·프로덕션이 **단일 Supabase DB**를 공유한다. 검증용 쓰기는
> 프로덕션에 즉시 반영되므로, 값 변경 테스트는 하지 않는다. 코드 경로 확인으로 대체한다.
