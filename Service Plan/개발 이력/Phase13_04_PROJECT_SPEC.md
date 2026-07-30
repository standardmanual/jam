# JAM! Phase 13 프로젝트 스펙 — 미션 참가 확정 + 미션 상황

> 작성일: 2026-07-23

---

## 1. 기술 스택 (기존 유지)

기존 미션 시스템(`src/lib/missions/`, `src/app/(main)/missions/`, `src/app/admin/missions/`) 패턴 그대로 확장. 신규 스택 도입 없음.

## 2. 파일 구성

```
[마이그레이션]
supabase/migrations/0XX_mission_status_display.sql   # status_display_type, visible_rank_count, reward_badge_ids

[lib]
src/lib/missions/checker.ts        # 참가 게이트 추가 + poi_visit/item_collect 진행률 구현 + grantMissionRewards 호출 (수정)
src/lib/missions/status.ts         # 랭킹/달성 조회·정렬 로직 (신규, API에서 재사용)
src/lib/missions/rewards.ts        # 신규 — 배지(타입별 분기)+포인트 실제 지급, 결과 반환
src/lib/activity-feed/index.ts     # mission_completed 메타 타입 교체 (수정)

[API]
src/app/api/missions/[id]/join/route.ts      # DELETE 제거 (수정)
src/app/api/missions/[id]/status/route.ts    # 신규 GET

[서비스 UI]
src/app/(main)/missions/[id]/MissionDetailClient.tsx   # 취소버튼 제거, 미션상황 메뉴 추가, 달성형 표시 분기 (수정)
src/app/(main)/missions/[id]/status/page.tsx           # 신규 — 미션 상황 화면
src/app/(main)/missions/[id]/status/StatusClient.tsx   # 신규 — 랭킹형/달성형 렌더링
src/app/(main)/HomeFeedSection.tsx                     # mission_completed 카드 결과요약+보상내역 렌더링 (수정)
src/app/(main)/profile/ProfileClient.tsx               # 동일 (수정)

[어드민]
src/app/admin/missions/MissionList.tsx    # status_display_type·visible_rank_count·배지 다중선택·포인트 폼 필드 (수정)
src/app/api/admin/missions/route.ts       # reward_badge_ids 저장 확인 — 이미 body 통째 insert라 별도 수정 불필요할 가능성 높음, 검증만
```

## 3. 구현 규칙

- **참가 게이트는 `checker.ts` 한 곳에서만** — 진행률 갱신과 완료 판정 둘 다 `participationSet.has(mission.id)` 체크 이후에만 실행.
- `poi_visit`/`item_collect` 진행률은 **0/1 정수**로 취급 — 소수점 없음, `getTarget()`도 1 고정.
- 미션 상황 API는 **참가자만 호출 가능** (403) — 미참가자에게 다른 유저들의 진행상황을 노출하지 않는다.
- `visible_rank_count`가 설정된 경우, 응답 목록은 그 수만큼 자르되 **요청자 본인은 항상 포함**(목록 안에 있으면 그대로, 없으면 `me` 필드로 별도 전달).
- 랭킹 정렬은 `checker.ts`가 이미 갖고 있는 완료 판정 로직과 일관되게 — 완료 여부·완료 시각을 `user_mission_completions`에서, 진행값은 `user_mission_participations.progress_value`에서 가져온다 (별도 캐시 테이블 만들지 않음).
- 어드민 폼의 `status_display_type` 기본값은 `mission_type`에 따라 추천값을 미리 선택해두되(`distance`/`activity_count` → ranking, `poi_visit`/`item_collect` → achievement), **강제하지 않는다** (관리자가 자유롭게 변경 가능).
- **보상 지급은 `rewards.ts` 한 곳에서만** — `checker.ts`가 직접 `user_activity_badges`/`inventory_items`/`awardPoints`를 호출하지 않고 `grantMissionRewards()`를 통해서만 지급한다 (드랍엔진의 레이어 분리 패턴과 동일한 이유: 테스트 가능성 + 단일 책임).
- 배지 지급 시 `badges.type`으로 반드시 분기 — 액티비티배지를 `inventory_items`에 넣거나 그 반대로 넣는 실수 금지.
- 아이템배지 지급이 인벤토리 슬롯 초과로 스킵되어도 **나머지 보상(다른 배지·포인트)은 정상 지급** — 하나 실패했다고 전체 롤백하지 않는다.
- **주의**: `badges.point_reward`(배지 자체 포인트) 자동 지급은 DB 트리거가 아니라 `badge-engine`/`drop-engine` 코드 안에만 구현되어 있다. `rewards.ts`에서 `user_activity_badges`/`inventory_items`에 직접 INSERT해도 그 로직은 실행되지 않으므로, **배지를 지급할 때마다 그 배지의 `point_reward`를 확인해 `awardPoints(..., 'badge_point_reward', {sourceBadgeId})`로 별도 호출**해야 어드민 폼의 기존 경고 문구("이 배지는 발급 시 자동으로 포인트도 지급됩니다")가 실제로 맞아떨어진다. 미션 자체의 `reward_points`는 그와 별개로 `'mission_point_reward'` 사유로 1회 추가 지급 — 두 사유(reason)를 구분해 포인트 내역에서 "왜 받았는지" 추적 가능하게 유지.

## 4. 절대 하지 마

- 참가 취소 기능을 어떤 형태로든 남겨두지 마 (버튼 숨김만 하고 API는 살려두는 식의 반쪽 구현 금지)
- 미참가자에게 미션 상황(다른 유저 진행상황) 노출 금지
- `poi_visit`/`item_collect`에 소수점 진행률 도입 금지 (0/1만)
- 기존 `distance`/`activity_count` 미션의 진행률 계산 로직(누적 방식) 변경 금지 — 이번 범위는 참가 게이트·표시 방식 추가일 뿐
- 새로운 미션 타입(기간 내 POI 방문 횟수 등) 구현 — Phase 2 범위, 이번엔 하지 마

## 5. 완료 체크리스트

- [ ] Step A: 참가 게이트 버그 수정 + 참가취소 완전 제거
- [ ] Step B: poi_visit/item_collect 진행률 구현
- [ ] Step C: status_display_type/visible_rank_count 마이그레이션 + 상황 API
- [ ] Step D: 미션 상황 UI + 어드민 폼 필드
- [ ] Step E: 보상 구성(배지 복수선택+포인트) + 실제 지급(rewards.ts) + 피드 확장
- [ ] Step F: tsc 0 에러 + SERVICE_OPERATIONS 문서 + commit/push
