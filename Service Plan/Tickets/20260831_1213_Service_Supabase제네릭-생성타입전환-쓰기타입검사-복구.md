---
id: 20260831_1213
category: Service
status: CLOSED
created: 2026-08-31
closed: 2026-08-31
---

# [Service] Supabase 클라이언트 제네릭을 생성 타입으로 전환 — 쓰기 페이로드 타입 검사 복구

## 배경 / 문제 정의

티켓 [20260831_1158](20260831_1158_Infra_수기타입-생성타입-불일치-전수점검.md)(CLOSED) 조사의
**추천안 실행 티켓**이다. 그 티켓 "잔여 이슈 2번"에 별도 티켓이 필요하다고 명시돼 있다.

### 확정된 사실 (재조사 불필요 — 20260831_1158에서 전부 실측됨)

1. **수기 `src/types/database.ts`가 Row를 `export interface XxxRow`로 선언한다.**
   TypeScript에서 `interface`는 암묵적 인덱스 시그니처를 갖지 않아 supabase-js의
   `GenericTable`(`Row: Record<string, unknown>`) 제약을 만족하지 못한다.

2. **그 결과 모든 쓰기 페이로드가 `never[]`로 추론된다.** 올바른 컬럼을 써도 컴파일 오류가 난다.

3. **그래서 쓰기 지점마다 `@ts-expect-error`가 달렸고, 그 지시자가 컬럼명 검증까지 함께 껐다.**
   어드민 드랍 정책 저장이 41일간 조용히 실패한 사고([20260831_1118](20260831_1118_Service_어드민-드랍정책-저장-조용한실패-upsert에러삼킴.md))가
   컴파일에서 안 잡힌 직접 원인이다.

4. **제네릭을 생성 타입으로 바꾸면 검사가 살아난다 — tsc로 실증됨.**

   ```
   생성 타입 + soft_legend_rate (DB에 없는 컬럼)  → TS2345 오류로 검출 ✅
   생성 타입 + soft_legendary_rate (실제 컬럼)    → 통과 ✅
   생성 타입 + 존재하지 않는 컬럼                  → TS2345 오류로 검출 ✅
   ```

5. **전환점은 3줄뿐이다.** 수기 타입을 import하는 168개 파일은 대부분 Row 타입을 도메인
   용도로 쓸 뿐이고, `Database` 제네릭 주입은 `client.ts:9`·`server.ts:13`·`server.ts:41` 3곳뿐이다.

6. **생성 타입은 이미 최신이다.** 20260831_1158에서 마이그레이션 113·114를 반영해 재생성했고
   (커밋 `facf9ddb`), DB `information_schema` 3자 대조에서 불일치 0건을 확인했다.

### 억제 현황 — 조사 시점보다 늘었다

| 시점 | `@ts-expect-error` 개수 | 파일 수 |
|---|---|---|
| 20260831_1158 조사 당시 | 92 | 55 |
| **현재(2026-08-31 12:13 실측)** | **97** | **58** |

> ⚠️ **위 표는 틀렸다 (완료 기록에서 정정).** `grep -c`가 문서 주석에서 지시자를 **언급만** 하는
> 줄 5개까지 세서 나온 수치다. 실제 지시자는 **92개 / 55파일**로 조사 당시와 같다.
> 잔여 오류도 예측치와 정확히 같은 27건이었다.

### 조사에서 분류된 잔여 오류 원인 8종 (27건 기준, 참고용)

| 원인 | 건수 | 위치 |
|---|---|---|
| 테스트 파일 목(mock) 오버로드 | 5 | `lib/notifications/__tests__/batch-query.test.ts` |
| `award_points` RPC Args nullable (`string\|null` vs `string\|undefined`) | 4 | `lib/points/index.ts:50~53` |
| `inventory_items.obtained_by` enum 좁히기 (동일 원인 4개 호출부) | 4 | `lib/drop-engine/index.ts:467`, `lib/combine/index.ts:248`, `lib/missions/rewards.ts:119`, `app/api/admin/simulate/route.ts:139` |
| `PostgrestFilterBuilder` 대입 — supabase-js 잔여 추론 한계 | 5 | — |
| **`abusing_policy` 실제 컬럼 불일치 = 잡아내야 할 진짜 버그** | **2** | `lib/abusing/policy.ts:42,52` |
| enum/nullable 정합 기타 | 7 | `admin/item-badges/page.tsx:51`(rarity), `api/drops/poi/[poiId]/route.ts:62`(display_name), `admin/abusing/page.tsx:33,34`, `lib/abusing/gps-detector.ts:112`, `lib/abusing/shadow-ban.ts:88`, `lib/badge-engine/index.ts:762` |

**RPC 계열 억제 11개 중 10개는 자동 해소된다** — 생성 타입이 `create_user_drop`·`pickup_drop`·
`slot_item_into_book`·`mint_and_place_ambient_drop` 등을 `Functions`에 이미 담고 있다(실측).
남는 건 `award_points` 1건.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **제네릭 3줄 교체** — `jam-web/src/lib/supabase/client.ts:9`, `server.ts:13`, `server.ts:41`의
   `import type { Database }`를 `@/types/database` → `@/types/database.generated`로 바꾼다.

2. **`@ts-expect-error` 97개 제거 후 드러나는 오류 정리.**
   - **한 번에 다 걷지 말고 원인 그룹별로 처리한다.** 그룹 하나를 정리할 때마다 `tsc`를 돌려
     회귀를 즉시 확인한다.
   - 억제를 지웠는데 오류가 안 나면 그 억제는 그냥 사라진다(=불필요했음). 억제가 여전히
     **정말로** 필요한 지점이 남는다면, 왜 필요한지 사유를 주석에 정확히 남긴다
     (`Supabase 타입 추론 제한` 같은 뭉뚱그린 문구 금지 — 어떤 제한인지 구체적으로).

3. **수기 `database.ts`는 삭제하지 않는다.**
   168개 파일이 Row 타입을 도메인 용도로 import하고 있고, 각 컬럼의 의미·마이그레이션 근거
   주석이 이 저장소의 실질 자산이다. 다만 **파일 상단 주석에 "더 이상 Supabase 클라이언트
   제네릭의 진실 원천이 아니다"를 명시**한다. (진실 원천은 `database.generated.ts`)

4. **런타임 동작을 바꾸지 않는다.** 이 티켓은 타입 계층 작업이다. 타입을 맞추려고 런타임
   로직·쿼리·컬럼을 바꿔야 한다고 판단되면 멈추고 `[HALT]`로 보고한다.
   (유일한 예외: 아래 `abusing_policy` 항목의 명시적 판단)

### 범위 밖 (이번 티켓에서 하지 않는다)

- **컬럼 개명 금지.** 배지 등급명 `common/rare/legend/mythic` → `common/rare/epic/mystic` 개명
  작업이 별도로 예정돼 있고 `rarity_legendary` → `rarity_epic`, `soft/hard_legendary_rate` 개명이
  거기 포함된다. 컬럼을 두 번 건드리지 않는다.
- **`drop_policy` 중복 수정 금지.** `lib/drop-engine/policy.ts`의 `APP_KEY_TO_DB_COLUMN`으로
  이미 대응 완료다(20260831_1118).
- **`abusing_policy` 저장 복구는 별도 티켓 소관.**
  단 `lib/abusing/policy.ts:42,52`는 이번 변경으로 컴파일 오류가 되므로 그냥 둘 수 없다.
  → **작성 시점의 선택: "타입만 맞춰 통과"** — 후속 티켓이 아직 없어 순서 조율이 불가능했다.
  > ⚠️ **이 선택은 무효가 됐다.** 구현 중 티켓 20260831_1149(어뷰징 정책 저장 복구)와
  > 20260831_1115(등급명 개명)가 staging에 먼저 랜딩해, 리베이스 후에는 캐스팅 없이
  > 억제만 제거하면 되는 상태가 됐다. 완료 기록의 "staging 리베이스" 절 참조.

## 구현 계획

### 순서

1. `git checkout -b claude/jamwork-20260831_1213-supabase-generic` (staging 기준)
2. 제네릭 3줄 교체 → `tsc` 돌려 **기준선 오류 수 기록** (이 수치를 완료 기록에 남긴다)
3. `@ts-expect-error` 97개 제거 → `tsc` 재측정 → **실제 잔여 오류 수·파일 수 기록**
4. 원인 그룹별로 정리 (그룹마다 `tsc` 확인):
   - a. RPC 자동 해소 확인 (10건이 실제로 사라졌는지)
   - b. `inventory_items.obtained_by` enum 좁히기 4개 호출부 — 동일 원인이므로 함께
   - c. `award_points` Args nullable 1건
   - d. enum/nullable 정합 기타 7건
   - e. `PostgrestFilterBuilder` 대입 5건
   - f. 테스트 목 오버로드 5건 — **`npm test` 통과를 반드시 확인**
   - g. `abusing_policy` 2건 — 타입만 통과, 런타임 불변, 주석 명시
5. 수기 `database.ts` 상단 주석 갱신
6. 전체 검증 (아래 검증 절)
7. **역검증**: 억제를 제거한 쓰기 경로 중 최소 1곳에 일부러 잘못된 컬럼을 넣어
   **컴파일 오류가 실제로 나는지** 확인하고, 오류 코드·메시지를 완료 기록에 남긴 뒤 원복한다.
   **이 티켓의 존재 이유가 그것이므로 생략 불가.**

### 검증 (전부 필수)

- [ ] `npx tsc --noEmit` 종료코드 0
- [ ] `npm run lint` 오류 0 (**경고 25건은 기존 미사용 변수 경고라 유지되는 게 정상**)
- [ ] `npm run build` 성공
- [ ] `npm test` 통과 — 테스트 목 오버로드 5건을 손대므로 특히 중요
- [ ] 역검증: 잘못된 컬럼 삽입 시 컴파일 오류 발생 확인 (오류 코드·메시지 기록 후 원복)
- [ ] `git status` 클린 (역검증 흔적이 남지 않았는지)

> ⚠️ 워크트리에 `node_modules`가 없어 오케스트레이터가 `npm install`을 선행 실행했다.
> 검증 명령이 안 되면 설치 완료 여부를 먼저 확인할 것.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

Supabase 클라이언트 제네릭 3곳을 수기 `database.ts` → 생성 `database.generated.ts`로 교체하고,
`@ts-expect-error` **92개를 전부 제거**했다(잔여 0개). 드러난 오류는 원인 그룹별로 정리했다.

#### 억제 개수 정정 — 92개 / 55파일 (97개 / 58파일이 아니다)

`grep -c '@ts-expect-error'`는 **문서 주석에서 이 지시자를 언급만 하는 줄 5개**까지 센다
(`lib/engine-log/index.ts:38,44`, `lib/notifications/index.ts:39,47`, `lib/notifications/feed.ts:277` —
"@ts-expect-error 대신 좁은 캐스팅을 쓰는 이유" 설명문). 줄 시작이 실제 지시자인 것만 세면
**92개 / 55파일**로, 20260831_1158 조사 당시 수치와 동일하다. 조사 이후 늘어난 것이 아니다.

#### 실측 수치 (전환 직후 직접 재측정)

| 단계 | `tsc` 오류 | 파일 |
|---|---|---|
| 기준선(변경 전) | 0 | 0 |
| 제네릭 3줄 교체만 | 103 (그중 **84개가 TS2578 "Unused '@ts-expect-error' directive"**) | 69 |
| 억제 92개 제거 후 | **27** | **24** |
| 최종 | **0** | 0 |

**억제 92개 중 84개는 전환 즉시 불필요해졌다**(제네릭 교체만으로 오류가 사라져 지시자 쪽이
오히려 오류가 됨). 잔여 27건은 20260831_1158의 예측치와 정확히 일치했다.

#### 원인 그룹별 처리

| # | 그룹 | 건수 | 처리 |
|---|---|---|---|
| a | RPC 미등록 계열 | 11 | **전부 자동 해소.** 생성 타입 `Functions`에 이미 등록돼 있다 (`create_user_drop`·`pickup_drop`·`slot_item_into_book`·`unslot_item_from_book`·`mint_and_place_ambient_drop`·`admin_destroy_orphaned_item`·`admin_reassign_orphaned_item`·`activate_theme_preset`·`apply/count_faction_background_cascade`). 조사에서 "남는 건 `award_points` 1건"이라 한 예측대로였다 |
| b | `inventory_items` insert 4곳 | 4 | 실제 원인은 `obtained_by` enum이 아니라 **`serial_number` 누락**이었다. NOT NULL + DEFAULT 없음(migrations/034)이라 생성 타입이 Insert 필수로 잡지만 실제 값은 BEFORE INSERT 트리거 `assign_random_serial()`(migrations/108)이 채운다. `Omit<Insert,'serial_number'>`로 **그 한 컬럼만** 떼고 나머지는 계속 검사받게 했다 |
| c | `award_points` Args nullable | 4 | DB가 선택 인자를 `DEFAULT NULL`로 선언(migrations/080)하는데 생성 타입은 `?: string`(null 불허)으로 옮긴다. **보내는 값(null)은 그대로 두고** 인자 타입만 null 허용으로 넓혔다(키 집합은 생성 타입에서 파생 → 인자명 오타는 계속 잡힌다) |
| d | enum/nullable 정합 기타 | 7 | 아래 "드러난 수기 타입 드리프트" 참조 |
| e | `PostgrestFilterBuilder` 대입 5곳 | 5 | **라이브러리 추론 한계가 아니었다.** 전부 실제 nullable/도메인 타입 불일치였다 — 아래 참조 |
| f | 테스트 목 오버로드 | 5 | 스텁의 `from`을 그대로 노출(`stub.from`)해 가상 테이블명(`rows`·`composite`)을 쓰게 했다. 실제 클라이언트 타입은 실재 테이블명만 받기 때문이다. 동작은 같은 함수 |
| g | `abusing_policy` | 2 | 최초 구현에선 "타입만 통과, 런타임 불변"(티켓 지시)이었으나, **리베이스로 무효화**됐다 — 아래 "staging 리베이스" 참조. 최종본은 캐스팅 없이 억제만 제거해 **실제 컬럼 검사를 받는다** |

#### 드러난 수기 타입 드리프트 — 억제가 가리고 있던 실제 불일치

억제를 걷자 **"라이브러리 한계"로 분류돼 있던 5건이 전부 진짜 타입 불일치**로 드러났다.

| 위치 | 수기/로컬 타입 | DB 실제 | 처리 |
|---|---|---|---|
| `notifications/batch/following.ts`·`collections.ts` | `inventory_id: string` | **NULL 허용** (migrations/108 "주인 없음") | nullable로 정정 + 명시적 null 가드(기존에도 Map 조회가 빗나가 걸러지던 경로라 동작 동일) |
| `app/(main)/[username]/page.tsx` | `badges.image_url: string` | **NULL 허용** | nullable로 정정 |
| `api/drops/poi/[poiId]/route.ts` | `users.username: string` | **NULL 허용** | nullable로 정정 (`getDisplayName()`이 이미 null을 받는다) |
| `admin/abusing/{BanTable,PoiBlockTable}.tsx` | `user.username: string` | **NULL 허용** | nullable로 정정 |
| `lib/abusing/gps-detector.ts` | `UserRow.gps_daily_distance_km: number \| null` | **NOT NULL** | 그 지점만 생성 타입(`users.Update`)으로 교체 |

수기 `UserRow.gps_daily_distance_km`의 nullable 표기는 **수기 타입 쪽 오류**다. 수기 타입 교정은
등급명 개명 작업과 함께 다루도록 남겼다(이번 티켓은 타입 계층 전환 범위).

#### 도메인 좁힘 타입 vs DB 타입 (jsonb·text[])

`condition_json`(jsonb) → `BadgeCondition | null`, `activity_types`(text[]) → `ActivityType[]`처럼
**수기 타입이 DB보다 좁은** 지점은 생성 타입(`Json`/`string[]`)으로 바로 받을 수 없다.
조회는 DB 형태로 받고 도메인 타입으로 만들 때만 좁히도록 분리했다
(`lib/drop-engine/index.ts`의 `DropBadgeFromDb`, `admin/badges/page.tsx`의 `CheckinCandidateRow`).

#### staging 리베이스 — 개명·어뷰징복구 티켓이 먼저 랜딩해 전제가 바뀌었다

구현이 도는 동안 병렬 세션이 **티켓 20260831_1115(등급명 개명)** 와 **20260831_1149(어뷰징 정책
저장 복구)** 를 staging에 먼저 푸시했다. 마이그레이션 115는 **이미 공용 DB에 적용**돼 있었다
(`information_schema` 직접 조회로 확인: `drop_policy.rarity_epic`·`rarity_mystic`,
`abusing_policy.soft/hard_epic_rate`·`soft/hard_mystic_rate`, `ambient_drop_config.rarity_epic`·`rarity_mystic`).

그대로 머지하면 겹치는 11개 파일에서 개명이 되돌아가 **이미 개명된 DB와 어긋난다.**
그래서 `origin/staging`(`6214ebeb`) 위로 리베이스했다 — 충돌은 2개 파일뿐이었고
**양쪽 다 staging 버전이 최신**이라 staging 것을 취한 뒤 이 티켓의 기여분(억제 제거)만 다시 얹었다.

| 파일 | staging이 한 일 | 이번 티켓의 최종 기여 |
|---|---|---|
| `lib/drop-engine/policy.ts` | 개명으로 `APP_KEY_TO_DB_COLUMN`·`toDbColumns` **제거** → 페이로드가 `{ id, ...patch, updated_at }` 리터럴로 복귀 | 억제 1개 제거 (TS2578로 불필요 확인) |
| `lib/abusing/policy.ts` | 컬럼 개명 + 에러 확인·로깅·NUMERIC 정규화 추가(1149) → 앱 키 `soft_epic_rate`가 **DB 컬럼과 일치** | 억제 1개 제거 (TS2578로 불필요 확인) |

**리베이스가 잔여 이슈 2건을 없앴다.**

- 잔여 이슈 1번(`toDbColumns()` 스프레드 구멍) — 매핑 자체가 사라져 **해소**. 개선 리뷰어가
  "개명 티켓에서 자동으로 닫힌다"고 예측한 그대로다.
- 잔여 이슈 2번(`abusing_policy` 저장 복구) — 티켓 20260831_1149가 **완료**. 따라서 최초 구현의
  `as unknown as` 캐스팅 2개와 "⚠️ 알려진 결함" 주석 블록은 **전부 불필요해져 제거**됐고,
  그 파일의 쓰기 경로는 이제 진짜 컬럼 검사를 받는다(역검증 2번 참조).

### 변경된 파일
```
jam-web/src/lib/supabase/client.ts                          (제네릭 전환)
jam-web/src/lib/supabase/server.ts                          (제네릭 전환)
jam-web/src/types/database.ts                               (상단 주석 — 진실 원천 아님 명시)

jam-web/src/lib/drop-engine/index.ts                        (b, e)
jam-web/src/lib/combine/index.ts                            (b)
jam-web/src/lib/missions/rewards.ts                         (b)
jam-web/src/app/api/admin/simulate/route.ts                 (b)
jam-web/src/lib/points/index.ts                             (c)
jam-web/src/app/admin/item-badges/page.tsx                  (d)
jam-web/src/app/api/drops/poi/[poiId]/route.ts              (d)
jam-web/src/app/admin/abusing/page.tsx                      (d)
jam-web/src/app/admin/abusing/BanTable.tsx                  (d)
jam-web/src/app/admin/abusing/PoiBlockTable.tsx             (d)
jam-web/src/lib/abusing/gps-detector.ts                     (d)
jam-web/src/lib/abusing/shadow-ban.ts                       (d)
jam-web/src/lib/badge-engine/index.ts                       (d)
jam-web/src/app/(main)/[username]/page.tsx                  (e)
jam-web/src/app/admin/badges/page.tsx                       (e)
jam-web/src/lib/notifications/batch/collections.ts          (e)
jam-web/src/lib/notifications/batch/following.ts            (e)
jam-web/src/lib/notifications/__tests__/batch-query.test.ts (f)
jam-web/src/lib/abusing/policy.ts                           (g)

jam-web/src/lib/engine-log/index.ts                         (낡아진 전제 주석 갱신)
jam-web/src/lib/notifications/index.ts                      (낡아진 전제 주석 갱신)
jam-web/src/lib/notifications/feed.ts                       (낡아진 전제 주석 갱신)

억제 제거만 이뤄진 파일 46개 (본문 변경 없음):
  app/auth/callback/route.ts, app/api/{drops,follows,profile,onboarding,strava,itembooks,missions,badges}/**,
  app/api/admin/{badges,badge-image,factions,item-badges,itembooks,poi,poi-categories,theme-presets,users,test}/**,
  lib/{activity-feed,admin,ambient-drop,combine,drop-engine,itembook,missions,notifications,poi,strava,abusing}/**
```

### 테스트 결과
- [x] `npx tsc --noEmit` — **종료코드 0**
- [x] `npm run lint` — **오류 0 / 경고 25건** (전부 기존 미사용 변수 경고. 새로 만든 경고 0건 —
      테스트 스텁의 미사용 파라미터 1건은 `void columns`로 해소해 25건을 유지했다)
- [x] `npm run build` — **성공** (종료코드 0)
- [x] `npm test` — **리베이스 후 606 passed / 3 failed** (리베이스 전 594 passed / 3 failed.
      증가분 12건은 staging이 가져온 신규 테스트다). 실패 3건은 **이번 변경과 무관**하다:
      - `sync-drop-order.test.ts` 2건 — 이 워크트리에 `.env.local`이 없어
        `Your project's URL and Key are required to create a Supabase client!`로 실패한다(환경 문제).
      - `BadgeRevealCarousel.stories.tsx` 1건 — 이번 diff는 `design-system/` 아래 파일을
        **한 개도 건드리지 않았다**(`git diff --name-only origin/staging..HEAD | grep design-system` → 0건).
      직접 손댄 `batch-query.test.ts`는 변경 전후 모두 통과한다.
- [x] **역검증** — 억제를 제거한 쓰기 경로 3곳에 일부러 잘못된 컬럼을 넣어 컴파일 오류 발생 확인
- [x] 역검증 원복 후 `npx tsc --noEmit` 종료코드 0, `git status` 클린

#### 역검증 결과 (이 티켓의 존재 이유) — 리베이스 후 재실행

억제를 제거한 쓰기 경로 3곳에 일부러 잘못된 컬럼을 넣어 컴파일 오류를 실증했다.
**개명이 이미 반영된 최종 코드 기준**이다.

**1. 이번 사고의 그 컬럼 — `drop_policy`에 구 앱 키 `rarity_legend` 주입** (`lib/drop-engine/policy.ts:70`)

```
error TS2345: Argument of type '{ rarity_legend: number; updated_at: string; rarity_common?: number | undefined;
  rarity_epic?: number | undefined; rarity_mystic?: number | undefined; rarity_rare?: number | undefined;
  ... 18 more ...; id: number; }' is not assignable to parameter of type 'RejectExcessProperties<...>'
```
→ **41일간 조용히 실패했던 그 컬럼명이 컴파일에서 잡힌다.** 개명으로 `toDbColumns()`가 사라져
페이로드 키가 타입에 그대로 드러나므로(오류 메시지에 `rarity_epic`·`rarity_mystic`이 보인다),
최초 구현 때 잔여 이슈 1번으로 남았던 **매핑 함수 스프레드 구멍도 함께 닫혔다.**

**2. 18일간 저장 실패였던 컬럼 — `abusing_policy`에 구 키 `soft_legend_rate` 주입** (`lib/abusing/policy.ts:106`)

```
error TS2345: Argument of type '{ soft_legend_rate: number; updated_at: string; soft_common_rate?: number | undefined;
  soft_rare_rate?: number | undefined; soft_epic_rate?: number | undefined; soft_mystic_rate?: number | undefined;
  ... 8 more ...; id: number; }' is not assignable to parameter of type 'RejectExcessProperties<...>'
```
→ 최초 구현에선 이 파일이 캐스팅으로 검사 밖에 있었으나, 리베이스로 **캐스팅 없이 진짜 검사를 받는다.**

**3. 오타 컬럼 — `users.displayname`** (`app/api/profile/route.ts:40`)

```
error TS2561: Object literal may only specify known properties, but 'displayname' does not exist
  in type 'RejectExcessProperties<{ ... display_name?: string | null | undefined; ... }>'.
  Did you mean to write 'display_name'?
```
→ 오타는 **정정 제안까지** 붙는다.

세 변경 모두 확인 직후 원복했고 `npx tsc --noEmit` 종료코드 0과 `git status` 클린을 확인했다.

#### 게이트 재리뷰 지적 반영 (1건)

리베이스본 재리뷰에서 WARN 1건이 나왔고 머지 전에 고쳤다 — `src/types/database.ts` 헤더에
**개명 전 컬럼명을 현재형으로** 서술한 문장이 리베이스로 딸려왔다("`drop_policy.rarity_legend`·
`abusing_policy.soft/hard_legend_rate` 3개 컬럼이 지금도 어긋나 있다"). 마이그레이션 115로
이미 해소된 사실이라 같은 파일의 다른 주석과 정면으로 모순됐다. "2026-08-31 기준 불일치 0건,
마이그레이션 115가 해소"로 정정했다(`39455ef1`). 런타임·타입 영향은 없다.

### 문서 갱신 (개선 리뷰 반영)

| 문서 | 갱신 내용 |
|---|---|
| `Specs/PRD/02_DATA_MODEL.md` | "검사를 되살리려면 제네릭을 바꿔야 한다 / 억제 92개" 서술이 이번 변경으로 사실과 어긋나 **현재 사실로 재작성**(`Specs/`는 덮어쓰기 원칙). "Supabase 타입의 진실 원천" 절 신설 — 진실 원천이 생성 타입임, 수기 파일이 남는 이유, 억제 0개, **아직 검사 밖인 예외 2종**(`as never` 4곳, `Record<string, unknown>` 스프레드), 생성 타입이 낡으면 잘못된 오류가 난다는 경고 |
| `Specs/DEV_PROCESS_GUARDRAILS.md` | 패턴 9에 **규칙 8·9 추가** — (8) 쓰기 페이로드에 타입 억제를 걸지 않는다, `as never`·전체 캐스팅도 같은 효과이며 억제 개수를 안전 지표로 읽지 말 것, 필요하면 한 컬럼 단위로 좁힌다. (9) `Record<string, unknown>` 반환 함수를 스프레드하면 그 키가 타입에서 사라진다. 더불어 **핵심 루프 의존성 지도의 `users` 행 방향을 뒤집었다** — 기준이 생성 타입이고 수기 쪽이 파생이다 |
| `jam-web/CLAUDE.md` | 코드를 쓰는 에이전트가 매번 읽는 파일이라 같은 규칙을 3항목으로 요약해 추가 |

신규 패턴 10 대신 **패턴 9 보강**을 택했다 — 원인 계열이 같고(쓰기 실패 감지 부재),
새 내용은 "왜 컴파일이 안 잡았나"라는 다른 축이라 규칙으로 붙는 게 자연스럽다.

### UX Writing 검증
- [x] 해당 없음 (사용자 노출 텍스트 변경 없음 — 타입 계층 작업)

### 배포 정보
- 배포일: 2026-08-31
- 환경: staging (프로덕션 승격은 `/jam-ship`으로 별도 진행)
- 커밋: `f93b2831`(구현) · `7207eddb`(완료 기록) · `1572ca87`(헤더 주석 정정) · `4087d3b7`(문서 갱신)
- 리뷰 브랜치: `claude/jamwork-20260831_1213-supabase-generic`
- **DB 변경 없음** — 마이그레이션 파일을 만들지 않았다. 개명 마이그레이션 115는 티켓 20260831_1115 소관이며 이미 적용돼 있었다.

### 주요 의사결정 / 핵심 메모

- **`abusing_policy`는 처음에 "타입만 통과, 런타임 불변"을 택했으나(티켓 지시), 리베이스로
  그 선택 자체가 무효가 됐다.** 병렬 세션의 티켓 20260831_1149가 저장 복구를, 20260831_1115가
  컬럼 개명을 이미 끝내 앱 키와 DB 컬럼이 일치한다. 따라서 최초 구현의 `as unknown as` 단언 2개와
  "⚠️ 알려진 결함" 주석 블록은 **전부 제거**했고, 최종본은 억제만 걷어낸 상태로 **실제 컬럼
  검사를 받는다**(역검증 2번). 결과적으로 티켓이 우려했던 "억제가 캐스팅으로 형태만 바뀌는" 일은
  최종본에 남지 않았다.
- **머지 순서 조율은 리베이스로 처리했다.** 티켓 작성 시점엔 `abusing_policy` 후속 티켓이 없어
  "순서 조율" 대신 "타입만 통과"를 택했는데, 실제로는 그 티켓이 먼저 랜딩해 순서가 저절로 정해졌다.
  `git merge-base --is-ancestor` 검사 실패를 신호로 삼아 머지를 멈추고 리베이스한 것이 주효했다.
- **억제를 지우고 남은 오류를 `@ts-expect-error`로 다시 덮지 않았다.** 잔여 억제 **0개**다.
  대신 각 지점에서 **"왜 타입이 어긋나는가"를 한 컬럼 단위로 좁혀** 표현했다
  (`Omit<Insert,'serial_number'>`, `Omit<Row,'condition_json'>` 등). 전체 캐스팅(`as XxxRow[]`)을
  쓰면 컬럼명 오타까지 다시 통과하므로 의도적으로 피했다.
- **`lib/engine-log`·`lib/notifications`의 "좁은 캐스팅을 쓰는 이유" 주석 3곳을 갱신했다.**
  그 주석들은 "리포 전역 문제라 해소 불가"를 전제로 쓰였는데 이번 변경으로 그 전제가 사라졌다.
  코드(좁은 캐스팅)는 계약 검사를 유지하므로 그대로 두고 주석만 사실에 맞췄다.
- **수기 `database.ts`는 삭제하지 않았다.** 상단 주석에 진실 원천이 `database.generated.ts`임을
  명시하고, 이 파일이 남는 이유(168개 파일의 도메인 타입 · 컬럼 의미 주석 · `jsonb`/`text[]`를
  좁힌 도메인 타입의 유일한 정의처)를 적었다.
- **DB 변경 없음.** 마이그레이션 파일을 만들지 않았다.

### 잔여 이슈

1. ~~`toDbColumns()` 계열 스프레드가 검사 밖~~ — **해소.** 등급명 개명(20260831_1115)이
   `APP_KEY_TO_DB_COLUMN`·`toDbColumns`를 제거해 페이로드가 리터럴로 돌아왔다. 역검증 1번에서
   페이로드 키가 타입에 드러나는 것을 확인했다.
2. ~~`abusing_policy` 저장 복구~~ — **해소.** 티켓 20260831_1149에서 완료됐다.
3. **수기 `UserRow.gps_daily_distance_km`가 `number | null`로 잘못 적혀 있다** (DB는 NOT NULL).
   이번엔 사용처(`lib/abusing/gps-detector.ts`)만 생성 타입으로 우회했고 수기 타입 자체는 그대로다.
4. **생성 타입 최신성을 지키는 장치가 없다.** 이번 변경으로 `database.generated.ts`가 쓰기 컴파일
   검사의 **실제 기준**이 됐다. 이 파일이 낡으면 올바른 코드가 잘못된 컴파일 오류를 낸다
   (20260831_1158에서 `badges.category`·`poi.is_active`가 실제로 그 상태였다).
   개선 리뷰 제안: (a) pre-commit 경고 — `supabase/migrations/`가 스테이지됐는데
   `database.generated.ts`가 같은 커밋에 없으면 경고(오프라인·즉시), (b) 완전 검증
   (`npm run db:types` 후 `git diff --exit-code`)은 네트워크가 확보된 `/jam-ship` 시점 1회.
5. **좁은 캐스팅(`as unknown as`)으로 남은 우회 3곳**(`engine-log`·`notifications/index`·
   `notifications/feed`)은 이제 없어도 되는 코드다. 주석만 사실에 맞게 갱신했고 제거는 별도 정리 작업.
6. **`as never` 캐스팅 4곳이 억제 개수 지표 밖에 있다** (개선 리뷰 발견). `@ts-expect-error` 0개가
   "모든 쓰기가 검사된다"를 뜻하지 않는다 — `.update(body as never)` 형태는 컬럼 검사를 똑같이 끈다.
   `app/api/admin/{today,missions,recipes}/[id]/route.ts`와 `lib/missions/rewards.ts:142`.
   전부 이번 티켓이 건드리지 않은 기존 코드이며, `rewards.ts` 건은 리터럴 페이로드라 캐스팅을
   지워도 통과할 가능성이 높은 가장 싼 후보다.
7. **타입 검사를 자동으로 돌리는 게이트가 없다** (개선 리뷰 발견). `.githooks/pre-push`는
   `npm run lint:ci`만 돌리고 `tsc`는 돌리지 않으며 `.github/workflows/`도 없다. 이번에 되살린
   방어선의 실제 발동 시점이 Vercel 빌드(=배포 실패)까지 밀린다. pre-push staging 블록에
   `npx tsc --noEmit` 한 줄을 추가하는 것이 효과를 고정하는 가장 직접적인 수단이다.
8. **`AwardPointsArgsAllowingNull`이 필수 인자까지 null 허용으로 넓힌다.** `p_user_id`·`p_amount`·
   `p_reason`의 non-null 검사가 꺼져 있다. `{ [K in keyof T]: undefined extends T[K] ? T[K] | null : T[K] }`
   로 바꾸면 선택 인자만 넓어진다 (`lib/points/index.ts:27` 한 줄).
