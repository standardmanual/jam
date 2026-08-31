---
id: 20260831_1149
category: Service
status: CLOSED
created: 2026-08-31
closed: 2026-08-31
---

# [Service] 어드민 어뷰징 정책 저장이 조용히 실패 — upsert 에러 삼킴 + 화이트리스트 부재

## 배경 / 문제 정의

어드민 어뷰징 정책 화면(`/admin/abusing`)에서 저장하면 "정책이 저장됐어요"가 뜨지만
**DB에는 아무 값도 반영되지 않는다.** `abusing_policy.updated_at`이 2026-08-13T01:28:00에
멈춰 있다. 직전 티켓 20260831_1118(드랍 정책)과 동일 구조의 결함이다.

> ⚠️ **이 티켓은 2026-08-31 11:49 최초 작성 후 전제가 바뀌어 12:2x에 재작성됐다.**
> 최초 스펙은 "앱 키 ↔ DB 컬럼 매핑을 추가해 컬럼명 불일치를 코드에서 흡수한다"였다.
> 그러나 작업 중 티켓 20260831_1115(등급명 legend·mythic → epic·mystic)가 staging에 머지되면서
> **`abusing_policy` 컬럼 개명이 그 티켓의 마이그레이션 115로 이미 처리됐다.**
> 따라서 **매핑은 넣지 않는다.** 최초 구현(브랜치 `claude/jamwork-20260831_1149-abusing-policy-save`,
> 커밋 `c1685462`)은 폐기하고, 매핑을 뺀 나머지를 최신 staging 위에서 다시 구현한다.

### 실측으로 확인한 사실 (2026-08-31)

1. **저장이 전량 롤백된다** — 폼이 보내는 페이로드로 PostgREST에 직접 upsert한 결과:
   ```
   HTTP 400
   {"code":"PGRST204","message":"Could not find the 'hard_legend_rate' column of 'abusing_policy' in the schema cache"}
   ```
   같은 요청에 실은 `gps_max_speed_kmh=999`도 **함께 롤백**돼 `300` 그대로였다.
   즉 등급 배율 외 필드(GPS 임계값, POI 블록 시간 등)까지 전부 저장되지 않는다.
   → **컬럼명 원인 자체는 마이그레이션 115가 해소한다. 이 티켓이 고치는 것은
   "실패했는데 성공으로 응답한다"는 부분이다.**

2. **에러를 삼킨다** — `updateAbusingPolicy()`가 `await table.upsert(payload)`로 반환 `error`를
   버린다(`Promise<void>`). `api/admin/abusing/policy/route.ts:18-19`는 결과와 무관하게
   무조건 `{ ok: true }`를 응답한다. 실패 신호가 어디에도 남지 않는다.

3. **키 화이트리스트가 없다 (드랍 정책보다 위험)** — 라우트가 요청 `body`를 검증 없이 그대로
   `updateAbusingPolicy`에 넘긴다. drop-policy 라우트(`api/admin/drop-policy/route.ts:20-29`)에
   있는 "허용 키만 추출 + 숫자 검증" 루프가 없다. 폼이 미지의 키를 하나만 보내도 전체 저장이
   롤백되고 그마저 무음이다. 실제로 폼은 `id`·`updated_at`까지 실어 보낸다.

4. **읽기 경로에 정규화·관측이 없다** — `getAbusingPolicy()`는 `data`를 그대로 반환한다.
   `getDropPolicy()`에 있는 숫자 정규화·조회 실패 로그가 없어, 컬럼이 어긋나도 조용히 통과한다.
   실제로 이 무음 구간에서 **2026-08-13 이후 18일간 소프트밴·하드밴 유저의 legend 드랍 차단이
   무력화된 상태**가 아무 신호 없이 유지됐다(`shadow-ban.ts:43`의 `?? 1.0` 폴백).

5. **폼이 API 오류 메시지를 버린다** — `AbusingClient.tsx:73-76`이
   `if (!res.ok) throw new Error()` → `flash('err', '저장 실패')`. 드랍 정책 폼(`json.error`를 읽음)과
   달리 API가 원인을 실어 보내도 화면에 뜨지 않는다. **API만 고쳐서는 부족하다.**

6. **`abusing_policy` 접근 지점이 단일하지 않다** — `src/lib/strava/sync.ts:459`도 직접 읽는다
   (`select('vehicle_speed_filter_kmh')`). 이번 변경과 무관하나 기록해 둔다.

### 조사 시점 DB 백업값 (2026-08-31, 마이그레이션 115 실행 **전**)
```json
{"id":1,"soft_common_rate":1.0,"soft_rare_rate":1.0,"soft_legendary_rate":0.0,"soft_mythic_rate":0.0,
 "hard_common_rate":1.0,"hard_rare_rate":0.0,"hard_legendary_rate":0.0,"hard_mythic_rate":0.0,
 "gps_max_speed_kmh":300,"poi_block_hours":72,"vehicle_speed_filter_kmh":60,
 "gps_daily_distance_cap_km":3000,"updated_at":"2026-08-13T01:28:00.090694+00:00"}
```

## 상세 요구사항

### 서비스/코드베이스 관점

- **(핵심 1) upsert 에러를 삼키지 않는다.** `updateAbusingPolicy()`가 반환 `error`를 확인하고
  실패 시 예외를 던진다. 서버 로그도 남긴다.
- **(핵심 2) API 라우트가 실패를 전파한다.** `PUT /api/admin/abusing/policy`가 저장 실패를
  200으로 응답하지 않고 **500 + `error` 메시지**로 응답한다.
- **(핵심 3) 키 화이트리스트를 추가한다.** `DEFAULT_POLICY`의 키만 통과시켜
  `id`·`updated_at`·미지의 키가 upsert 페이로드에 섞이지 않게 한다.
  - **배율 8종**(`soft|hard_{common,rare,epic,mystic}_rate`)은 **0~1** 범위를 벗어나면 400.
  - **임계값 4종**(`gps_max_speed_kmh`·`poi_block_hours`·`vehicle_speed_filter_kmh`·
    `gps_daily_distance_cap_km`)은 **0 이상**만 확인하고 **상한을 씌우지 않는다.**
    drop-policy 라우트를 그대로 복사하면 안 되는 지점이다.
- **(핵심 4) 폼이 API 오류 사유를 노출한다.** `AbusingClient.savePolicy()`가 응답 본문의
  `json.error`를 읽어 표시한다. 오류 메시지는 DB 코드가 붙어 길어지므로 3초 자동 소멸이
  적절한지 함께 판단한다(성공 메시지 동작은 유지).
- **읽기 경로에 정규화와 관측을 넣는다.** `getAbusingPolicy()`가 조회 `error`·행 없음·키 누락을
  `console.error`로 남기고, NUMERIC이 문자열로 내려오는 경우에 대비해 숫자로 정규화한다.
  기본값 폴백 자체는 유지한다(정책 로딩 실패로 픽업 경로가 죽으면 안 됨).

  > ⚠️ **정규화 결과는 원본 행의 상위집합이어야 한다.** `getDropPolicy()`처럼
  > "`DEFAULT_POLICY` 키만 추려 새 객체를 만드는" 방식을 쓰면 안 된다. 마이그레이션 115가
  > **아직 실행되지 않은 구간**에서는 DB에 구 컬럼명(`soft_mythic_rate` 등)이 남아 있고,
  > `shadow-ban.ts`는 런타임 `rarity` 값(현재 DB enum 기준 `'mythic'`)으로 키를 조합하므로
  > 그 키가 결과에서 탈락하면 **지금 정상 작동 중인 mythic 차단이 꺼진다.**
  > `{ ...row, ...정규화된_DEFAULT_POLICY_키 }` 형태로 미지의 키를 그대로 통과시킬 것.
  > 115 실행 후에는 이 상위집합 동작이 불필요해지므로 **주석으로 제거 시점을 남긴다.**

### UI/UX 관점

- 에러 문구는 `Specs/UX_WRITING_GUIDELINE.md`의 [현상] → [원인] → [해결책] 3단계 구조를 따른다.
  어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다.
- **위치 지시어는 실제 렌더 구조에 맞춘다.** 선행 티켓 20260831_1118에서 "아래" → "괄호 안"으로
  교정한 이력이 있다.
- 최초 구현(`c1685462`)이 작성한 아래 문구는 개선 리뷰에서 가이드 준수 판정을 받았다. 재사용한다:
  - 400(비숫자): `어뷰징 정책이 저장되지 않았어요. {key} 값이 0 이상의 숫자가 아니에요. 값을 확인하고 다시 저장해 주세요.`
  - 400(범위): `어뷰징 정책이 저장되지 않았어요. {key} 값이 0~1 범위를 벗어났어요. 0~1 사이로 맞추고 다시 저장해 주세요.`
  - 500: `어뷰징 정책이 저장되지 않았어요. 데이터베이스가 요청을 거부했어요. 다시 시도해도 같으면 괄호 안 오류 내용을 개발자에게 전달해 주세요. ({detail})`

### 범위 밖 (이번 티켓에서 하지 않는다)

- **DB 컬럼 개명·마이그레이션 SQL 신규 작성을 하지 않는다.** 마이그레이션 115(티켓 20260831_1115)가
  이미 담당한다. **앱 키 ↔ DB 컬럼 매핑 상수(`APP_KEY_TO_DB_COLUMN` 류)를 추가하지 않는다.**
- **섀도우밴 epic 차단을 켜지 않는다.** 마이그레이션 115의 5절이 사용자 확인(2026-08-31) 하에
  `soft_epic_rate = 1.00` / `hard_epic_rate = 1.00`으로 **차단을 끈 채 유지**하기로 결정했다.
  이 티켓은 저장 경로 복구와 관측 확보까지만 하고, **정책 값은 건드리지 않는다.**
  차단을 실제로 켤지는 어뷰징 현황을 본 뒤 별도 티켓에서 판단한다.
- **`shadow-ban.ts:43`의 `?? 1.0`(fail-open)을 바꾸지 않는다.** `?? 0`(fail-closed)이 구조적으로
  안전하지만, 115 미실행 구간에서 곧바로 차단이 켜져 위 결정과 어긋난다. 후속 티켓 대상.
- 선행 티켓이 남긴 다른 후속 항목(에러 삼킴 잔존 5곳, 같은 화면의 `addBan`·`removeBan`·
  `removePoiBlock` 무음 실패)은 범위 밖이다. 발견 사항은 `sideFindings`로만 보고한다.

## 구현 계획

1. `jam-web/src/lib/abusing/policy.ts`
   - `DEFAULT_POLICY`를 export(라우트 화이트리스트가 키 목록으로 씀). 배율 키 집합도 함께 export.
   - `getAbusingPolicy()`: `error` 구조분해 → 실패·행 없음 시 `console.error` 후 기본값 폴백.
     성공 시 **`{ ...row, ...정규화된 DEFAULT_POLICY 키 }`** 로 상위집합 반환. 키 누락은 `console.error`.
   - `updateAbusingPolicy()`: upsert 반환 `error` 확인 후 throw.
   - `@ts-expect-error`(52행) 재점검 — 여전히 필요하면 사유 주석 갱신, 아니면 제거.
2. `jam-web/src/app/api/admin/abusing/policy/route.ts`
   - PUT에 화이트리스트 + 숫자 검증(배율 8종 0~1, 임계값 4종 0 이상·상한 없음).
   - `updateAbusingPolicy` try/catch → 실패 시 500 + `error`.
   - 성공 응답은 폼이 읽는 형태에 맞춘다(드랍 정책처럼 갱신된 policy 동봉 검토).
3. `jam-web/src/app/admin/abusing/AbusingClient.tsx`
   - `savePolicy()`가 `json.error`를 읽어 표시. 오류 메시지 노출 시간 검토.
4. 단위 테스트 — `createServiceClient` 스텁으로 다음을 고정한다:
   - `getAbusingPolicy()`가 **DEFAULT_POLICY에 없는 키도 보존**한다 (115 미실행 구간 회귀 가드).
   - 키 누락 시 기본값 폴백 + `console.error` 호출.
   - `updateAbusingPolicy()`가 upsert `error`를 받으면 throw하고, 정상 시 페이로드에
     화이트리스트 밖 키가 없다.
5. 검증
   - `npx tsc --noEmit` / `npm run lint` **전체** / `npm run build`
   - **저장 복구 확인은 DB 쓰기라 오케스트레이터가 사용자 승인 하에 수행한다.**
     현재값 그대로 재저장 → `updated_at` 갱신 확인, 정책 값 변경분 0건.

> ⚠️ staging·프로덕션이 **단일 Supabase DB**를 공유한다. 값을 바꾸는 쓰기 테스트 금지.
> 어드민 화면은 staging 검증 대상이 아니므로 실화면 확인은 프로덕션 배포 후.

### 참고 문서
- `Service Plan/Tickets/20260831_1118_Service_어드민-드랍정책-저장-조용한실패-upsert에러삼킴.md`
- `Service Plan/Tickets/20260831_1115_Infra_배지등급명-legend-mythic을-epic-mystic으로-변경.md`
- `jam-web/supabase/migrations/115_rename_rarity_epic_mystic.sql` (4·5절)
- `Service Plan/Specs/DEV_PROCESS_GUARDRAILS.md` 패턴 9

---
## 완료 기록

### 구현 내용 요약

1. **upsert 에러 삼킴 제거** — `updateAbusingPolicy()`가 upsert 반환 `error`를 확인해
   `[abusing-policy] 저장 실패` 로그를 남기고 `abusing_policy upsert 실패 (코드): 메시지`
   형태로 예외를 던진다.
2. **API가 실패를 전파** — `PUT /api/admin/abusing/policy`가 `updateAbusingPolicy` 호출을
   try/catch로 감싸 실패 시 500 + `error`로 응답한다. 성공 시에는 저장 직후 재조회한 policy를
   동봉해 폼이 실제 반영값으로 화면을 맞춘다.
3. **키 화이트리스트 추가** — `Object.keys(DEFAULT_POLICY)` 12종만 순회한다. 폼이 함께 보내던
   `id`·`updated_at`과 미지의 키는 구조적으로 페이로드에 들어갈 수 없다. 배율 8종(`RATE_KEYS`)은
   0~1 범위를 벗어나면 400, 임계값 4종(`gps_max_speed_kmh`·`poi_block_hours`·
   `vehicle_speed_filter_kmh`·`gps_daily_distance_cap_km`)은 **상한을 두지 않는다.**
4. **읽기 경로에 정규화와 관측 추가** — `getAbusingPolicy()`가 조회 `error`·행 없음·키 누락을
   `console.error`로 남기고 NUMERIC 문자열을 숫자로 정규화한다. 폴백 자체는 유지했다
   (정책 로딩 실패로 픽업 경로가 죽으면 안 됨).
5. **반환은 원본 행의 상위집합** — `{ ...row, ...normalized }`. `getDropPolicy()` 방식
   (`DEFAULT_POLICY` 키만 추려 새 객체 생성)을 복사하면 마이그레이션 115 미적용 구간에서
   DB의 구 컬럼(`soft_mythic_rate` 등)이 탈락하고, `shadow-ban.ts:43`의 `?? 1.0` 폴백을 타면서
   **당시 정상 작동 중이던 Mystic 차단이 꺼지는 회귀**가 났을 것이다. 단위 테스트로 고정했다.
6. **폼이 실패 사유를 노출** — `AbusingClient.savePolicy()`가 `json.error`를 읽어 표시한다.
   오류 메시지는 DB 코드가 붙어 길어지므로 3초 자동 소멸 대신 닫기 버튼으로 닫고
   (성공 메시지는 기존 3초 유지), 응답 policy로 폼 상태를 재동기화한다.
7. **매핑 상수를 넣지 않았다.** 최초 스펙은 `APP_KEY_TO_DB_COLUMN` 매핑이었으나, 작업 중
   티켓 20260831_1115가 staging에 머지되면서 마이그레이션 115가 컬럼 개명을 직접 처리했다.
   1차 구현(`c1685462`)은 폐기하고 매핑 없이 재구현했다. 상세는 "주요 의사결정" 참조.

### 변경된 파일
```
jam-web/src/lib/abusing/policy.ts
jam-web/src/app/api/admin/abusing/policy/route.ts
jam-web/src/app/admin/abusing/AbusingClient.tsx
jam-web/src/lib/abusing/__tests__/policy-save.test.ts  (신규)
Service Plan/Specs/DEV_PROCESS_GUARDRAILS.md            (문서)
Service Plan/Specs/SERVICE_OPERATIONS.md                (문서)
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 오류 0 (오케스트레이터 직접 재현)
- [x] `npm run lint` **전체** — 오류 0 / 경고 25건 (전부 기존 파일, 변경 3파일 유래 0건. 오케스트레이터 직접 재현)
- [x] `npm run build` 성공
- [x] `npx vitest run src/lib/abusing/__tests__/policy-save.test.ts` — **12/12 통과** (오케스트레이터 직접 재현)
- [x] `npx vitest run --dir src` 전체 606/609. 실패 3건(`sync-drop-order.test.ts` 2건,
      Storybook `BadgeRevealCarousel` 1건)은 **변경 전 staging 원본에서도 동일 실패**하는
      환경 의존 케이스(워크트리에 `.env.local` 심볼릭 링크 부재)
- [x] **회귀 가드 실효성 실증** — 반환을 `{ ...normalized }`로 되돌리면 "115 미적용 구간에서
      구 컬럼 키를 보존한다" 테스트가 red로 전환됨을 확인 후 원복
- [x] **실패 재현** (수정 전, PostgREST 직접 호출) — 구 페이로드는
      `HTTP 400 / PGRST204: Could not find the 'hard_legend_rate' column of 'abusing_policy'`.
      같은 요청에 실은 `gps_max_speed_kmh=999`도 함께 롤백돼 `300` 유지 → 전체 실패 확정
- [x] **저장 복구 확인** (수정 후, 사용자 승인 하에 실행 2026-08-31) — 새 코드가 만드는
      페이로드(화이트리스트 12키 + `id` + `updated_at`)로 upsert 실행 결과 **HTTP 200**,
      `updated_at`이 `2026-08-13T01:28:00` → `2026-08-31T03:48:29`로 **18일 만에 갱신**.
      값은 현재값을 그대로 재저장해 **정책 값 변경분 0건**(운영 영향 없음).
      쓰기 전 행 전체를 백업했고 대조 결과 `updated_at` 외 차이 없음
- [ ] 어드민 실화면 저장 확인 — 어드민은 staging 검증 대상이 아니므로 **프로덕션 배포 후**
      `/admin/abusing`에서 수행

### UX Writing 검증
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

추가된 노출 문구 5종 (400 비숫자 / 400 범위 / 500 DB 거부 / 클라이언트 상태코드 폴백 / 네트워크 실패).
대표 문구:

> 어뷰징 정책이 저장되지 않았어요. 데이터베이스가 요청을 거부했어요. 다시 시도해도 같으면
> 괄호 안 오류 내용을 개발자에게 전달해 주세요. (abusing_policy upsert 실패 (PGRST204): …)

- [x] 용어 일관성: 고정 용어만 사용 (드랍·픽업·체크인 등). 화면에 `legendary` 신규 노출 없음
- [x] 톤앤매너: 오류 상황 = 전문적인 톤
- [x] 에러 메시지: [현상] 저장되지 않았어요 → [원인] 데이터베이스가 요청을 거부했어요
      → [해결책] 다시 시도, 반복되면 오류 내용 전달. 어드민이므로 원인 특정을 위해 DB 오류를 괄호로 병기
- [x] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [x] 위치 지시어: "괄호 안"이 실제 렌더 구조와 일치 (단일 `div`에 `break-words`로 한 덩어리 렌더).
      선행 티켓 20260831_1118에서 교정한 "아래"류 오지시 재발 없음
- [x] 표기 규칙: 해당 없음 (날짜/금액 표기 없음)
- [!] 400 문구가 DB 컬럼명 원문(`soft_epic_rate`)을 문장 중간에 노출한다. 어드민 전용 +
      원인 특정 우선이라 허용 범위로 판단. 슬라이더가 `step 0.1`이라 폼에서 400에 닿기 어렵고
      실질 노출은 API 직접 호출 시뿐이다

### 배포 정보
- 배포일: 2026-08-31
- 환경: staging (프로덕션 승격은 `/jam-ship`으로 별도 진행)
- 커밋: `9974d374`(구현)

### 주요 의사결정 / 핵심 메모

- **작업 중 전제가 바뀌어 1차 구현을 폐기했다.** 최초 스펙(11:49)은 "앱 키 ↔ DB 컬럼 매핑을
  `abusing/policy.ts`에 격리한다"였고 1차 구현(`c1685462`)이 그대로 만들었다. 그러나 파이프라인이
  도는 사이 티켓 20260831_1115(등급명 legend·mythic → epic·mystic)가 staging에 머지됐고,
  그 마이그레이션 115가 **`abusing_policy` 컬럼 개명까지 담당**했다(SQL 4절, "티켓 본문 외
  추가 발견분"). 매핑은 태어나자마자 제거 대상이 되므로 티켓을 재작성하고 매핑 없이 재구현했다.
  1차 구현은 브랜치 `claude/jamwork-20260831_1149-abusing-policy-save`에 보존돼 있다.
- **읽기 정규화를 `getDropPolicy()`와 다르게 만들었다.** 드랍 정책은 `DEFAULT_DROP_POLICY` 키만
  추려 새 객체를 만들지만, 어뷰징 정책은 `{ ...row, ...normalized }` 상위집합으로 돌려준다.
  재구현 시점에 마이그레이션 115가 아직 DB에 적용되지 않아 구 컬럼명이 남아 있었고,
  `shadow-ban.ts`가 런타임 `rarity` 값으로 키를 문자열 조합하므로 구 키를 떨어뜨리면
  Mystic 차단이 꺼졌을 것이다. **115가 적용된 지금은 `...row` 스프레드 없이도 동작하지만,
  롤백 안전성을 위해 유지했다** (잔여 이슈 참조).
- **섀도우밴 Epic 차단을 켜지 않았다.** 마이그레이션 115 §5가 사용자 확인(2026-08-31) 하에
  `soft_epic_rate` = `hard_epic_rate` = **1.00**으로 차단을 끈 채 유지하기로 결정했다.
  이 티켓은 저장 경로 복구와 관측 확보까지만 하고 정책 값은 건드리지 않았다.
  **차단을 실제로 켤지는 어뷰징 현황을 본 뒤 별도 티켓에서 판단한다.**
- **`shadow-ban.ts:43`의 `?? 1.0`(fail-open)을 바꾸지 않았다.** `?? 0`이 구조적으로 안전하지만
  115 미적용 구간에서 곧바로 차단이 켜져 위 결정과 어긋났다. 후속 티켓으로 분리했다.
- **`@ts-expect-error` 재점검** — 제거하면 tsc가 실패해 억제가 여전히 필요함을 실증하고
  사유 주석만 갱신했다.
- **DB 컬럼 개명·마이그레이션 SQL 신규 작성 없음.** 커밋의 변경 파일에 `.sql` 0건.

### 잔여 이슈

- **`policy.ts`의 `{ ...row, ... }` 상위집합 스프레드는 제거 조건이 이미 충족됐다.**
  마이그레이션 115가 2026-08-31 적용돼 DB 컬럼과 앱 키가 일치한다. 롤백 안전성 때문에 이번엔
  유지했으나, 115 롤백 가능성이 닫히면 `normalized`만 반환해도 된다. 주석에만 조건이 있으면
  패턴 6(암묵적 등록 지점)이 되므로 여기 남긴다.
- **어드민 실화면 저장 확인이 남아 있다.** 프로덕션 배포 후 `/admin/abusing`에서 수행.
- **운영 안내 필요** — 2026-08-13 이후 이 화면에서 저장한 어뷰징 정책 값(GPS 임계값·POI 블록
  시간 포함)이 **하나도 반영되지 않았다.** 조정했다고 믿은 값이 미적용이므로 운영자에게
  **정책 값 재확인**을 안내해야 한다. (드랍 정책도 2026-07-21 이후 동일 — 티켓 20260831_1118)

#### 범위 밖 발견물 — 후속 티켓으로 분리 (사용자 승인, 2026-08-31)

1. **`strava/sync.ts:458`의 truthy 검사 버그** — `if (abusingPolicy && ...vehicle_speed_filter_kmh)`가
   truthy 검사라 값이 `0`이면 falsy로 떨어져 하드코딩 60이 적용된다. 라우트 검증이 `n < 0`만
   막으므로 어드민에서 0은 저장 가능한 값이다. "차량 속도 필터 끄기"가 조용히 무시된다.
   같은 지점이 `abusing_policy`를 `getAbusingPolicy()`를 우회해 직접 select하며 `error`도 확인하지 않는다.
2. **`DEFAULT_POLICY` ↔ 운영값 불일치 + fail-open** — 기본값 `soft_epic_rate`·`hard_epic_rate`가
   0.0(차단)인데 실제 DB는 1.00(차단 꺼짐)이다. 조회 실패로 폴백하는 순간 115 §5 결정과
   반대로 Epic 차단이 켜진다. `shadow-ban.ts:43`의 `?? 1.0` fail-open과 함께 정리 대상.
3. **`drop-policy/route.ts`의 400 문구 3종이 합니다체 잔존** — 같은 파일 500만 해요체로
   갱신돼 한 파일 안에서 톤이 갈린다.

미분리(기록만): 어드민 밴 부여·해제 무음 실패(`shadow-ban.ts`의 `applyBan`·`removeBan`·
`logAbusingEvent`가 `error`를 버리고, `AbusingClient`에 else 분기가 없음),
`gps_daily_distance_cap_km`의 어드민 입력 UI 부재, `sync-drop-order.test.ts` 상시 red 2건.

### 프로세스 반영

`Specs/DEV_PROCESS_GUARDRAILS.md` 패턴 9에 다음을 추가했다:
- **실제 사례 2** — 저장 무음 실패에 읽기 경로의 무관측 폴백이 겹쳐 **핵심 루프의 판정이
  18일간 조용히 뒤집힌** 케이스. 기존 사례(20260831_1118)는 "값이 안 바뀐다"에서 끝났다.
- **규칙 5** — 정규화·폴백은 원본 행을 대체하지 말고 덮어쓰기만 한다(상위집합 유지).
- **규칙 6** — 안전·차단 판정 값의 폴백 방향을 의식적으로 고르고, fail-open이면 주석으로 남긴다.
- **규칙 7** — 실패 전파는 API까지가 아니라 화면까지다(폼이 `json.error`를 읽는지 확인).
- **핵심 루프 의존성 지도**에 `abusing_policy` 행 신설 — 접근 지점이 `policy.ts` 단일이 아님이
  이번 조사로 드러났다(`shadow-ban.ts`의 문자열 키 조합, `strava/sync.ts`의 우회 조회).

`Specs/SERVICE_OPERATIONS.md` §12-5를 실측 기준으로 정정했다 — `PATCH` → `PUT`, 컬럼 7종 →
12종 전체 기재, `soft|hard_epic_rate` 값 0.0 → **1.00**(실측), 화이트리스트·검증 규칙 명시.
§12-3에도 "Epic 차단은 설계 의도이며 현재는 꺼져 있다"는 단서를 달았다.
