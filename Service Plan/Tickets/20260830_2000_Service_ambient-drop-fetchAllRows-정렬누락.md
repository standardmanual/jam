---
id: 20260830_2000
category: Service
status: OPEN
created: 2026-08-30
closed:
---

# [bug] ambient-drop의 fetchAllRows 헬퍼 호출부에 정렬 기준 누락 — 페이지 경계 중복/누락 위험

## 배경 / 문제 정의

티켓 [20260825_036](20260825_036_bug_drop-engine-fetchAllRows-정렬누락.md)의 게이트 리뷰·개선
리뷰에서 범위 밖으로 발견된 이슈("잔여 이슈" 참조). `jam-web/src/lib/ambient-drop/index.ts:136`
부근의 `fetchAllRows('poi_drops(active system)', ...)` 호출부가 `.order()` 없이 `.range()`만으로
페이지네이션한다.

같은 파일의 다른 4개 `fetchAllRows` 호출부(`poi_categories`, `item_books`, `poi`, `badges(item)`)는
모두 `.order()`를 붙이는데 이 호출부만 빠져 있다. Postgres는 `ORDER BY` 없는 쿼리의 물리적 행
순서를 보장하지 않으므로, 페이지 경계에서 행 중복/누락이 발생할 이론적 위험이 있다. 이 결과
(`activeByPoi`)는 POI별 `max_active_per_poi` 초과분 배제 판정에 쓰이므로, 실제로 터지면 특정
POI가 배치 후보에서 부당하게 빠지거나(중복 카운트) 초과 배치되는(누락) 경로다.

20260825_036에서 `drop-engine/index.ts`의 동일 패턴을 이미 고쳤다 — 로컬 `fetchAllRows`를
제거하고 `lib/notifications/batch/shared.ts`의 공용 `fetchAllRows`(orderBy 필수 인자 패턴)로
통합했다. 이번 티켓도 같은 패턴을 따른다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `ambient-drop/index.ts`의 로컬 `fetchAllRows` 헬퍼(53~68행)를 제거하고
  `lib/notifications/batch/shared.ts`의 공용 `fetchAllRows`로 5개 호출부 전체를 통합한다
  (한 파일 안에 로컬/공용 두 헬퍼가 공존하면 다음 사람이 또 헷갈린다 — 이번엔 다른 4개 호출부도
  같이 정리)
- 공용 헬퍼는 쿼리 팩토리 `() => PagedQuery<T>` 형태를 받고 `.order(orderBy)`를 자기가 붙인다.
  기존 호출부는 이미 `(from, to) => ...range(from, to)` 형태라 팩토리 시그니처 차이를 맞춰야 한다
  (20260825_036에서 이미 겪은 변환 — 그대로 참고)
- 공용 헬퍼는 에러 시 예외를 던지는 정책이다. `ambient-drop/index.ts`의 기존 5개 호출부는 모두
  에러 시 `console.error` 후 그 시점까지 모은 행만 반환하는 그레이스풀 폴백이었다. 이 동작을
  깨지 않으려면 호출부에서 `.then/.catch`로 예외를 흡수해 기존 폴백 동작(에러 시 부분 결과로
  계속 진행)을 유지해야 한다 — `drop-engine/index.ts` 수정 시 쓴 것과 동일한 패턴
- `orderBy`는 각 쿼리의 유니크 컬럼(PK)을 tie-break로 사용:
  `poi_categories`→`slug`, `item_books`→`id`, `poi`→`id`, `badges(item)`→`id` — 기존 4개는 이미
  이 컬럼으로 `.order()`가 붙어 있으므로 그대로 유지.
  신규로 고치는 `poi_drops(active system)` 호출부는 `poi_id`가 PK가 아니라(이 쿼리 자체가
  POI별 카운트 집계이므로 `poi_id` 중복이 정상) `.select('poi_id')`만으로는 tie-break가 안 된다.
  `poi_drops`의 실제 PK는 `id`(UUID, `migrations/004_phase7_user_drops.sql:5`)이므로
  `.select('poi_id, id')`로 바꾸고 `orderBy`는 `'id'`를 쓴다 (select에 없는 컬럼으로는 정렬해도
  안정 정렬이 보장되지 않을 수 있으므로 select에 포함시킬 것)

## 구현 계획

1. `ambient-drop/index.ts`의 로컬 `fetchAllRows` 제거, 5개 호출부를 공용 헬퍼로 통합
2. `poi_drops(active system)` 호출부는 `select('poi_id, id')` + `orderBy: 'id'`로 수정
3. 각 호출부에서 기존 그레이스풀 폴백(에러 시 console.error + 부분 결과 반환) 동작을
   `.then/.catch`로 보존
4. 타입 체크·린트·관련 테스트 통과 확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`ambient-drop/index.ts`의 로컬 `fetchAllRows`(53~68행)를 제거하고, 5개 호출부
(`poi_categories`, `item_books`, `poi`, `poi_drops(active system)`, `badges(item)`) 전체를
`lib/notifications/batch/shared.ts`의 공용 `fetchAllRows`(orderBy 필수 인자)로 통합했다.

- 정렬이 빠져 있던 `poi_drops(active system)` 호출부: `select('poi_id')` → `select('poi_id, id')`,
  `orderBy: 'id'`로 수정 (poi_drops의 실제 PK는 `id`이며 `poi_id`는 이 집계 자체가 POI별
  카운트라 중복이 정상이라 tie-break가 될 수 없음)
- 기존 4개 호출부(`poi_categories`→`slug`, `item_books`→`id`, `poi`→`id`, `badges(item)`→`id`)는
  이미 붙어 있던 `.order()` 컬럼을 그대로 `orderBy`로 이관
- 공용 헬퍼는 에러 시 예외를 던지는 정책이라, 기존 5개 호출부의 그레이스풀 폴백(에러 시
  `console.error` 후 부분 결과로 계속 진행)을 보존하기 위해 각 호출부에서
  `.then((data) => ({ data, error: null }))` / `.catch((err) => ({ data: [], error: {...} }))`로
  예외를 흡수했다 (`drop-engine/index.ts` 20260825_036 수정 시와 동일 패턴).
  단, 공용 헬퍼는 에러 발생 시 그 시점까지 페이지 단위로 누적한 행을 반환하지 않고 통째로
  던지므로, `.catch()`에서 만들 수 있는 "부분 결과"는 빈 배열이 최선이다 — 페이지 경계 이전에
  이미 모은 행까지 보존하는 것은 공용 헬퍼의 구조상 불가능하며, 이는 `drop-engine/index.ts`에서
  이미 채택된 것과 동일한 타협이다.

### 변경된 파일
```
jam-web/src/lib/ambient-drop/index.ts
```

### 테스트 결과
- [x] `npx tsc --noEmit -p tsconfig.json` — 에러 0건
- [x] `npm run lint` (전체) — 0 에러, 25 경고 (전부 이번 변경과 무관한 기존 경고 — design-system
      stories/foundations, 미사용 import 등)
- [ ] 단위 테스트 — `ambient-drop` 관련 테스트 파일이 저장소에 존재하지 않아(검색 결과 0건)
      실행 대상 없음 (기존에도 없었음, 이번 티켓 범위 아님)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 해당 없음 — 서버 사이드 로직 변경, 사용자 노출 텍스트 없음

### 배포 정보
- 배포일:
- 환경: staging
- 커밋:

### 주요 의사결정 / 핵심 메모
- 로컬 fetchAllRows 헬퍼를 완전히 제거하고 공용 헬퍼로 5개 호출부 모두 통일해, 티켓
  20260825_036과 동일하게 "한 파일 안에 로컬/공용 두 헬퍼 공존" 상태를 만들지 않았다.
- `poi` 호출부는 조건부로 `.eq('category', ...)`를 붙이는 쿼리 팩토리라 `let q = ...` 형태를
  그대로 유지하되, `.order()`·`.range()`는 공용 헬퍼가 붙이도록 제거했다.

### 잔여 이슈
- 없음
