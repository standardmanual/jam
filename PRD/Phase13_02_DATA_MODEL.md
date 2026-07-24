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
  ADD COLUMN visible_rank_count INTEGER; -- NULL = 전체 공개, 숫자 = 상위 N명만 목록에 노출(본인은 항상 별도 표시)
```

- `status_display_type`: 관리자가 미션 등록/수정 시 선택. 기본값 `'ranking'`.
- `visible_rank_count`: 관리자가 미션마다 지정. NULL이면 참가자 전원 노출.

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

## 6. 마이그레이션 파일

- `jam-web/supabase/migrations/0XX_mission_status_display.sql`: 위 §2의 `ALTER TABLE missions` — 번호는 구현 시점의 최신 번호 다음 값 사용.
