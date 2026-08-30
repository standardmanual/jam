---
id: 20260825_036
category: Service
status: OPEN
created: 2026-08-25
closed:
---

# [bug] drop-engine의 fetchAllRows 헬퍼에 정렬 기준 누락 — 페이지 경계 중복/누락 위험

## 배경 / 문제 정의

티켓 [20260825_037](20260825_037_bug_PostgREST-1000행상한-배지조회-절단-일괄점검.md)의
게이트 리뷰·개선 리뷰에서 발견된 범위 밖 이슈. `jam-web/src/lib/drop-engine/index.ts:160`의
로컬 `fetchAllRows` 헬퍼는 range 페이지네이션 루프는 구현돼 있으나 `.order()`가 없다.

Postgres는 `ORDER BY` 없는 쿼리의 물리적 행 순서를 보장하지 않으므로, 페이지 경계에서
행이 중복되거나 누락될 이론적 가능성이 있다. `jam-web/src/lib/notifications/batch/shared.ts`의
동명 헬퍼(`fetchAllRows`)는 정확히 이 이유로 `orderBy`를 필수 인자로 강제하고 있어 대조적이다.

드랍엔진(실제 배지·아이템 지급 판정 핵심 로직)이라 031의 범위에서는 손대지 않고 별도
검토가 필요하다고 판단해 이 티켓으로 분리했다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `jam-web/src/lib/drop-engine/index.ts`의 `fetchAllRows` 호출부(160행 부근)에서
  어떤 쿼리에 페이지네이션이 적용되는지, 그 쿼리 결과가 지급 판정에 실제로 어떻게
  쓰이는지 먼저 확인한다
- `.order('id')` 등 안정적인 tie-break 정렬을 추가한다 (`lib/notifications/batch/shared.ts`의
  `orderBy` 필수 인자 패턴 참고)
- 가능하면 `lib/notifications/batch/shared.ts`의 `fetchAllRows`와 이번 헬퍼를 공용화하는
  것도 검토한다 (031 개선 리뷰 제안 — 페이지네이션 로직이 여러 곳에 유사하게 중복돼 있어
  한 곳만 고치고 다른 곳을 놓치는 편차가 반복되고 있음)

## 구현 계획

1. `drop-engine/index.ts`의 `fetchAllRows` 호출부와 정렬 없는 쿼리가 실제 중복/누락을
   일으킬 수 있는지(같은 정렬 키를 가진 행이 많은지 등) 확인
2. 정렬 기준 추가
3. 공용 헬퍼화 여부는 영향 범위(다른 호출부와의 결합도)를 보고 판단

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `drop-engine/index.ts`의 `fetchAllRows` 호출부는 `fetchDropStructure`에서 활성 아이템북
  소속 배지(`type='item'`)를 페이지네이션 조회하는 단 하나의 호출부였다. 이 결과(`droppable`)는
  Layer 3(아이템북·배지 선택)의 후보 풀 전체를 구성하므로, 페이지 경계 중복/누락이 실제로
  터지면 특정 배지가 드랍 후보에서 조용히 빠지거나 중복 계산될 수 있는 경로였다.
- 로컬 `fetchAllRows` 헬퍼를 제거하고 `lib/notifications/batch/shared.ts`의 `fetchAllRows`
  (쿼리 빌더를 팩토리로 받아 `.order(orderBy)`를 스스로 붙이는, `orderBy` 필수 인자 패턴)로
  공용화했다. `orderBy`에는 배지 PK인 `'id'`를 tie-break로 사용.
  - 호출부는 이미 `(from, to) => supabase.from(...).range(from, to)` 형태로 페이지마다 쿼리를
    새로 빌드하고 있어 공용 헬퍼가 요구하는 "매번 새 빌더를 반환하는 팩토리" 패턴과 그대로
    맞았다. `.eq()`/`.is()`/`.in()` 체인 뒤에 `.order()`/`.range()`를 붙이는 구조도 이미
    `admin/badges/page.tsx`·`ambient-drop/index.ts`에서 같은 방식으로 쓰이고 있어 타입
    호환성 리스크가 낮다고 판단.
  - 공용 헬퍼는 에러 시 예외를 던지는 정책(`orderBy` 강제와 짝을 이루는 설계)인 반면, 기존
    드랍엔진 코드는 배지 조회 실패 시 `{ data, error }`를 반환받아 `fetchDropStructure`가
    `null`을 리턴하는 그레이스풀 폴백 패턴이었다. 드랍엔진은 지급 판정 핵심 경로라 이번
    티켓의 범위(정렬 누락 수정)를 넘어 에러 처리 시맨틱까지 바꾸는 건 과했다고 보고,
    호출부에서 `.then/.catch`로 예외를 흡수해 기존 `{ data, error }` 형태로 되돌리는 방식으로
    기존 동작(에러 시 드랍 없이 조용히 종료, 상위 `sync.ts`의 per-activity try/catch가
    나머지 활동 처리를 계속)을 그대로 보존했다.
- 조사 중 같은 정렬 누락 패턴을 `ambient-drop/index.ts`의 `poi_drops(active system)` 호출부
  (136행 부근, `.order()` 없이 `.range()`만 사용)에서 추가로 발견했다. 이 티켓 범위는
  `drop-engine/index.ts:160`으로 명시돼 있어 손대지 않았고, alerts에 별도 기록.

### 변경된 파일
```
jam-web/src/lib/drop-engine/index.ts
```

### 테스트 결과
- [x] `cd jam-web && npx tsc --noEmit` — 에러 없음
- [x] `cd jam-web && npm run lint` — 0 errors, 25 warnings (모두 이번 변경과 무관한 기존 경고,
      `drop-engine/index.ts`는 목록에 없음)
- [x] `npx vitest run src/lib/drop-engine` — 3 파일 42개 테스트 통과
- [x] `npx vitest run src/lib/notifications` — 7 파일 163개 테스트 통과 (공용화한 `shared.ts`
      쪽 회귀 없음 확인)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 해당 없음 — 서버 사이드 로직 변경, 사용자 노출 텍스트 없음

### 배포 정보
- 배포일: (미배포 — review 브랜치 push까지만 진행, 병합·배포는 사용자 승인 후 오케스트레이터)
- 환경: production
- 커밋: (아래 "push한 브랜치명" 참조)

### 주요 의사결정 / 핵심 메모
- 정렬 기준: `.order('id')` — badges 테이블 PK, 유니크값이라 tie-break로 안전.
- 공용화는 진행했으나 에러 처리 시맨틱은 호출부에서 흡수해 기존 그레이스풀 폴백 동작을
  깨지 않도록 했다 (위 구현 내용 요약 참조).

### 잔여 이슈
- `ambient-drop/index.ts`의 `poi_drops(active system)` 호출부에 동일한 정렬 누락 패턴이
  있음 (범위 밖, alerts 참조 — 별도 티켓 검토 필요).
