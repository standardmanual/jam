---
id: 20260914_1813
category: BadgeEngine
priority: P1
status: OPEN
created: 2026-09-14
closed:
---

# [BadgeEngine] 인벤토리 슬롯 카운터 레이스 컨디션 — 원자적 RPC 전환

## 배경 / 문제 정의
> 왜 이 작업이 필요한가. 현재 상태와 기대 상태의 차이.

`/mattpocock-skills:improve-codebase-architecture` 아키텍처 점검(2026-09-14)에서 발견. "인벤토리
슬롯이 가득 차면 아이템배지 지급을 막는다"(§3.1)는 불변식을 지키는 세 지급 경로 —
`drop-engine/index.ts`(활동 드랍) · `missions/rewards.ts`(미션 보상) · `combine/index.ts`(아이템
조합 보상) — 가 각자 `inventory.used_slots`를 **읽고 → 메모리에서 계산 → 절대값으로 덮어쓰기**
(`.update({ used_slots: N })`)한다. 원자적 증감(`used_slots = used_slots + N`)도 낙관적 잠금도
없다.

같은 유저에게 두 경로가 겹치면(예: Strava 싱크 처리 중 유저가 조합 API를 호출) 두 요청이 같은
시점의 `used_slots`를 읽어 각자 "여유 있음"으로 판단하고 각각 지급을 진행할 수 있다 — 슬롯
상한이 조용히 뚫리거나(실제 아이템은 늘었는데 카운터는 한 건만 반영), 반대로 카운터만 튀고 실제
슬롯은 덜 찬 오차도 가능하다. 실측 사고는 아직 없으나(관측하지 않았을 뿐일 수 있음), 타이밍
윈도우가 존재하는 구조적 결함이다.

이 저장소에는 이미 같은 클래스의 결함을 고친 정답 패턴이 있다 —
[20260830_0057](../P1-중요/20260830_0057_BadgeEngine_아이템배지-슬롯-장착해제-레이스컨디션-원자적RPC전환.md)이
`slot_item_into_book()`/`unslot_item_from_book()` RPC로 같은 문제(락 없는 순차 REST 호출)를
`SELECT ... FOR UPDATE` 배타 락 트랜잭션으로 고쳤고, 앰비언트 드랍의
`mint_and_place_ambient_drop` RPC도 "삽입 + 상태갱신을 한 트랜잭션으로 묶기" 패턴을 쓰고 있다
(BADGE_ENGINE_UNIFIED.md §3.5-2 "표준 불변식 1" 참고). 이번 작업은 그 규율을 아직 벗어나 있는
`inventory.used_slots` 갱신 세 곳에 동일 패턴을 확장 적용한다.

참고로 직전 티켓 [20260912_2116](../P3-낮음/20260912_2116_Service_슬롯부족시배지지급생략정책-3곳분산-공통헬퍼검토.md)이
같은 세 곳의 중복을 이미 한 차례 검토했으나, 그때는 **"슬롯이 찼는지 판정"만** `isInventoryFull()`
공용 헬퍼로 묶었고 **"판정 후 실제로 카운터를 갱신하는 부분"(이번 티켓의 대상)은 의도적으로
범위 밖으로 남겼다.** 이번 작업은 그 다음 단계다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 신규 Postgres RPC(가칭 `grant_inventory_item(inventory_id, badge_id, obtained_by, expires_at)`)를
  만들어 **"`inventory_items` 삽입 + `inventory.used_slots` 증가"를 하나의 트랜잭션**으로 묶는다.
  트랜잭션 안에서 `SELECT ... FOR UPDATE`로 `inventory` 행을 잠근 뒤 `used_slots < max_slots`를
  재확인하고, 통과하면 삽입 후 증가, 실패하면 아무것도 반영하지 않고 "슬롯 없음"을 알린다
  (§3.5-2 표준 불변식 1과 동일한 락 순서 규율을 따른다 — `inventory` → `inventory_items`).
- 반대 방향(조합 소각 시 슬롯 반환)도 같은 레이스 대상이므로, 대응하는 감소 RPC(가칭
  `release_inventory_slots(inventory_id, count)`)도 함께 만든다 — `combine/index.ts`의 소각 직후
  감소 로직이 대상.
- 세 호출부(`drop-engine/index.ts`·`missions/rewards.ts`·`combine/index.ts`)의 read-then-write
  쌍을 전부 이 RPC 호출로 교체한다. 세 곳을 한 변경 단위로 함께 처리한다(하나만 고치면 나머지
  조합에서 레이스가 그대로 재현되므로 — 그릴링 세션에서 확정한 결정).
- 기존 `isInventoryFull()`(`src/lib/inventory/slots.ts`)은 유지한다 — 화면 단(인벤토리 포화 안내
  배너 등)의 사전 판정용으로는 여전히 유효하고, 이번 RPC는 실제 지급 시점의 최종·원자적 확인을
  맡는다. 프리체크와 최종 확인의 역할이 겹치는 게 아니라 나뉘는 구조다.
- RPC가 "슬롯 없음"을 반환하면 호출부는 **지금과 동일하게 조용히 스킵**한다(로그만 남기고 유저
  화면 문구는 바꾸지 않음 — 아래 UI/UX 관점 참고). 다만 반환 타입을 명시적으로 처리하도록 만들어
  (`{ ok: true, itemId } | { ok: false, reason: 'slot_full' }` 형태), 향후 네 번째 지급 경로가
  추가될 때 이 케이스를 빠뜨리면 타입 에러가 나게 한다.
- 마이그레이션 파일은 작성만 하고 실행하지 않는다(`db` 유형과 동일 원칙 — 이 티켓은 실행까지
  포함하므로 `/jam-work` 4단계에서 사용자 승인 하에 오케스트레이터가 직접 실행한다).

### UI/UX 관점 (해당 시)
- 변경 없음. 인벤토리 포화 안내는 [20260912_1940](../P2-일반/20260912_1940_UI_인벤토리-포화-안내-드랍시트-진입.md)에서
  이미 구현·배포됐고(인벤토리 화면의 [현상→원인→해결책] 카드 안내 + "드랍하기" CTA), 이번 작업은
  그 문구·트리거 조건을 건드리지 않는다.

### 컨텐츠 관점 (해당 시)
- 해당 없음.

## 구현 계획
> 어떻게 구현할지. 접근 방법, 영향 범위, 주요 변경 포인트.

1. `supabase/migrations/0XX_atomic_inventory_slot_grant.sql` — `grant_inventory_item()`·
   `release_inventory_slots()` 두 RPC 신설. `slot_item_into_book()`(마이그레이션 111)의
   락·재확인 패턴을 그대로 참고한다.
2. `src/lib/drop-engine/index.ts`의 삽입+`usedSlots` 배치갱신(627·700·736-743행)을
   `grant_inventory_item()` 호출로 교체 — 현재는 루프 끝에 한 번만 쓰는 배치 방식인데, RPC가
   호출마다 원자적으로 확인하므로 루프 중 즉시 호출로 바뀐다(오히려 로직이 단순해진다).
3. `src/lib/missions/rewards.ts:92-146`, `src/lib/combine/index.ts:69-161,313-318`의 대응 로직도
   같은 RPC 호출로 교체.
4. 세 호출부의 반환값 처리를 신규 결과 타입에 맞게 정리.
5. 동시성 시나리오(같은 유저에게 두 지급 경로가 거의 동시에 발생하는 경우)를 다루는 회귀 테스트
   추가 검토 — 완전한 동시성 테스트가 어려우면 최소한 RPC 자체의 "슬롯 가득 참 시 거부" 단위
   테스트는 추가한다.
6. `src/types/database.generated.ts` 갱신(Supabase MCP `generate_typescript_types`) — 신규 RPC
   타입 반영.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 해당 없음 — 유저 노출 문구 변경 없음

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

- `/mattpocock-skills:improve-codebase-architecture` → `grilling` 세션에서 결정된 사항:
  ① 카운터만이 아니라 지급+카운터를 한 원자 단위로 묶는다, ② Postgres RPC로 구현한다(기존
  컨벤션), ③ 세 호출부를 한 번에 전환한다, ④ 유저 화면 문구는 바꾸지 않고 코드 쪽 처리만
  강제한다.

### 잔여 이슈
-
