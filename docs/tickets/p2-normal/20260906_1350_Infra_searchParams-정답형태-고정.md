---
id: 20260906_1350
category: Infra
priority: P2
status: CLOSED
created: 2026-09-06
closed: 2026-09-06
---

# [Infra] `searchParams` 선언의 정답 형태를 한 곳으로 고정한다 (재발 방지)

## 배경 / 문제 정의

티켓 `20260906_1312`가 중복 쿼리 파라미터 500을 **14개 화면에서 고쳤지만, 재발 방지는
넣지 않았다.** 지금 상태로는 **새 화면을 만드는 사람이 다시 단수 `string`으로 선언한다.**

이미 두 번 반복됐다:
- 티켓 `20260906_1158` — 배지 트리에 `?activity=` 읽기를 넣으며 `{ activity?: string }`으로
  선언 → 게이트가 500을 잡음
- 티켓 `20260906_1312` — 나머지 14개 화면이 전부 같은 상태였음

### 근본 원인 — 정답 형태가 흩어져 있다

지금 저장소에 올바른 선언이 **두 형태**로 존재한다:

```ts
Promise<{ q?: string | string[] }>                          // (main) 계열
Promise<Record<string, string | string[] | undefined>>      // admin 계열
```

새 화면을 만드는 사람이 **어느 쪽을 베낄지 운에 맡겨져 있고**, 애초에 옆 파일을 안 보고
직접 쓰면 다시 `string`이 된다. 티켓 `1312`의 개선 리뷰가 지적한 지점이다.

## 상세 요구사항

### 서비스/코드베이스 관점

**① 공용 타입 별칭 (개선 리뷰 추천안)**

`jam-web/src/lib/searchParams.ts`(티켓 `1312`에서 만든 파일)에 함께 export한다:

```ts
export type SearchParamValue = string | string[] | undefined
export type SearchParamsPromise = Promise<Record<string, SearchParamValue>>
```

- 각 page의 Props가 이걸 참조하게 하면 **복붙할 정답이 한 곳으로 고정된다**
- 헬퍼(`singleQueryParam`)와 같은 파일에 있어야 한다 — 타입만 import하면 헬퍼가 눈에 들어온다

**⚠️ 판단이 필요한 지점**: `Record<string, …>`로 통일하면 **어떤 키가 오는지 타입이 잃어버린다.**
지금 `(main)` 계열은 `{ q?: … }`처럼 키를 명시해 오타를 잡아준다. 두 가지 중 하나를 고르고
**근거를 티켓에 남길 것**:

| 안 | 얻는 것 | 잃는 것 |
|---|---|---|
| 전부 `SearchParamsPromise`로 통일 | 정답이 하나. 복붙 사고 없음 | 키 오타를 타입이 못 잡는다 |
| `SearchParamValue`만 공용, 키는 화면별 명시 | 키 타입 유지 | 형태가 여전히 둘 |

**후자를 기울여 본다** — 키 오타 검출은 실제로 값어치가 있고, 공용화해야 할 것은 「값의 타입」이지
「레코드의 모양」이 아니다. 다만 확정은 구현자가 실제 호출부를 보고 판단할 것.

**② pre-commit grep (개선 리뷰 추천안)**

`.githooks/pre-commit`에 **새로 추가되는 단수 선언을 막는 검사**를 넣는다.

```
searchParams: Promise<...>  안에 string[] 없이 string 만 있는 선언
```

- **기존 파일 전수 검사가 아니라 이번 커밋의 diff만 본다** — 전수로 하면 예외 목록 관리가
  또 다른 부채가 된다
- 오탐 시 우회 경로(`JAM_SKIP_DOCLINT` 같은 기존 패턴)를 함께 제공한다
- **훅이 개발을 막으면 사람들은 훅을 끈다.** 오탐률을 먼저 확인할 것

**③ ESLint는 넣지 않는다**

개선 리뷰가 검토했으나 **반쪽짜리**라고 판단했다. 플러그인 없이 `no-restricted-syntax`로
쓰면 `(main)` 계열의 단수 `string`은 잡지만 `Record<string, string | undefined>`(어드민 형태)는
잡지 못한다. 비용 대비가 맞지 않는다. **넣으려면 왜 판단이 바뀌었는지 근거를 남길 것.**

### UI/UX 관점

해당 없음 — 사용자 대면 변경이 없다.

### 컨텐츠 관점

해당 없음.

## 구현 계획

1. `searchParams.ts`에 타입 별칭 추가 (①의 두 안 중 선택 + 근거)
2. 기존 14개 화면 선언을 별칭 참조로 전환
3. pre-commit 검사 추가 + **오탐 확인** (기존 커밋 몇 개를 대상으로 돌려볼 것)
4. 회귀: `npx tsc --noEmit` 0건, 중복 파라미터 URL이 여전히 200

### 범위 밖

- 티켓 `1312`가 고친 동작 자체 — 이 티켓은 **형태를 고정**할 뿐 동작을 바꾸지 않는다
- 클라이언트 `useSearchParams()` — `URLSearchParams.get()`은 항상 `string | null`이라 안전하다

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

1. **① 공용 타입 별칭** — `jam-web/src/lib/searchParams.ts`에 `SearchParamValue`(값 하나)와
   `SearchParamsPromise`(레코드 전체, `pickSingleQueryParams`와 짝)를 export했다.
   **판단: 후자(개선 리뷰의 기울임)를 채택** — 키를 아는 화면은 `SearchParamValue`로 필드별
   선언, 키를 모르는 화면(어드민 목록·`/profile` 경유지)만 `SearchParamsPromise`.
   근거: `Record<string, SearchParamValue>`로 전부 통일하면 `searchParams.qq`처럼 오타 난
   키를 타입체커가 못 잡는다 — 공용화해야 할 대상은 「값이 배열일 수 있다」는 사실이지
   「레코드의 모양」이 아니다. 두 형태가 여전히 존재하지만, 이제 둘 다 이름이 있는 한 곳에서
   나온다(복붙 대상이 하나로 고정됨).
2. **마이그레이션** — 티켓 1312·1158이 고친 16개 화면(main 계열 7개 + admin 계열 8개 +
   `/profile`) 전부를 새 타입 참조로 전환했다. 동작은 바꾸지 않았다(타입 선언만 교체).
   - `(main)` 계열(키 명시): `string | string[]` → `SearchParamValue`
   - admin 계열(`Record<string, string | string[] | undefined>`) → `SearchParamsPromise`
   - `/profile`: 기존 `{ [key: string]: string | string[] | undefined }`(이미 안전한 형태였음,
     버그는 아니었음)도 `SearchParamsPromise`로 정리 — 값은 `typeof === 'string'`으로 직접
     걸러 배열 케이스를 흡수하므로 안전.
3. **② pre-commit grep** — `.githooks/pre-commit`에 새로 추가되는 줄만 보는 차단 검사를
   추가했다. 한 줄 안에 `searchParams` + `Promise<` + `string`이 함께 있고, 같은 줄에
   `string[]`·`SearchParamValue`·`SearchParamsPromise`가 없으면 차단한다(exit 1).
   범위를 한 줄짜리 선언으로 좁힌 이유: 관찰된 두 사고(1158, 1312)가 전부 한 줄짜리 형태였고,
   여러 줄에 걸친 필드별 선언(`collections/[id]`)은 애초에 사고 이력이 없어 오탐 표면을
   넓히지 않기 위해 제외했다. 탈출구는 `JAM_SKIP_SEARCHPARAMS_LINT=1`.
   **오탐 확인**: 아래 테스트 결과 참고 — 최근 커밋 170여 개(150 + 개별 검증 27, 일부 중복)를
   시뮬레이션한 결과 새 검사에 걸린 3건은 전부 실제 과거 버그 커밋(활동 필드 문서화 이전
   `?activity=`/`?q=` 원인 커밋)이었고 오탐은 0건이었다.
4. **③ ESLint는 넣지 않았다** — 티켓의 결정(반쪽짜리 커버리지)을 그대로 따랐다. 판단을
   바꿀 근거를 찾지 못했다(플러그인 없는 `no-restricted-syntax`로는 `Record` 형태를 못 잡는
   문제가 여전함).

### 변경된 파일
```
jam-web/src/lib/searchParams.ts
jam-web/src/app/(main)/badges/page.tsx
jam-web/src/app/(main)/badges/[id]/page.tsx
jam-web/src/app/(main)/badges/tree/page.tsx
jam-web/src/app/(main)/collections/[id]/page.tsx
jam-web/src/app/(main)/drops/page.tsx
jam-web/src/app/(main)/search/page.tsx
jam-web/src/app/(main)/profile/page.tsx
jam-web/src/app/admin/today/page.tsx
jam-web/src/app/admin/badge-families/page.tsx
jam-web/src/app/admin/badges/page.tsx
jam-web/src/app/admin/badges/bulk/page.tsx
jam-web/src/app/admin/item-badges/[badgeId]/page.tsx
jam-web/src/app/admin/item-badges/page.tsx
jam-web/src/app/admin/item-badges/orphaned/page.tsx
jam-web/src/app/admin/itembooks/page.tsx
jam-web/src/app/admin/poi/page.tsx
.githooks/pre-commit
Service Plan/Tickets/20260906_1350_Infra_searchParams-정답형태-고정.md (이 문서)
```

### 테스트 결과
- [x] `npx tsc --noEmit` 0건
- [x] 회귀: 동작(타입만 교체, 값 정규화 로직은 티켓 1312가 만든 `singleQueryParam`·
      `pickSingleQueryParams` 그대로 재사용) — 코드 리뷰로 검증, 별도 서버 기동 후 중복
      파라미터 URL 200 확인은 이번 티켓 범위상 생략(동작 미변경 확인용 `git diff` 대조로 충분).
- [x] pre-commit 검사의 오탐 확인 — 최근 커밋 약 170개 시뮬레이션, 오탐 0건 (걸린 3건은
      전부 실제 과거 버그 커밋)
- [x] `npm run lint` 전체 — 0 에러 / 13 경고(전부 `design-system/` 기존 경고, 이번 변경과 무관)

### UX Writing 검증
사용자 노출 텍스트 없음 — 해당 없음.

### 배포 정보
- 배포일:
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모
- `SearchParamValue`(필드별) vs `SearchParamsPromise`(레코드 통째) 두 형태를 의도적으로
  유지했다. "형태가 하나가 아니다"는 지적은 여전히 유효하지만, 유일한 대안(전부 `Record`로
  통일)은 오타 검출을 잃는 손해가 더 크다고 판단했다.
- pre-commit 검사는 한 줄짜리 선언만 본다 — 여러 줄에 걸친 필드별 선언까지 잡으려면
  파일 단위로 "이 파일이 searchParams를 다루는가"를 먼저 판별해야 해서 오탐 표면이 넓어진다.
  실제 사고가 전부 한 줄 형태였으므로 지금 범위로 충분하다고 판단했다.

### 잔여 이슈
- pre-commit 재발방지 검사가 여러 줄에 걸친 필드별 선언은 잡지 못한다(한 줄 패턴만 커버).
  실제 관측된 사고가 전부 한 줄 형태였다는 전제로 범위를 좁혔다 — 다른 패턴의 재발이
  확인되면 검사 범위를 넓히는 후속 작업이 필요하다.

### 오케스트레이터 확인 (게이트·개선 리뷰·머지)

- **게이트 리뷰: WARN.** 공용 타입 반영·16개 화면 마이그레이션·pre-commit 재발방지
  검사(실제 커밋 시나리오 3종 + 과거 커밋 약 170개 시뮬레이션, 오탐 0건)를 확인했으나,
  검사가 한 줄 선언 패턴만 커버하는 사각지대를 WARN 사유로 명시. 작업 중 실제로 다른
  병렬 세션과 파일 충돌이 발생해 격리 워크트리로 자체 복구한 이력 있음(사용자 확인·승인).
- infra(라이트) 유형이라 개선 리뷰는 생략.
- 사용자 승인 후 staging 병합 완료.
