---
id: 20260831_1149
category: Service
status: OPEN
created: 2026-08-31
closed:
---

# [Service] 어드민 어뷰징 정책 저장이 조용히 실패 + 섀도우밴 legend 차단이 무력화

## 배경 / 문제 정의

어드민 어뷰징 정책 화면(`/admin/abusing`)에서 저장하면 "정책이 저장됐어요"가 뜨지만
**DB에는 아무 값도 반영되지 않는다.** 직전 티켓 20260831_1118(드랍 정책)과 **동일 구조의 결함**이
`abusing_policy`에도 남아 있다.

다만 이번 건은 드랍 정책보다 **위험도가 한 단계 높다.** 드랍 정책은 읽기 경로에 기본값 폴백이
있어 값이 우연히 일치했지만, 어뷰징 정책은 **읽기 폴백이 없어 실제 섀도우밴 판정이 틀어져 있다.**

### 실측으로 확인한 사실 (2026-08-31 조사)

1. **DB 컬럼명 불일치** — `abusing_policy` 테이블의 실제 컬럼은
   `soft_legendary_rate` / `hard_legendary_rate`인데 코드는 `soft_legend_rate` / `hard_legend_rate`를 쓴다.
   - 티켓 20260813_003(`legendary` → `legend` 전면 변경)에서 이 두 컬럼이 누락됐다.
   - `drop_policy.rarity_legendary`와 **완전히 같은 원인**이다.
   - 불일치 지점: `src/lib/abusing/policy.ts`(인터페이스 10·14행, `DEFAULT_POLICY` 25·29행),
     `src/types/database.ts:841,845`, `src/app/admin/abusing/AbusingClient.tsx:221,230`

2. **upsert 전체 실패 (PostgREST 직접 재현)** — 폼이 보내는 페이로드로 upsert한 결과:
   ```
   HTTP 400
   {"code":"PGRST204","message":"Could not find the 'hard_legend_rate' column of 'abusing_policy' in the schema cache"}
   ```
   같은 요청에 실어 보낸 `gps_max_speed_kmh=999`도 **함께 롤백**돼 `300` 그대로였다.
   즉 legend 외 필드(GPS 임계값, POI 블록 시간 등)까지 전부 저장되지 않는다.

3. **`updated_at`이 2026-08-13T01:28:00에 멈춰 있다.** 위 재현 테스트 후에도 변동 없음(전체 롤백).

4. **에러를 삼킨다** — `updateAbusingPolicy()`가 `await table.upsert(payload)`로 반환 `error`를
   버린다(`Promise<void>`). `api/admin/abusing/policy/route.ts:18-19`는 결과와 무관하게
   무조건 `{ ok: true }`를 응답한다. 실패 신호가 어디에도 남지 않는다.

5. **(신규·핵심) 섀도우밴의 legend 차단이 런타임에서 무력화돼 있다.**
   `getAbusingPolicy()`는 `getDropPolicy()`와 달리 **정규화 폴백 루프가 없어 `data`를 그대로 반환**한다.
   따라서 반환 객체에는 `soft_legendary_rate`만 있고 앱이 읽는 `soft_legend_rate`는 없다.
   `shadow-ban.ts:42-43`이 그 값을 이렇게 읽는다:
   ```ts
   const rateKey = `${banLevel}_${rarity}_rate` as keyof AbusingPolicy  // 'soft_legend_rate'
   const rate = policy[rateKey] as number ?? 1.0                        // undefined → 1.0
   ```
   → `rate = 1.0` → `if (rate >= 1) return true` → **드랍 허용**.
   DB 실제값은 `soft_legendary_rate = 0.0` / `hard_legendary_rate = 0.0`(= 완전 차단)인데,
   **소프트밴·하드밴 유저 모두 legend 배지를 정상 확률로 받아 왔다.**
   `mythic`은 컬럼명이 일치해 정상 차단된다 → **legend 등급만 구멍**이다.
   영향 경로: `drop-engine/index.ts:427` `applyShadowBanCap()` → `shouldAllowDrop()`.

6. **어드민 화면이 잘못된 상태를 보여준다.** `RateInput`이 `value={policy.soft_legend_rate}` =
   `undefined`를 받아
   - 표시 로직 `value === 0 ? '차단' : value < 1 ? '%' : '정상'`에서 undefined는 두 비교가 모두
     false → **"정상"으로 표시**된다. 실제 DB는 0.0(차단)이다. 운영자가 실상과 반대인 화면을 본다.
   - `<input type="range" value={undefined}>`가 되어 React 제어 컴포넌트가 비제어로 렌더된다
     (슬라이더 위치도 DB값이 아닌 브라우저 기본값).

7. **키 화이트리스트가 없다 (드랍 정책보다 위험)** — `route.ts:17-18`이 요청 `body`를 검증 없이
   그대로 `updateAbusingPolicy`에 넘긴다. drop-policy 라우트(`api/admin/drop-policy/route.ts:20-29`)에
   있는 "허용 키만 추출 + 숫자 검증" 루프가 없다. 폼이 미지의 키를 하나만 보내도 전체 저장이
   롤백되고 그마저 무음이다. 실제로 폼은 `id`·`updated_at`까지 실어 보내고 있다.

8. **폼이 API 오류 메시지를 버린다** — `AbusingClient.tsx:73-76`이
   `if (!res.ok) throw new Error()` → `flash('err', '저장 실패')`. 드랍 정책 폼(`json.error`를 읽음)과
   달리 API가 원인을 실어 보내도 화면에 뜨지 않는다. **API만 고쳐서는 부족하고 폼도 함께 고쳐야 한다.**

9. **`abusing_policy` 접근 지점이 `policy.ts` 한 곳이 아니다** — `src/lib/strava/sync.ts:459`도
   테이블을 직접 읽는다. 다만 `select('vehicle_speed_filter_kmh')`만 하므로 **매핑 대상 컬럼과는
   무관**하다(수정 불필요). `drop_policy`와 달리 단일 접근점이 아니라는 사실은 기록해 둔다.

### 조사 시점 백업값 (2026-08-31)
```json
{"id":1,"soft_common_rate":1.0,"soft_rare_rate":1.0,"soft_legendary_rate":0.0,"soft_mythic_rate":0.0,
 "hard_common_rate":1.0,"hard_rare_rate":0.0,"hard_legendary_rate":0.0,"hard_mythic_rate":0.0,
 "gps_max_speed_kmh":300,"poi_block_hours":72,"vehicle_speed_filter_kmh":60,
 "gps_daily_distance_cap_km":3000,"updated_at":"2026-08-13T01:28:00.090694+00:00"}
```

## 상세 요구사항

### 서비스/코드베이스 관점

- **(핵심 1) 읽기 경로를 복구해 섀도우밴 legend 차단을 되살린다.** `getAbusingPolicy()`가
  DB 컬럼명을 앱 키로 되돌리고, `getDropPolicy()`와 같은 **숫자 정규화 + 키 누락 시 기본값 폴백**
  루프를 태운다. 폴백 자체는 유지하되(정책 로딩 실패로 픽업 경로가 죽으면 안 됨)
  **키 누락·조회 실패는 `console.error`로 반드시 로그를 남긴다**(가드레일 패턴 9 규칙 3).
- **(핵심 2) upsert 에러를 삼키지 않는다.** `updateAbusingPolicy()`가 반환 `error`를 확인하고
  실패 시 예외를 던진다.
- **API 라우트가 실패를 전파한다.** `PUT /api/admin/abusing/policy`가 저장 실패를 200으로
  응답하지 않고 500 + `error` 메시지로 응답한다.
- **키 화이트리스트를 추가한다.** drop-policy 라우트(`route.ts:20-29`)의
  "허용 키만 추출 + 숫자 검증" 패턴을 따른다. `DEFAULT_POLICY`의 키만 통과시켜
  `id`·`updated_at`·미지의 키가 upsert 페이로드에 섞이지 않게 한다.
  - 단 `gps_max_speed_kmh`·`poi_block_hours`·`vehicle_speed_filter_kmh`·`gps_daily_distance_cap_km`는
    비율(0~1)이 아니라 정수 임계값이다. drop-policy의 `n < 0` 검증은 그대로 쓰되,
    **rate 계열 4×2종은 0~1 범위를 벗어나면 400으로 거절**한다(슬라이더 범위와 DB
    `NUMERIC(3,2)` 제약에 맞춤). 임계값 계열에 상한을 씌우지 않도록 주의한다.
- **앱 키 ↔ DB 컬럼 매핑을 `abusing/policy.ts` 안에만 격리한다.**
  `drop-engine/policy.ts`의 `APP_KEY_TO_DB_COLUMN` / `toAppKeys` / `toDbColumns` 패턴을 그대로 따른다.
  매핑 대상은 `soft_legend_rate` → `soft_legendary_rate`, `hard_legend_rate` → `hard_legendary_rate` 2건.
- **`@ts-expect-error`(policy.ts:52)를 재점검한다.** 억제가 여전히 필요하면 사유 주석을 정확히
  갱신하고, 불필요해졌으면 제거한다.
- **`database.ts`의 `AbusingPolicyRow`** — 앱 키 기준임을 주석으로 명확히 하고 생성 타입
  (`database.generated.ts:54,60,70,76,86,92`)과 다른 이유를 남긴다. 타입 자체는 바꾸지 않는다.

### UI/UX 관점

- **어드민 폼이 저장 실패 사유를 보여준다.** `AbusingClient.tsx`의 `savePolicy()`가 응답 본문의
  `json.error`를 읽어 표시하도록 고친다. 현재는 `throw new Error()`로 버려 "저장 실패"만 뜬다.
  - 현재 `flash()`는 3초 뒤 자동으로 사라진다. 오류 메시지에 DB 코드가 붙으면 3초는 읽기 어렵다 —
    **오류일 때는 자동 소멸을 늘리거나 없애는 쪽을 검토**한다(성공 메시지 동작은 유지).
- 에러 문구는 `Specs/UX_WRITING_GUIDELINE.md`의 [현상] → [원인] → [해결책] 3단계 구조를 따른다.
  어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다.
  선행 티켓 20260831_1118의 문구를 참고하되 **위치 지시어는 실제 렌더 구조에 맞춘다**
  (그 티켓에서 "아래" → "괄호 안"으로 교정한 이력이 있다).
- **legend 슬라이더가 DB 실제값을 표시한다.** 읽기 매핑이 복구되면 자연히 해결되지만,
  `RateInput`이 `undefined`를 받아도 비제어로 떨어지지 않도록 방어할지 함께 판단한다.

### 범위 밖 (이번 티켓에서 하지 않는다)

- **DB 컬럼 개명은 하지 않는다.** 배지 등급명을 `common/rare/legend/mythic` →
  `common/rare/epic/mystic`으로 바꾸는 별도 작업에 `soft_legendary_rate`/`hard_legendary_rate`
  개명이 포함돼 있다. 컬럼을 두 번 건드리지 않도록 이번엔 코드 측 매핑으로만 대응한다.
  **마이그레이션 SQL을 새로 만들지 않는다.**
- 따라서 **이번에 추가하는 매핑은 개명 작업 시 제거 대상**이다. 매핑 위치에 그 사실을
  주석으로 남긴다(선행 티켓과 동일 방식).
- 선행 티켓이 남긴 다른 후속 항목(에러 삼킴 잔존 5곳, 타입 파일 전수 diff)은 이번 범위 밖이다.
  단 `abusing/poi-block.ts`·`abusing/shadow-ban.ts`는 이번에 건드리는 파일과 인접하므로,
  발견 사항이 있으면 `sideFindings`로만 보고하고 고치지 않는다.

## 구현 계획

1. `jam-web/src/lib/abusing/policy.ts`
   - `APP_KEY_TO_DB_COLUMN` 상수 추가(2건) + 역매핑 + `toAppKeys`/`toDbColumns`.
     등급명 개명 작업에서 제거해야 함을 주석으로 명시.
   - `getAbusingPolicy()`: `error`를 구조분해해 실패 시 `console.error` 후 기본값 폴백.
     성공 시 `toAppKeys`로 되돌린 뒤 `DEFAULT_POLICY` 키 순회로 숫자 정규화.
     **키가 없어 기본값으로 대체된 항목이 있으면 `console.error`로 남긴다.**
   - `updateAbusingPolicy()`: patch를 `toDbColumns`로 변환해 upsert하고 `error` 확인 후 throw.
2. `jam-web/src/app/api/admin/abusing/policy/route.ts`
   - PUT에 허용 키 화이트리스트 + 숫자 검증(rate 계열 0~1, 임계값 계열 0 이상) 추가.
   - `updateAbusingPolicy` 호출을 try/catch로 감싸 실패 시 500 + `error` 응답.
   - 성공 응답 형식을 폼이 읽는 형태와 맞춘다(드랍 정책처럼 갱신된 policy를 돌려줄지 판단).
3. `jam-web/src/app/admin/abusing/AbusingClient.tsx`
   - `savePolicy()`가 `json.error`를 읽어 표시. 오류 메시지 노출 시간 검토.
4. `jam-web/src/types/database.ts`
   - `AbusingPolicyRow`가 앱 키 기준임을 주석으로 명확히 하고 개명 작업 시 정리 대상임을 남긴다.
5. 검증
   - `npx tsc --noEmit` / `npm run lint` / `npm run build`
   - **수정 후 저장 복구 확인** — 새 코드가 만드는 페이로드로 upsert해 HTTP 200과
     `updated_at` 갱신을 확인한다. **값은 현재값을 그대로 재저장**해 정책 변경분 0건으로 한다.
   - **섀도우밴 판정 복구 확인** — `shouldAllowDrop('legend', 'soft', policy)`가 `false`를
     반환하는지 확인(수정 전 `true`). 가능하면 단위 테스트로 고정한다.
   - 잘못된 페이로드로 API가 400/500 + 메시지를 응답하는지 확인.

> ⚠️ 이 저장소는 staging·프로덕션이 **단일 Supabase DB**를 공유한다. 쓰기 검증은 반드시
> 위 백업값을 기준으로 **현재값 그대로 재저장** 방식으로만 한다. 값 변경 테스트 금지.
> 어드민 화면은 staging에서 검증할 수 없으므로 실화면 확인은 프로덕션 배포 후.

### 참고 문서
- `Service Plan/Tickets/20260831_1118_Service_어드민-드랍정책-저장-조용한실패-upsert에러삼킴.md`
- `Service Plan/Specs/DEV_PROCESS_GUARDRAILS.md` 패턴 9
- `Service Plan/Specs/PRD/02_DATA_MODEL.md` `drop_policy` 절 경고 박스(같은 경고를
  `abusing_policy`에도 남겨야 한다)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

1. **(핵심 1) 읽기 경로 복구 — 섀도우밴 legend 차단 부활.** `getAbusingPolicy()`에
   `getDropPolicy()`와 동일한 정규화 파이프라인을 넣었다. DB 컬럼(`soft_legendary_rate` 등)을
   앱 키로 되돌린 뒤 `DEFAULT_POLICY` 키를 순회해 숫자로 정규화한다. 이제 반환 객체에
   `soft_legend_rate`/`hard_legend_rate`가 실제 DB값(0.0)으로 들어가므로
   `shouldAllowDrop('legend', 'soft'|'hard', policy)`가 `false`를 돌려준다(수정 전 `true`).
2. **(핵심 2) upsert 에러 삼킴 제거.** `updateAbusingPolicy()`가 반환 `error`를 확인해
   `[abusing-policy] 저장 실패` 로그를 남기고
   `abusing_policy upsert 실패 (코드): 메시지` 형태로 예외를 던진다.
3. **API가 실패를 전파.** `PUT /api/admin/abusing/policy`가 무조건 `{ ok: true }`를 응답하던
   것을 고쳐, 저장 실패 시 500 + `error`로 응답한다. 성공 시엔 `{ ok: true, policy }`로
   저장 직후 DB에서 다시 읽은 정책을 함께 돌려준다.
4. **키 화이트리스트 추가.** `DEFAULT_POLICY`의 12개 키만 통과시켜 `id`·`updated_at`·미지의 키가
   페이로드에 섞이지 않게 했다. rate 계열 8종은 0~1 범위 검증(슬라이더·`NUMERIC(3,2)` 제약),
   임계값 계열 4종은 상한 없이 0 이상만 검증한다.
5. **앱 키 ↔ DB 컬럼 매핑을 `abusing/policy.ts`에 격리.** `APP_KEY_TO_DB_COLUMN` 2건
   (`soft_legend_rate`→`soft_legendary_rate`, `hard_legend_rate`→`hard_legendary_rate`)과
   `toAppKeys`/`toDbColumns`를 추가해 읽기·쓰기 양쪽에 적용했다.
6. **무음 폴백 제거.** 조회 실패·행 없음·키 누락(기본값 대체) 세 경우 모두 `console.error`로
   남긴다. 폴백 동작 자체는 유지했다(정책 로딩 실패로 픽업 경로가 죽으면 안 됨).
7. **어드민 폼이 실패 사유를 표시.** `savePolicy()`가 `json.error`를 읽어 그대로 노출한다.
   오류 메시지는 DB 코드가 붙어 3초로는 읽기 어려워 **자동 소멸을 없애고 닫기(✕) 버튼**을 뒀다
   (성공 메시지는 기존대로 3초). 메시지 영역에 `max-w-md`+`break-words`를 줘 긴 오류로 헤더가
   깨지지 않게 했다.
8. **`RateInput` 방어.** `Number.isFinite`가 아니면 0(차단)으로 폴백해 비제어 렌더와
   "정상" 오표시를 막는다. 읽기 경로 복구로 발생하지 않게 됐지만 안전망으로 남겼다.
9. **`@ts-expect-error` 재점검.** 지시자를 제거하고 tsc를 돌려 실제 오류
   (`TS2345: ... not assignable to parameter of type 'never[]'`)를 확인, 억제가 여전히 필요함을
   실증하고 사유 주석을 갱신했다.
10. **DB 컬럼 개명·마이그레이션 SQL 없음.** 매핑 상수·`AbusingPolicyRow`·PRD 세 곳에
    "등급명 개명 작업에서 함께 제거할 것" 주석을 남겼다.

### 변경된 파일
```
jam-web/src/lib/abusing/policy.ts
jam-web/src/app/api/admin/abusing/policy/route.ts
jam-web/src/app/admin/abusing/AbusingClient.tsx
jam-web/src/types/database.ts
jam-web/src/lib/abusing/__tests__/policy-shadow-ban.test.ts   (신규)
Service Plan/Specs/PRD/02_DATA_MODEL.md
```

### 테스트 결과
- [x] `npx tsc --noEmit` 통과 (오류 0)
- [x] `npm run lint` 전체 실행 — 오류 0 / 경고 25건 (전부 기존 미사용 변수 경고, 변경 파일과 무관.
      변경 전 기준선과 동일 건수)
- [x] `npm run build` 성공
- [x] **신규 단위 테스트 7건 통과** (`npx vitest run src/lib/abusing/__tests__/policy-shadow-ban.test.ts`)
      — `createServiceClient`를 스텁해 DB 컬럼명 그대로의 행을 내려주고
      ① 앱 키 매핑 ② NUMERIC 문자열 정규화 ③ 키 누락 시 기본값 폴백 + `console.error`
      ④ 소프트밴 legend/mythic 차단 ⑤ 하드밴 common만 허용 ⑥ 밴 없으면 전부 허용
      ⑦ 기본 정책도 소프트밴 legend 차단 — 을 고정했다
- [x] `@ts-expect-error` 제거 실험으로 억제 필요성 실증
- [ ] **저장 복구 확인 (DB 쓰기)** — 공용 프로덕션 DB이므로 서브에이전트가 수행하지 않았다.
      사용자 승인 후 오케스트레이터가 현재값 그대로 재저장(정책 변경분 0건) 방식으로 실행하고
      `updated_at`이 `2026-08-13T01:28:00`에서 갱신되는지 확인할 것
- [ ] 어드민 실화면 저장 확인 — 어드민은 staging 검증 대상이 아니므로 **프로덕션 배포 후**
      `/admin/abusing`에서 수행

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

추가·수정된 노출 문구는 어드민 폼 오류 4종이다.

> (저장 실패 500) 어뷰징 정책이 저장되지 않았어요. 데이터베이스가 요청을 거부했어요.
> 다시 시도해도 같으면 괄호 안 오류 내용을 개발자에게 전달해 주세요. (abusing_policy upsert 실패 (PGRST204): …)
>
> (검증 400) 어뷰징 정책이 저장되지 않았어요. {키} 값이 0 이상의 숫자가 아니에요. 값을 확인하고 다시 저장해 주세요.
>
> (검증 400) 어뷰징 정책이 저장되지 않았어요. {키} 값이 0~1 범위를 벗어났어요. 0~1 사이로 맞추고 다시 저장해 주세요.
>
> (네트워크) 어뷰징 정책이 저장되지 않았어요. 서버에 연결하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.

선행 티켓 20260831_1118의 문구를 따르되 위치 지시어는 실제 렌더 구조에 맞춰 "괄호 안"을 썼다
(메시지가 단일 `<span>` 한 덩어리로 렌더되므로 "아래"에 해당하는 영역이 없다).
검증 오류(400)는 선행 티켓의 `합니다`체(`${key}: 0 이상의 숫자여야 합니다.`)를 그대로 쓰지 않고
해요체 3단계 구조로 바꿨다 — 이 문구는 이번 변경으로 **처음 화면에 노출**되기 때문이다.

- [x] 용어 일관성: 고정 용어만 사용 (드랍·픽업 등, 신용어 없음)
- [x] 톤앤매너: 오류 상황 = 전문적인 톤
- [x] 에러 메시지: [현상] 저장되지 않았어요 → [원인] DB 거부/값 범위/연결 실패
      → [해결책] 재시도·값 수정·오류 내용 전달. 어드민 화면이므로 원인 특정을 위해
      DB 오류 메시지와 필드 키를 함께 노출
- [x] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [x] 표기 규칙: 해당 없음 (날짜/금액 표기 없음)

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

- **읽기 폴백은 유지하되 무음을 없앴다.** 폴백을 제거하면 정책 로딩 실패가 픽업 경로 전체를
  죽인다. 대신 조회 실패·행 없음·키 누락 세 경우에 `console.error`를 넣어, 같은 종류의 결함이
  다시 생기면 서버 로그에 반드시 남게 했다(가드레일 패턴 9 규칙 3).
- **`RateInput`의 undefined 폴백을 0(차단)으로 잡았다.** 값 미상일 때 "정상"(허용)으로 보이는
  것보다 "차단"으로 보이는 쪽이 안전 방향이고, 실제 DB값도 0.0이라 오조작 위험이 낮다.
- **성공 응답에 `policy`를 실었다.** 저장 직후 DB에서 다시 읽은 값으로 폼 상태를 맞춰,
  화면이 실제 저장 결과와 어긋나는 경로를 하나 더 닫았다. `{ ok: true }`도 함께 유지해
  기존 호출 형식과 호환된다.
- **DB 컬럼을 고치지 않고 코드 매핑으로 대응했다.** 등급명 개명 작업에
  `soft_legendary_rate`/`hard_legendary_rate` 개명이 포함돼 있어 컬럼을 두 번 건드리지 않기 위함.
  마이그레이션 SQL 신규 작성 없음.

### 잔여 이슈

- **DB 쓰기 검증(저장 복구 확인)이 남아 있다.** 공용 프로덕션 DB라 서브에이전트가 실행하지
  않았다. 현재값 그대로 재저장 방식으로 오케스트레이터가 수행할 것.
- 등급명 개명 작업 시 `APP_KEY_TO_DB_COLUMN`·`toAppKeys`·`toDbColumns`,
  `database.ts`의 `AbusingPolicyRow` 주석, `02_DATA_MODEL.md` 11절 경고 박스를 함께 정리할 것.
- `database.ts`(수기)와 `database.generated.ts`(생성)가 이 두 컬럼에서 여전히 어긋나 있다.
  이번엔 주석으로만 정리했다.
- **운영 안내 필요** — 2026-08-13 이후 어드민에서 저장한 어뷰징 정책 값이 하나도 반영되지
  않았고, 같은 기간 **소프트/하드밴 유저의 legend 배지가 차단되지 않고 정상 발급**됐다.
  프로덕션 배포 후 운영자에게 정책 값 재확인을 안내해야 한다.
- (범위 밖·미수정) `shadow-ban.ts:43`의 `policy[rateKey] as number ?? 1.0` 폴백은 그대로 뒀다.
  키 누락을 "허용"으로 해석하는 구조라 이번 결함을 증폭시킨 실질적 원인이다. 정책 로더가
  키를 보장하게 됐으므로 현재는 도달 불가지만, `?? 0`(차단 방향)으로 바꾸는 편이 안전하다.
