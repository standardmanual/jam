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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증
- [ ] 해당 없음 (사용자 노출 텍스트 변경 없음 — 타입 계층 작업)

### 배포 정보
- 배포일: 
- 환경: staging
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
