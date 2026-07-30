# JAM! 서비스 운영 문서 — 변경분 (2026-07-24 18:05)

> **이 버전의 변경 내용:** Phase13 미션 개편 — ①참가 필수화 버그 수정(참가자만 완료/보상 대상)+참가취소 폐지, ②poi_visit/item_collect 진행률(달성형) 구현, ③미션 상황 API/화면(랭킹형·달성형) 신설, ④보상 구성 개편(배지 복수선택+포인트, 배지 미지급 버그 해결).
> 이전 버전: SERVICE_OPERATIONS_20260723_2205.md

---

## 9. 미션 시스템 (Phase13 개편)

**관련 파일:** `src/lib/missions/checker.ts`, `src/lib/missions/rewards.ts`(신규), `src/app/api/missions/[id]/join/route.ts`, `src/app/api/missions/[id]/status/route.ts`(신규), `src/app/(main)/missions/[id]/`(상세·상황 화면), `src/app/admin/missions/MissionList.tsx`, `supabase/migrations/046_mission_status_display.sql`

### 9-1. 미션 참가

```
POST /api/missions/[id]/join

조건:
  ① 해당 미션 존재 (missions 테이블)
  ② missions.ends_at > now (진행 중)
  ③ 중복 참가: UNIQUE 위반(23505) → 409 반환

처리:
  user_mission_participations INSERT
  recordFeedEvent: 'mission_joined'
```

### 9-2. 미션 취소 — 폐지 (Phase13)

- `DELETE /api/missions/[id]/join` **핸들러 제거**. 한번 참가하면 되돌릴 수 없다.
- 미션 상세 화면의 "참가 취소" 버튼·`handleCancel` 제거. 참가 버튼에 "참가 후에는 취소할 수 없어요" 안내 + confirm 문구 노출.
- (레거시) `mission_cancelled` 피드 이벤트 타입은 남아있으나 신규 기록 없음.

### 9-3. 미션 달성 체크 (Strava 동기화 후 자동 실행)

```
checkMissions(userId, newActivities):

1. 진행 중 미션 조회 (starts_at <= now <= ends_at)
2. 이미 완료한 미션 제외
3. 참가 게이트: participationSet.has(mission.id)인 미션만 평가·완료·보상
   → (버그 수정) 참가하지 않은 유저는 조건을 만족해도 완료·보상되지 않음

progress 계산 (evaluateMission → calculateProgress):
  distance:        activity_type 필터 후 누적 distanceKm
  activity_count:  해당 종목 활동 횟수
  poi_visit:       대상 POI 방문 시 1, 아니면 0 (달성형)
  item_collect:    대상 배지 보유 시 1, 아니면 0 (달성형)

  poi_visit/item_collect는 활동 배치만으로 판단 불가 → loadOwnership()으로
  user_activity_badges(triggered_by_poi_id, badge_id) + inventory_items(badge_id)
  를 미리 조회해 방문 POI / 보유 배지 집합을 만든다.

달성 판정: progress >= getTarget()
  distance=distance_km, count=count, poi_visit=1, item_collect=1

선착순: missions.max_completions IS NOT NULL & 완료자 수 >= max → skip

달성 시:
  user_mission_completions INSERT
  grantMissionRewards(userId, mission)  ← 보상 실지급 (9-6)
  recordFeedEvent: 'mission_completed' (결과 요약 + 실지급 보상 메타 포함)
```

- `evaluateMission()`는 DB 접근이 없는 순수 함수로 분리 — 참가 게이트·진행값·달성 판정을 담당하며 유닛 테스트(`src/lib/missions/__tests__/checker-logic.test.ts`, 8케이스) 대상.

### 9-4. 미션 타입

| mission_type | 조건 | 표시 | 구현 상태 |
|---|---|---|---|
| `distance` | 누적 이동 거리(km) | 진행 바 | ✅ 운영 중 |
| `activity_count` | 활동 횟수 | 진행 바 | ✅ 운영 중 |
| `poi_visit` | 대상 POI 방문 여부 | 달성/미달성 | ✅ Phase13 구현 |
| `item_collect` | 대상 배지 보유 여부 | 달성/미달성 | ✅ Phase13 구현 |

### 9-5. 미션 상황 (신규)

```
GET /api/missions/[id]/status  — 참가자 전용(미참가 403)

미션의 status_display_type에 따라 분기:

랭킹형(ranking):
  정렬 = isCompleted DESC, completedAt ASC, progressValue DESC
  rank 1..N 부여, visible_rank_count 만큼 slice
  me = 내 순위 (slice 밖이면 별도 포함)
  응답 { type:'ranking', entries[], me, totalParticipants }

달성형(achievement):
  달성자 우선(먼저 달성한 순), 순위 없음
  응답 { type:'achievement', entries[], me, totalParticipants }

username은 users 조인, NULL이면 '익명' 폴백.
```

- 화면: `src/app/(main)/missions/[id]/status/` (참가자만 진입, 미참가 시 상세로 리다이렉트). 랭킹형/달성형 레이아웃 분기, 내 항목 강조(N명 밖이면 하단 별도 표시).
- 미션 상세 화면에 참가/완료자에게만 "미션 상황 보기" 진입 메뉴 노출.

### 9-6. 보상 구성 · 지급 (신규 — reward_type 단일선택 폐기)

**데이터 모델 (`missions` 컬럼, 046 마이그레이션):**

| 컬럼 | 설명 |
|---|---|
| `reward_badge_ids UUID[]` | 복수 배지 보상(활동/아이템 무관). 기존 단일 `reward_id`는 배열로 이관 |
| `reward_points` | 미션 자체 포인트(선택, 배지 포인트와 별개) |
| `status_display_type` | `'ranking'`\|`'achievement'` (기본 ranking) |
| `visible_rank_count` | 상위 N명 노출(NULL=전체, 본인은 항상 표시) |
| `reward_type`/`reward_id` | **deprecated** — legacy 보존, 새 코드 미참조. `reward_type` NOT NULL 제거 |

**지급 로직 (`grantMissionRewards`, 완료 직후 호출):**

```
1. reward_badge_ids로 badges(id,name,type,point_reward) 조회
2. 타입별 분기:
   activity → user_activity_badges INSERT (triggered_by='mission_reward:{id}')
              이미 보유 시 조용히 skip
   item     → inventory 슬롯 확인 후 inventory_items INSERT (obtained_by='system_event')
              + inventory.used_slots +1. 이미 보유/슬롯부족이면 skip
3. 지급된 배지의 point_reward>0 → awardPoints(reason='badge_point_reward')
4. 미션 reward_points>0 → awardPoints(reason='mission_point_reward')  ← 별개 사유
5. 반환 { awardedBadgeIds, awardedBadgeNames, totalAwardedPoints }
```

- **버그 수정**: 기존 checker는 `reward_type==='points'`만 처리해 배지 보상이 실제로 발급된 적이 없었음 → `grantMissionRewards`로 배지·포인트 모두 실지급.
- 어드민 미션 폼(`MissionList.tsx`): 배지 **검색+복수선택**, 미션 포인트 입력, 표시 방식·공개 인원 필드 추가. "총 지급 포인트 미리보기"(미션 포인트 + 선택 배지들의 자동 포인트 합) 노출.

### 9-7. 피드 메타데이터 (`mission_completed` 확장)

```
FeedEventMeta['mission_completed'] = {
  mission_id, mission_title,
  reward_points,           // 실제 지급된 총 포인트(배지 포인트+미션 포인트), 없으면 null
  awarded_badge_ids[],     // 실제 지급된 배지 id
  awarded_badge_names[],   // 표시용 배지 이름
  final_progress_value,    // 완료 시점 진행값
  target_value             // 완료 당시 목표치 스냅샷
}
```

- 홈/프로필 피드 카드·바텀시트: 결과 요약(`final_progress_value / 목표 target_value`) + 보상 배지 이름 목록 + 지급 포인트 표시. 기존 `reward_type` 라벨 참조 제거.
