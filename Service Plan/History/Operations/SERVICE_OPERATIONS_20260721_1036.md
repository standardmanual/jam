# JAM! 서비스 운영 문서 — 변경분 (2026-07-21 10:36)

> **이 버전의 변경 내용:** 어드민 유저 초기화 강화 — 싱크 이력(last_synced_at)·드랍상태(user_drop_state)·아이템북 완성 기록까지 초기화, 스트라바 연동은 유지  
> 이전 버전: SERVICE_OPERATIONS_20260721_1017.md

---

## [변경] 어드민 유저 초기화 (`POST /api/admin/users/[id]/reset`)

### 목적

시뮬레이터 반복 테스트: 초기화 후 다음 Strava 싱크가 **최초 연동과 동일하게** 과거 활동 전체를 다시 불러오도록 한다. 연동(토큰) 자체는 유지되어 재연동 절차 불필요.

### 초기화 범위 (변경 후)

| 대상 | 처리 |
|------|------|
| user_activity_badges / inventory_items / 피드 / POI드랍 / 미션 / 팔로우 | 삭제 (기존과 동일) |
| **user_drop_state** | 삭제 (신규) — 드랍엔진 v2 모멘텀·pity·복귀 판정 초기화 |
| **user_item_book_completions** | 삭제 (신규) — 아이템북 완성 기록 초기화 |
| user_item_book_slots | inventory_items ON DELETE CASCADE로 자동 정리 |
| **strava_connections.last_synced_at** | NULL (신규) — 싱크 커서 리셋 → 전체 이력 재수집 |
| **strava_connections.backfill_completed** | false (신규) |
| users.initial_sync_done | false (기존) — 첫싱크 게이트(Common 전용) 재작동 |
| users 계정 / strava_connections 행(토큰) | **유지** |

### 운영 유의사항

- 초기화 직후 싱크는 첫싱크로 취급: 액티비티배지는 Common만, 아이템 드랍은 온보딩 규칙(작심삼일+종목 세계관) 적용.
- user_drop_state가 남아 있으면 초기화 후 첫 싱크가 "7일+ 복귀"로 오판될 수 있었음 — 삭제로 해결.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260721_1017.md)과 동일.
