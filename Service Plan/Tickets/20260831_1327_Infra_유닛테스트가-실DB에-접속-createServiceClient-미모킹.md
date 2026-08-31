---
id: 20260831_1327
category: Infra
status: OPEN
created: 2026-08-31
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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
