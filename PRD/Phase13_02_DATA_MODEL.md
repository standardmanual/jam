# JAM! Phase 13 데이터 모델 — 미션 참가 확정 + 미션 상황

> 작성일: 2026-07-23

---

## 1. 기존 테이블 (재사용)

| 테이블 | 역할 | 변경 여부 |
|--------|------|-----------|
| `missions` | 미션 마스터 | 컬럼 2개 추가 |
| `user_mission_participations` | 참가 기록 (`user_id`, `mission_id`, `joined_at`, `progress_value`) | 변경 없음 (삭제 로직만 제거) |
| `user_mission_completions` | 완료 기록 | 변경 없음 |

## 2. `missions` 테이블 컬럼 추가

```sql
ALTER TABLE public.missions
  ADD COLUMN status_display_type TEXT NOT NULL DEFAULT 'ranking'
    CHECK (status_display_type IN ('ranking', 'achievement')),
  ADD COLUMN visible_rank_count INTEGER, -- NULL = 전체 공개, 숫자 = 상위 N명만 목록에 노출(본인은 항상 별도 표시)
  ADD COLUMN reward_badge_ids UUID[] NOT NULL DEFAULT '{}'; -- 복수 배지 보상 (신규)

-- 기존 단일 배지 보상(reward_type IN ('badge','item_badge') AND reward_id IS NOT NULL)을 배열로 이관
UPDATE public.missions
SET reward_badge_ids = ARRAY[reward_id]
WHERE reward_type IN ('badge', 'item_badge') AND reward_id IS NOT NULL;

-- reward_type/reward_id는 배지+포인트 동시 구성으로 대체되어 더 이상 필수 아님 (컬럼은 legacy로 보존, 새 코드는 참조 안 함)
ALTER TABLE public.missions ALTER COLUMN reward_type DROP NOT NULL;
```

- `status_display_type`: 관리자가 미션 등록/수정 시 선택. 기본값 `'ranking'`.
- `visible_rank_count`: 관리자가 미션마다 지정. NULL이면 참가자 전원 노출.
- `reward_badge_ids`: 관리자가 검색·다중 선택. 액티비티배지·아이템배지 구분 없이 `badges.id` 배열.
- `reward_type`/`reward_id`: **폐기(deprecated), 컬럼은 삭제하지 않고 남겨둠**(데이터 손실 방지) — 새 코드는 읽지도 쓰지도 않는다.

## 3. `checker.ts` 로직 변경 (참가 게이트)

```
현재: for (mission of pendingMissions) { ...achieved 판정...; completions INSERT }
변경: for (mission of pendingMissions) {
        if (!participationSet.has(mission.id)) continue  // ← 추가: 참가자만 진행
        ...achieved 판정...; completions INSERT
      }
```

## 4. `poi_visit` / `item_collect` 진행률 계산 (신규)

`calculateProgress()`에 두 케이스 추가. 두 타입 모두 활동 배치(`activities`)만으로는 판단 불가 — DB 조회 필요하므로 `checkMissions()` 함수 시그니처에 `userId` 기반 조회를 추가.

```
poi_visit:
  condition.poi_id로 해당 POI 방문 여부 확인
  → 방법 A: user_activity_badges에 해당 poi_id로 연결된(triggered_by_poi_id) 배지가 있는지
  → 방법 B: 별도 poi 방문 로그 테이블이 없다면 방법 A로 충분 (POI 배지 매칭 시스템 재사용)
  progress = 방문 이력 있으면 1, 없으면 0

item_collect:
  condition.badge_id를 보유하는지 (user_activity_badges 또는 inventory 계열)
  progress = 보유하면 1, 없으면 0
```

- 두 타입은 진행값이 항상 0 또는 1 — `getTarget()`도 두 케이스에서 1 반환하도록 통일(기존 `MissionDetailClient.tsx`의 `target: 1` 표시와 일치).

## 5. 미션 상황 API 응답 형태

```typescript
// GET /api/missions/[id]/status (참가자 전용, 403 for 미참가자)

interface RankingEntry {
  userId: string
  username: string
  avatarUrl: string | null
  progressValue: number
  isCompleted: boolean
  completedAt: string | null
  rank: number // 달성자는 달성 순서, 미달성자는 진행값 내림차순 이어서 부여
}

interface AchievementEntry {
  userId: string
  username: string
  avatarUrl: string | null
  achieved: boolean
  achievedAt: string | null
}

// 랭킹형 응답
{
  type: 'ranking',
  entries: RankingEntry[],       // visible_rank_count만큼 (또는 전체)
  me: RankingEntry,              // 내 순위 — entries에 없으면 별도 포함
  totalParticipants: number
}

// 달성형 응답
{
  type: 'achievement',
  entries: AchievementEntry[],   // visible_rank_count만큼 (또는 전체) — 달성자 우선 정렬
  me: AchievementEntry,
  totalParticipants: number
}
```

- 정렬 규칙(랭킹형): `isCompleted DESC, completedAt ASC(먼저 달성한 사람 우선), progressValue DESC`
- `username`은 `users.username` 조인 (기존 유저 검색 API와 동일하게 `username IS NOT NULL`인 유저만 표시 — NULL이면 "익명"으로 폴백)

## 6. 보상 지급 로직 (`src/lib/missions/rewards.ts`, 신규)

완료 판정 직후 호출. 배지 타입(`badges.type`)에 따라 지급 테이블이 갈린다.

```
grantMissionRewards(userId, mission):
  1. reward_badge_ids로 badges 조회 (id, name, image_url, type, rarity)
  2. 타입별 분리:
     - type='activity': user_activity_badges에 이미 있으면 skip, 없으면 INSERT
       (triggered_by: `mission_reward:${mission.id}`)
     - type='item': inventory 조회 → 슬롯 가득 차면 skip, 아니면 inventory_items INSERT
       (obtained_by: 'system_event') + inventory.used_slots +1
  3. 지급된 배지 각각의 badges.point_reward가 0보다 크면
     awardPoints(userId, point_reward, 'badge_point_reward', {sourceBadgeId}) 개별 호출
     — badge-engine/drop-engine의 자동 포인트 지급은 DB 트리거가 아니라 그 코드 안에만
       있어서, rewards.ts에서 직접 INSERT하면 여기서 명시적으로 재현해야 함
  4. reward_points > 0이면 awardPoints(userId, reward_points, 'mission_point_reward', {sourceMissionId})
     — 배지 포인트와는 별개 사유(reason)로 추가 지급
  5. 반환: { awardedBadgeIds, awardedBadgeNames, totalAwardedPoints } — 피드 메타데이터에 그대로 사용
```

## 7. 피드 메타데이터 확장 (`mission_completed`)

```typescript
// FeedEventMeta['mission_completed'] (기존 reward_type 필드 제거, 아래로 대체)
{
  mission_id: string
  mission_title: string
  reward_points: number | null           // 유지 (실제 지급된 값)
  awarded_badge_ids: string[]            // 신규 — 실제 지급된 배지 id 목록
  awarded_badge_names: string[]          // 신규 — 표시용 이름 (badge_image_url은 렌더링 시 배지별로 별도 조회하거나 이름만 표시)
  final_progress_value: number           // 신규 — 완료 시점 진행값 ("결과 요약"용)
  target_value: number                   // 신규 — 완료 당시 목표치 스냅샷 (예: "52km / 목표 50km")
}
```

- 홈/프로필 피드 카드: "미션 완료 — {mission_title}" + 결과 요약(`final_progress_value`/`target_value`) + 보상 배지 이름들 + `+{reward_points}P`
- 기존 `reward_type` 필드는 더 이상 metadata에 넣지 않음 — 표시 로직(`HomeFeedSection.tsx`/`ProfileClient.tsx`)에서 `rewardTypeLabel` 참조 제거하고 위 필드 기반으로 재작성.

## 8. 마이그레이션 파일

- `jam-web/supabase/migrations/0XX_mission_status_display.sql`: §2의 `ALTER TABLE missions` (status_display_type + visible_rank_count + reward_badge_ids) — 번호는 구현 시점의 최신 번호 다음 값 사용.
