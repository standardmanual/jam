---
id: 20260906_1350
category: Infra
status: OPEN
created: 2026-09-06
closed:
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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] `npx tsc --noEmit` 0건
- [ ] 중복 파라미터 URL 200 유지 (회귀)
- [ ] pre-commit 검사의 오탐 확인

### UX Writing 검증
사용자 노출 텍스트 없음 — 해당 없음.

### 배포 정보
- 배포일:
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
