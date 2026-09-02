---
id: 20260902_2213
category: Service
status: OPEN
created: 2026-09-02
closed:
---

# [Service] 미션 reward_badge_ids null 오염으로 인한 PostgREST 400 에러 수정

## 배경 / 문제 정의

Supabase(jam-prod) 최근 24시간 로그 점검 중 `/rest/v1/badges` 엔드포인트에서 400 에러 3건을
발견 (`id=in.(null, ...)` 형태). 원인을 추적한 결과 다음이 확인됐다:

`jam-web/supabase/seed_phase13_missions_30.sql`이 `missions.reward_badge_ids`를 채울 때
다음 패턴을 사용했다:

```sql
ARRAY[(SELECT id FROM public.badges WHERE type = 'item' AND name = '레트로 스타' LIMIT 1)]::uuid[]
```

스크립트 자체 주석은 "이름이 안 맞으면 서브쿼리가 NULL을 반환하고 필드가 비어있게 된다"고
적었으나 이는 틀린 가정이다. Postgres에서 `ARRAY[NULL]`은 빈 배열(`{}`)이 아니라
**NULL 원소 1개짜리 배열 `{NULL}`** 이 된다. 실제로 시드가 참조한 아이템배지 이름
(레트로 스타·익스플로어·어썸 오벌·슈퍼 옐로우·스파클 스마일·레인보우 하트·타겟 하트·
더블 스마일 하트·레트로 선 아치·더블 오벌·베스트 스타 배너)은 `migrations/012_item_badges_100.sql`에
애초에 존재하지 않아(오타 또는 실제 미생성) 서브쿼리가 전부 NULL을 반환했고, null이 섞인
배열이 그대로 DB에 저장됐다.

DB 조회 결과 **미션 14건**이 `reward_badge_ids`에 null 원소를 갖고 있다
(`SELECT id, title, reward_badge_ids FROM missions WHERE exists (select 1 from unnest(reward_badge_ids) x where x is null)`).

### 영향받는 코드 2곳

1. **`jam-web/src/app/(main)/missions/page.tsx:74`** — 미션 목록 조회 시 전체 미션의
   `reward_badge_ids`를 `flatMap`으로 모아 `badges` 테이블에 `id=in.(null,...)`로 질의 →
   PostgREST 400(`22P02 invalid input syntax for uuid: "null"`). `badgeRowsError`는 콘솔
   로그만 되고 화면은 정상 렌더되지만(배지명이 빠질 뿐), 매 목록 로드마다 불필요한 400 에러가
   발생한다.
2. **`jam-web/src/lib/missions/rewards.ts:46-58`** — 더 심각한 지점. 유저가 이 14개 미션 중
   하나를 실제로 완료하면 `grantMissionRewards()`가 같은 400 에러를 만나는데,
   `const { data: badgesRaw } = await supabase...` 구문이 **`error`를 아예 체크하지 않아**
   실패가 로그조차 없이 조용히 `badges = []`로 처리된다. 결과적으로 미션 완료 시 `reward_points`는
   정상 지급되지만 배지 보상 지급 시도 자체가 실패 흔적 없이 스킵된다.

## 상세 요구사항

### 서비스/코드베이스 관점

- **데이터 정리**: 14개 미션의 `reward_badge_ids`에서 null 원소 제거
  (`array_remove(reward_badge_ids, NULL)`). 원래 있던 배지 이름들은 badges 테이블에 존재하지
  않으므로 "복구"가 아니라 "잘못 채워진 null 슬롯 정리"다 — 정리 후에도 이 미션들은 배지 보상 없이
  포인트만 지급되는 게 맞는 동작이다(운영자가 나중에 정식으로 배지를 재지정할 수 있음).
- **코드 방어 1**: `missions/page.tsx:74`의 `flatMap((m) => m.reward_badge_ids ?? [])`에
  null 필터링 추가.
- **코드 방어 2**: `lib/missions/rewards.ts:53`의 badges 조회에 `error` 체크·로깅 추가
  (다른 조회부와 동일한 패턴으로). 추가로 `badgeIds` 자체도 null 방어 필터링.
- 참고: `logEngineDecision` 등 기존 삭제배지 스킵 로깅 패턴(20260825_016/018 티켓)과 일관되게
  가면 좋음 — 다만 이번 건은 "삭제된 배지"가 아니라 "애초에 없는 badge_id(null)"이므로 완전히
  같은 처리를 강제하지는 않는다.

### UI/UX 관점 (해당 시)
- 해당 없음 (사용자에게 노출되는 문구 변경 없음)

### 컨텐츠 관점 (해당 시)
- 해당 없음 (14개 미션의 배지 보상 슬롯이 비게 되는 것은 이미 사실상 그랬던 상태 — 신규 변경 아님)

## 구현 계획

1. `jam-web/supabase/seed_*.sql` 옆에 정리용 SQL 파일 작성
   (`jam-web/supabase/seed_fix_mission_reward_badge_ids_null_20260902.sql`) —
   14개 미션 `reward_badge_ids`에서 `array_remove(..., NULL)` 적용. 실행은 이 티켓 승인 후
   오케스트레이터가 직접 수행(CLAUDE.md 규칙 5 — jam-developer는 파일 작성까지만).
2. `missions/page.tsx:74` — null 필터링 추가.
3. `lib/missions/rewards.ts` — `error` 체크·로깅 추가, `badgeIds` null 방어.
4. 수정 후 `/missions` 페이지 및 관련 유닛 테스트(있다면)로 회귀 확인.
