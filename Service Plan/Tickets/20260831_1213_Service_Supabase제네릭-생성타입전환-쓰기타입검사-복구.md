---
id: 20260831_1213
category: Service
status: OPEN
created: 2026-08-31
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

조사 이후 5개가 추가됐다. **잔여 오류 27건이라는 수치도 그만큼 달라질 수 있으므로,
구현자는 전환 직후 직접 재측정하고 실제 수치를 완료 기록에 남긴다.**

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
  → **이번 티켓의 선택: "타입만 맞춰 통과"** (아래 의사결정 참조).
  런타임 동작(읽기 시 `soft_legend_rate`가 `undefined`, 쓰기 시 PGRST204 실패)은 **그대로 둔다.**
  타입 경계에 불일치 사실과 후속 티켓 필요성을 주석으로 명시한다.

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
| g | `abusing_policy` | 2 | **타입만 통과, 런타임 불변** (아래 의사결정 참조) |

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
- [x] `npm test` — **594 passed / 3 failed**. 실패 3건은 **변경 전 기준선과 완전히 동일**하다
      (`git stash`로 원상 복구해 대조 실행: 594 passed / 3 failed). 원인은 이 워크트리에
      `.env.local`이 없어 `sync-drop-order.test.ts` 2건이 Supabase 클라이언트 생성에서 실패하는 것과,
      `BadgeRevealCarousel.stories.tsx` 스토리 단언 1건으로 **이번 변경과 무관**하다.
      직접 손댄 `batch-query.test.ts`는 변경 전후 모두 통과한다.
- [x] **역검증** — 억제를 제거한 쓰기 경로 3곳에 일부러 잘못된 컬럼을 넣어 컴파일 오류 발생 확인
- [x] 역검증 원복 후 `npx tsc --noEmit` 종료코드 0, `git status` 클린

#### 역검증 결과 (이 티켓의 존재 이유)

**1. 이번 사고의 그 컬럼 — `drop_policy.rarity_legend`** (`lib/drop-engine/policy.ts:111`)

```
error TS2345: Argument of type '{ rarity_legend: number; updated_at: string; id: number; }'
  is not assignable to parameter of type 'RejectExcessProperties<{ adjacent_weight?: number | undefined; ... }>'.
    Type '{ rarity_legend: number; ... }' is not assignable to type '{ rarity_legend: never; }'.
      Types of property 'rarity_legend' are incompatible.
        Type 'number' is not assignable to type 'never'.
```
→ **41일간 조용히 실패했던 그 컬럼명이 이제 컴파일에서 잡힌다.**

**2. 오타 컬럼 — `users.displayname`** (`app/api/profile/route.ts:40`)

```
error TS2561: Object literal may only specify known properties, but 'displayname' does not exist
  in type 'RejectExcessProperties<{ ... display_name?: string | null | undefined; ... }>'.
  Did you mean to write 'display_name'?
```
→ 오타는 **정정 제안까지** 붙는다.

**3. 존재하지 않는 컬럼 — `ambient_drop_config.no_such_column__`** (`lib/ambient-drop/config.ts:73`)

```
error TS2322: Type 'number' is not assignable to type 'never'.
```

세 변경 모두 확인 직후 원복했고 `git status`가 클린임을 확인했다.

### UX Writing 검증
- [x] 해당 없음 (사용자 노출 텍스트 변경 없음 — 타입 계층 작업)

### 배포 정보
- 배포일: 
- 환경: staging
- 커밋: 

### 주요 의사결정 / 핵심 메모

- **`abusing_policy`는 "타입만 통과, 런타임 불변"을 택했다** (티켓 지시).
  `lib/abusing/policy.ts` 상단에 **"⚠️ 알려진 결함"** 블록을 두고 읽기는 `soft/hard_legend_rate`가
  런타임에 `undefined`이고, 쓰기는 PGRST204로 항상 실패한다는 사실을 명시했다. 두 지점의 단언은
  결함이 고쳐질 때 함께 지우도록 주석에 적었다. 컬럼 개명은 등급명 개명 작업 소관이라 손대지 않았다.
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

1. **`toDbColumns()` 계열 스프레드는 여전히 검사 밖이다.** `lib/drop-engine/policy.ts`의
   `{ id: 1, ...toDbColumns(patch), updated_at }`에서 `toDbColumns()`의 반환형이
   `Record<string, unknown>`이라 **그 스프레드가 기여하는 키는 타입에 남지 않는다**(역검증에서
   페이로드 타입이 `{ rarity_legend; updated_at; id }`로만 잡힌 것으로 확인). 리터럴로 적은 키는
   잡히지만 매핑 함수를 거친 키는 못 잡는다. `APP_KEY_TO_DB_COLUMN`을 생성 타입 키에 묶으면
   해소되지만 이번 티켓 범위 밖이다(drop_policy 중복 수정 금지).
2. **`abusing_policy` 저장 복구** — 별도 티켓. `updated_at`이 2026-08-13에 고착돼 있다.
3. **수기 `UserRow.gps_daily_distance_km`가 `number | null`로 잘못 적혀 있다** (DB는 NOT NULL).
   이번엔 사용처만 생성 타입으로 우회했고 수기 타입 자체는 고치지 않았다.
4. **생성 타입 최신성 CI가 없다.** `npm run db:types` 재생성 후 `git diff --exit-code` 한 줄이면
   되고, 이제 생성 타입이 실제 검사 기준이므로 낡으면 잘못된 오류가 난다. 20260831_1158에서
   보조 수단으로 제안된 항목이다.
5. **좁은 캐스팅(`as unknown as`)으로 남은 우회 3곳**(`engine-log`·`notifications/index`·
   `notifications/feed`)은 이제 없어도 되는 코드다. 제거는 별도 정리 작업.
