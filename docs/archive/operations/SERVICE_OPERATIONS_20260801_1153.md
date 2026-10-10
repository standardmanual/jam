# JAM! 서비스 운영 문서 — 변경분 (2026-08-01 11:53)

> **이 버전의 변경 내용:** 배지·드랍 엔진 신뢰성 개선 — 성과 배지 홍수 방지 캡 제거, 첫 Strava 동기화 범위 축소, 판정 과정 구조화 로깅 도입, 어드민 저장 단계 검증 강화.
> 이전 버전: SERVICE_OPERATIONS_20260731_1930.md

---

## [버그 수정 + 구조 개선] 조건을 충족한 성과 배지가 발급되지 않던 문제

**배경**: `sihyunrr@gmail.com` 계정이 '달리기의 루틴'(주 2회 러닝) 배지를 조건을 몇 배 초과 달성하고도 받지 못했다는 신고로 조사.

**원인**: 첫 Strava 연동 시 과거 활동 이력 전체를 한 번에 배지 평가에 넣는 구조 때문에, 온보딩 순간 common 배지 3개(첫 숨결·리듬의 발견·지구력의 전사)가 거의 동시에 발급됐다. 배지 엔진에는 "30일 내 activity_type당 최대 3개"라는 홍수 방지 캡이 있었는데, 이 캡을 온보딩 배치 자신이 소진해버려 이후 실제로 조건을 충족한 배지까지 계속 억제됐다.

**조치**:
1. **`jam-web/src/lib/badge-engine/index.ts`** — 홍수 방지 캡 블록(구 2.5단계) 전체 삭제. `type='activity'` 배지는 전부 명시적 수치 조건으로 검증되므로 캡이 불필요하다는 원칙으로 정리. 아이템/드랍 배지는 drop-engine의 확률·섀도우밴·일일 하향이 별도로 어뷰징을 방지하므로 새 캡을 만들지 않음.
2. **`jam-web/src/lib/strava/sync.ts`** — 첫 싱크(`isFirstSync`)일 때 `rawActivities`를 최신 1건으로 제한 후 배지 평가에 전달하도록 변경. 드랍엔진은 기존에도 첫 싱크 1건 제한이 있었는데(`MAX_DROP_ACTIVITIES_PER_SYNC` 로직), 배지 평가만 전체 이력을 그대로 넣던 비대칭을 없앰.
   - **영향**: 신규 가입자는 과거 Strava 이력에 대한 소급 성과 배지를 받지 않고, 가입 이후 활동부터 정상적으로(그리고 100% 보장으로) 쌓인다.

**해당 계정 조치**: 코드 배포로 이후 동기화부터 정상 발급되므로 별도 소급 지급은 진행하지 않음(다음 실제 러닝 활동 동기화 시 자동으로 조건 재평가되어 발급됨).

## [관측성] 배지·드랍 판정 구조화 로그 도입

**배경**: 위 사건 진단 시 SQL을 여러 번 직접 조회해서야 원인(홍수 방지 캡 소진)을 특정할 수 있었음 — 판정 과정 자체가 어디에도 기록되지 않았기 때문. 향후 유사 문의를 즉시 조회로 해결할 수 있게 개선.

**조치**:
1. **신규 마이그레이션** `073_engine_decision_log.sql` — `engine_decision_log` 테이블 추가(`engine`, `event`, `payload jsonb`, `user_id`, `created_at`). 어드민(service_role) 전용, RLS 미적용(`drop_policy`와 동일 패턴). jam-prod에 적용 완료.
2. **`jam-web/src/lib/engine-log/index.ts`**(신규) — `logEngineDecision()` 공용 헬퍼. 로그 실패는 메인 흐름을 막지 않음(`recordFeedEvent`와 동일한 try/catch 패턴).
3. **badge-engine**: 평가 1회(`evaluateBadgesDetailed`)당 `event='sync_result'`로 `earned`/`missed` 전체를 기록(dryRun 제외).
4. **drop-engine**: `tryItemDrop` 드랍 시도마다 `event='drop_attempt'`로 rarity 롤·섀도우밴 적용 결과·선정된 faction/book/badge 또는 실패 사유(`no_candidate`/`shadow_ban_blocked`/`slot_full`/`insert_failed`)·pity 카운터를 기록. "왜 이 배지가 뽑혔는지" 사후 재구성이 SQL 조회 한 번으로 가능해짐.
5. **포인트 지급 실패 가시화**: `awardPoints()` 반환값을 badge-engine·drop-engine 양쪽에서 확인해, 실패 시(`badge`/`drop`, `event='point_award_failed'`) 로그에 남김. 배지/드랍 자체는 그대로 확정(롤백 없음), 포인트만 수동 재처리 대상으로 표시.

## [안정성] 하드코딩 faction UUID 검증

**배경**: `drop-engine/constants.ts`·`context.ts`에 세계관(faction) UUID 5~7개가 하드코딩돼 있어, DB 리셋·재시드로 실제 UUID가 바뀌면 온보딩 필터·맥락 오버라이드가 조용히 빈 배열로 폴백해 의도한 동작이 깨질 수 있는 구조였음.

**조치**: `fetchDropStructure`가 이미 조회하는 `factions` 테이블 결과를 재사용해(추가 쿼리 없음) 하드코딩 UUID 전체의 존재 여부를 검증. 누락 시 `console.error` + `engine_decision_log`에 `event='faction_constant_missing'` 기록. 검증 통과 후에는 프로세스 생존 기간 동안 재검증을 건너뜀.

## [어드민] 배지·드랍 정책 저장 단계 검증 강화

1. **`jam-web/src/app/admin/badges/BadgeForm.tsx` + `api/admin/badges` 라우트** — 아이템 배지(`type='item'`)에 누적조건(`monthly_km`/`season_count`/`weekly_count`/`streak_days`/`total_count`) 설정 시 저장을 차단(클라이언트·서버 양쪽). 이 필드가 있으면 drop-engine의 `hasCumulativeCondition()`이 항상 true가 되어 그 배지가 구조적으로 영원히 드랍 후보에서 제외되는 문제를 사전에 막음. 공용 검증 로직은 `jam-web/src/lib/admin/badge-validation.ts`로 분리.
2. **BadgeForm** — 아이템 배지 저장 화면에 같은 아이템북·희귀도 내 다른 배지 대비 `drop_weight` 상대 확률을 실시간 표시. 배지 추가가 기존 배지들의 드랍 확률을 얼마나 희석시키는지 저장 전에 보이게 함.
3. **`api/admin/drop-policy` + `DropPolicyForm.tsx`** — rarity 4개(`common`+`rare`+`legendary`+`mythic`) 합이 1±0.001을 벗어나면 서버가 이미 400을 반환하던 기존 검증은 유지, 클라이언트 저장 버튼도 합계가 안 맞으면 비활성화하도록 보강(기존엔 경고 텍스트만 빨갛게 표시되고 저장은 막지 않았음).

## 범위 밖으로 남긴 것 (향후 별도 작업)

- 선행조건 배지가 같은 동기화 배치 내에서 체인 발급되지 않는 지연(다음 싱크에서 자연 해결).
- 주 경계 판정의 UTC/로컬 타임존 불일치(`getMondayKey` vs `startDateLocal`).
- `api/admin/test/simulate`의 동시성 락 부재(관리자 전용 테스트 도구로 리스크 낮음).

**관련 파일**: `jam-web/src/lib/badge-engine/index.ts`, `jam-web/src/lib/strava/sync.ts`, `jam-web/src/lib/drop-engine/index.ts`, `jam-web/src/lib/drop-engine/context.ts`, `jam-web/src/lib/engine-log/index.ts`(신규), `jam-web/src/lib/admin/badge-validation.ts`(신규), `jam-web/supabase/migrations/073_engine_decision_log.sql`(신규), `jam-web/src/app/admin/badges/BadgeForm.tsx`, `jam-web/src/app/admin/drop-policy/DropPolicyForm.tsx`, `jam-web/src/app/api/admin/badges/route.ts`, `jam-web/src/app/api/admin/badges/[id]/route.ts`.
