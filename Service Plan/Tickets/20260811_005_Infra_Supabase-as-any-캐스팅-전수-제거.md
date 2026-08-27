---
id: 20260811_005
category: Infra
status: CLOSED
created: 2026-08-11
closed: 2026-08-11
---

# [Infra] Supabase `as any` 캐스팅 전수 제거

## 배경 / 문제 정의
20260811_003에서 Supabase 클라이언트가 이미 `createServerClient<Database>(...)`로 타입 제네릭이 연결돼 있는데도, 코드베이스 65개 파일에서 `(supabase as any)` 캐스팅으로 이 타입 체크를 통째로 우회하고 있다는 걸 발견했다. DB 스키마와 코드 타입이 어긋나도 컴파일러가 못 잡아내는 근본 원인 중 하나로 지목되어(DEV_PROCESS_GUARDRAILS.md 패턴 3), 별도 후속 작업(task_0713d81d)으로 등록했다가 사용자 요청으로 이번 세션에서 바로 처리함.

## 구현 계획
1. `(supabase as any)` 캐스팅을 제거하고 `npx tsc --noEmit`으로 실제 에러가 나는지 확인
2. 에러 없음 → 원래 불필요한 캐스팅이었던 것(대부분의 `.select()`/`.delete()` 계열)
3. `insert()`/`update()`/`upsert()`/`rpc()` 페이로드가 `never`로 추론되는 진짜 supabase-js 라이브러리 제약이면, 캐스팅 대신 그 한 줄에만 `@ts-expect-error` + 이유 주석
4. 그 외 진짜 타입 갭(테이블/RPC가 `database.ts`에 아예 정의 안 돼 있던 경우)은 근본적으로 타입을 추가해 해결

## 구현 내용 요약
65개 파일 전부 처리 완료. 병렬 에이전트 4개로 나눠 진행했으나 3개가 세션 사용량 한도(reset 15:10 KST)로 중도 종료되어, 남은 파일들은 직접 이어서 완료했다.

**근본 타입 갭 2건 발견 및 수정** (단순 `@ts-expect-error`가 아니라 `database.ts` 자체를 고침):
1. **테이블 6개가 `database.ts`에 아예 등록된 적이 없었음**: `abusing_logs`, `abusing_policy`, `poi_blocks`, `poi_search_cache`, `user_shadow_bans`, `engine_decision_log`. 운영 DB엔 존재하지만 타입 파일엔 없어서, 관련 코드(어뷰징·GPS 감지·POI 캐시·엔진 로그 전체)가 전부 `as any`로 우회하고 있었음. `database.generated.ts` 기준으로 Row 인터페이스 + `Database.Tables` 항목을 추가.
2. **`activate_theme_preset` RPC가 `Database.Functions`에 없었음** — 추가.

**부수 발견 — `missions/rewards.ts`에서 인벤토리 없음을 조용히 skip하던 지점**: 20260811_001과 정확히 같은 패턴("정상 가입이면 항상 있어야 할 인벤토리가 없어도 조용히 넘어감")이 미션 보상 지급 경로에도 있었음. `engine_decision_log`에 기록하도록 보강.

**남은 `@ts-expect-error` 지점**: supabase-js의 `insert()`/`update()`/`upsert()`가 페이로드 타입을 `never`로 추론하는 라이브러리 제약(버전 특이 케이스), 그리고 일부 `rpc()` 인자 매칭 제약. 전부 정확히 문제가 되는 한 줄에만 scoped — 이전처럼 체인 전체(`(supabase as any).from(...).select(...).eq(...)...`)를 가리는 방식이 아니라서, 라이브러리가 업그레이드되어 문제가 해소되면 "Unused @ts-expect-error directive" 컴파일 에러가 자동으로 떠서 재검토를 강제한다.

## 변경된 파일
```
jam-web/src/types/database.ts — 테이블 6개 + RPC 1개 타입 추가 (as any 근본 원인 제거)
jam-web/src/lib/points/index.ts, engine-log/index.ts, badge-engine/index.ts,
  drop-engine/index.ts, drop-engine/policy.ts, strava/sync.ts,
  itembook/checker.ts, missions/checker.ts, missions/rewards.ts,
  abusing/gps-detector.ts, abusing/poi-block.ts, abusing/policy.ts,
  abusing/shadow-ban.ts, poi/search-cache.ts, theme/get-active-preset.ts,
  combine/index.ts, combine/policy.ts, ambient-drop/index.ts,
  ambient-drop/policy.ts, activity-feed/index.ts
jam-web/src/app/api/** — admin 14개 + 일반 라우트 12개
jam-web/src/app/(main)/**, src/app/admin/**, src/app/auth/callback/route.ts — 8개
```
(총 65개 파일)

## 테스트 결과
- [x] `npx tsc --noEmit` — 전체 통과, 에러 0건
- [x] `npx vitest run` — 134/134 통과
- [x] `npx eslint src --quiet` — 남은 15개 에러 전부 이번 작업과 무관한 기존 React hooks 이슈(BottomSheet.tsx, dotmatrix-hooks.ts 등)임을 확인, 손대지 않음

### 배포 정보
- 배포일: 2026-08-11
- 환경: production
- 커밋: (git push 시 기록)

### 주요 의사결정 / 핵심 메모
- **병렬 에이전트가 세션 한도로 죽었을 때 재시도 대신 직접 이어받음**: 사용량 한도 리셋(15:10 KST)까지 기다리지 않고 직접 나머지 파일을 처리 — 사용자가 명시적으로 "이어서 진행해줘"라고 요청한 맥락에 맞춤.
- **`@ts-expect-error`를 정확히 어느 줄에 붙여야 하는지 반복 시행착오**: 여러 줄에 걸친 메서드 체인에서 TS가 진단을 어느 줄에 귀속시키는지가 인자가 인라인 객체 리터럴이냐 변수 참조냐에 따라 달라짐. 인라인 객체는 첫 속성 줄에, 변수 참조는 그 메서드 호출 줄 자체에 귀속됨을 확인 — 이후 일관되게 "페이로드는 변수로 뽑고 호출부 바로 위에 지시어"를 표준 패턴으로 사용.
- **`.overrideTypes<T>()` 발견**: supabase-js v2에 `as any`보다 안전한 공식 API가 있음(`admin/test/simulate/route.ts`에 적용) — 타입을 완전히 대체하면서도 런타임 동작엔 영향 없음. 향후 유사 상황에서 우선 고려할 것.

### 잔여 이슈
- 없음 — 65개 파일 전부 완료, 실제 `as any` Supabase 캐스팅 잔존 0건(주석 텍스트 언급 3건만 남음, 코드 아님)
