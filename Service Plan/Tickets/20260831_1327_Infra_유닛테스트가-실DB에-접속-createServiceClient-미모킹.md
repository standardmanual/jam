---
id: 20260831_1327
category: Infra
status: CLOSED
created: 2026-08-31
closed: 2026-09-01
---

# [Infra] 유닛 테스트가 실제 Supabase에 접속한다 — createServiceClient 미모킹

## 배경 / 문제 정의

`jam-web/src/lib/strava/__tests__/sync-drop-order.test.ts`가 `createServiceClient()`를 모킹하지
않아 **실제 Supabase 클라이언트 생성을 시도한다.** 결과가 환경에 따라 두 갈래로 갈리는데
둘 다 문제다.

1. **자격증명이 없는 환경** — `.env.local`이 없는 워크트리·CI에서 항상 2케이스가 실패한다
   (`Your project's URL and Key are required to create a Supabase client!`).
   `npx vitest run src` 전체가 상시 red라 **진짜 회귀가 이 노이즈에 묻힌다.**
   실제로 티켓 20260831_1149·1259 두 건 모두 이 실패를 "기존 실패"로 확인하는 데
   원복 재현 절차를 따로 태워야 했다.
2. **자격증명이 있는 환경** — 유닛 테스트가 **운영 DB에 접속할 수 있다.** Supabase는
   staging·프로덕션 **공용 단일 DB**다. 지금은 읽기만 하더라도, 쓰기를 하는 테스트가
   하나 추가되는 순간 프로덕션 데이터가 바뀐다. 구조 자체가 사고를 기다리는 상태다.

같은 디렉터리의 `src/lib/abusing/__tests__/policy-save.test.ts`는 `vi.mock('@/lib/supabase/server')`로
스텁을 주입하는 방식이라 대조 사례로 삼을 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `sync-drop-order.test.ts`가 실제 Supabase 클라이언트를 만들지 않게 한다.
  `policy-save.test.ts`의 `vi.mock('@/lib/supabase/server', ...)` 패턴을 참고한다.
- **테스트의 검증 의도를 훼손하지 않는지 확인한다.** 이 테스트가 원래 무엇을 고정하려 했는지
  먼저 읽고, 모킹으로 그 의도가 살아 있는지 판단한다. 의도 자체가 실 DB 통합 검증이었다면
  유닛 테스트에서 분리하는 쪽이 맞다.
- `src/` 전체에서 `createServiceClient`·`createClient`를 모킹 없이 호출하는 테스트가
  더 있는지 전수 확인한다.
- 가능하면 **테스트 환경에서 실 자격증명이 새어 들어오지 못하도록** 막는 장치를 검토한다
  (vitest setup에서 Supabase env를 비우거나, 클라이언트 생성 시 테스트 환경을 감지해 throw).

### 범위 밖

- 워크트리에 `.env.local` 심볼릭 링크를 거는 것은 해결책이 아니다. 2번 위험을 오히려 키운다.

## 구현 계획

1. `sync-drop-order.test.ts`의 원래 검증 의도 파악
2. Supabase 클라이언트 모킹 도입 (또는 통합 테스트로 분리)
3. 모킹 없는 다른 테스트 전수 확인
4. `npx vitest run src` 전체가 green이 되는지 확인 — **이게 이 티켓의 완료 조건**

### 참고 문서
- `Service Plan/Tickets/20260831_1259_Service_어뷰징정책-폴백이-섀도우밴-판정을-뒤집음.md` (분리 출처)
- `jam-web/src/lib/abusing/__tests__/policy-save.test.ts` (모킹 대조 사례)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 원인 특정: `sync-drop-order.test.ts`는 `processFetchedActivities`에 가짜 supabase 클라이언트를
  주입하지만, 내부에서 호출되는 `findCompletableItemBooks()`(컬렉션 완성 가능 소식 판정,
  `@/lib/itembook/completable`)가 **주입 사슬 밖에서 자체적으로 `createServiceClient()`를
  호출**해 실제 Supabase에 접속하고 있었다. `createNotification`·`recordActivityRecap`·
  `selectCompletableDrafts`도 모킹 공백이었다(대조군 `sync-vehicle-speed-filter.test.ts`는
  20260831_1300 작업 때 이미 이 전량 모킹 패턴을 적용해뒀다).
- `sync-drop-order.test.ts`에 `@/lib/itembook/completable`·`@/lib/notifications`·
  `@/lib/notifications/recap`·`@/lib/notifications/batch/collections` 모킹을 추가하고,
  `@/lib/supabase/server`의 `createServiceClient`를 "호출되면 즉시 throw"하는 가드로 모킹해
  (대조 사례 `sync-vehicle-speed-filter.test.ts`와 동일 패턴) 주입 사슬이 끊기면 조용히 실 DB에
  붙는 대신 테스트가 바로 실패하도록 했다.
- 전수 확인(요구사항 3): `src/` 내 34개 `*.test.ts(x)` 파일 중 `vi.mock(...supabase...)`가 없는
  파일을 전부 나열하고, `NEXT_PUBLIC_SUPABASE_URL`을 존재하지 않는 호스트로 바꿔
  `npx vitest run src` 전체를 실행해 실제로 네트워크를 타는 파일이 `sync-drop-order.test.ts`
  하나뿐임을 확인했다(다른 "모킹없음" 파일들은 순수 로직 테스트라 애초에 Supabase를 안 쓴다).
  `today/`·`missions/` 아래 `test:node`(tsx 러너, 별도 스크립트) 대상 파일들도 `createServiceClient`/
  `createClient` 호출이 없음을 grep으로 확인했다(`visibility-realdata.test.ts`는 이름과 달리
  실제 DB 접속 없이 하드코딩 픽스처를 쓴다).
- 요구사항 4(가능하면 검토)를 적용: `vitest.setup.ts`를 신설해 매 테스트 파일 실행 전
  `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`를
  `process.env`에서 지우도록 `vitest.config.ts`의 node 프로젝트에 `setupFiles`로 연결했다.
  이제 `.env.local`이 있는 로컬 환경에서도 모킹을 빠뜨리면 "조용히 실 DB 접속"이 아니라
  `createServiceClient()`가 즉시 throw해 CI와 동일한 실패 양상으로 드러난다(임시 테스트로
  `.env.local`이 있는 상태에서도 `createServiceClient()` 호출이 즉시 예외를 던지는지 확인 후
  스크래치 파일 삭제).
- 테스트 검증 의도는 훼손하지 않았다: 이 테스트의 원래 의도(드랍 처리 순서 → `last_activity_at`
  최종 상태 고정)는 실 DB 접속 여부와 무관하며, 모킹 대상은 모두 이 테스트가 검증하지 않는
  부수 경로(컬렉션 완성 소식·알림 배치)다.

### 변경된 파일
```
jam-web/src/lib/strava/__tests__/sync-drop-order.test.ts  (누락된 모킹 추가 — itembook/completable, notifications 3종, supabase/server 가드)
jam-web/vitest.config.ts  (node 프로젝트에 setupFiles 연결)
jam-web/vitest.setup.ts  (신규 — Supabase 관련 env를 테스트 전 비움)
```

### 테스트 결과
- [x] `npx vitest run src` — 34개 파일 / 445개 테스트 전체 green (자격증명 있는 로컬 환경, 자격증명이
      무효화된 환경 양쪽 모두 확인)
- [x] `NEXT_PUBLIC_SUPABASE_URL`을 존재하지 않는 호스트로 바꾼 상태에서 수정 전 코드로 재현 —
      `sync-drop-order.test.ts` 2케이스가 5초 타임아웃으로 실패함을 먼저 확인(수정 대상 확정),
      수정 후 같은 조건에서 34개 파일 전체 green으로 전환됨을 재확인
- [x] `npm run lint` 전체 — 0 error, 26 warning(모두 이번 변경과 무관한 기존 파일)

### 배포 정보
- 배포일: 2026-09-01
- 환경: staging (프로덕션은 /jam-ship으로 별도 진행)
- 커밋: `683ecc40`(머지) — 머지 직후 발견된 무관 파일의 lint 경고 초과를 `55d29f88`로 별도 수정
  (jam-ds 스킬 설치 과정에서 커밋에 섞여 들어온 `ds-sync-check.mjs`가 원인, 이 티켓 범위 밖)

### 주요 의사결정 / 핵심 메모
- `sync-vehicle-speed-filter.test.ts`(티켓 20260831_1300 산출물)가 이미 "정답 패턴"을 갖고
  있어서 그대로 이식했다 — createServiceClient를 throw 가드로 모킹해 향후 같은 종류의 모킹
  누락을 즉시 드러나게 하는 방식.
- vitest setupFiles로 env를 비우는 장치는 티켓의 "가능하면" 조항이지만, 근본 원인(개별 테스트의
  모킹 누락)과 별개로 **재발 방지 레이어**로 유효하다고 판단해 추가했다. storybook 프로젝트에는
  적용하지 않았다(범위 밖, 브라우저 테스트는 이번 문제와 무관).

### 잔여 이슈
- 없음

### 개선 리뷰(progressive-reviewer) 제안 반영
- `Service Plan/Specs/DEV_PROCESS_GUARDRAILS.md`에 "패턴 10 — 테스트가 진입점만 모킹하고,
  내부에서 새로 열리는 접속 경로는 새어나감"으로 반영 완료.
- 공용 모킹 헬퍼 추출·env 이름 변경 시 주석 남기기·CI 스크립트화는 리뷰어도 "지금 당장은
  불필요"로 판단한 제안이라 보류(패턴 10 규칙 3에 "세 번째 발견 시 고려"로 기록해둠).
