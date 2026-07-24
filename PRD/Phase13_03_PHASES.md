# JAM! Phase 13 구현 단계 — 미션 참가 확정 + 미션 상황

> 작성일: 2026-07-23

---

## Step A: 참가 필수화 버그 수정 + 참가 취소 제거

- `src/lib/missions/checker.ts`: `achieved` 판정 앞에 `if (!participationSet.has(mission.id)) continue` 추가
- `src/app/api/missions/[id]/join/route.ts`: `DELETE` 핸들러 제거
- `src/app/(main)/missions/[id]/MissionDetailClient.tsx`: "참가 취소" 버튼·`handleCancel` 제거, 참가 버튼에 "참가 후 취소할 수 없어요" 안내 추가
- 테스트: 미참가 유저가 조건 만족 활동을 해도 `user_mission_completions`에 안 쌓이는지 단위 테스트 (`checkMissions` 순수 로직 분리 가능하면 분리, 아니면 시나리오 테스트)

**완료 기준**: 참가 안 한 유저는 완료 처리 안 됨, 참가 취소 API/버튼 없음

## Step B: poi_visit / item_collect 진행률 구현

- `checker.ts`의 `calculateProgress`/`getTarget`에 `poi_visit`/`item_collect` 케이스 추가 (Phase13_02 §4)
- DB 조회 필요 (활동 배치만으로 불가) — `checkMissions` 내부에서 필요 시 `user_activity_badges`/`inventory_items` 조회
- `MissionDetailClient.tsx`: 두 타입은 진행 바 대신 "달성/미달성" 배지로 표시하도록 분기

**완료 기준**: poi_visit/item_collect 미션 참가 후 실제 방문/수집 시 완료 처리됨

## Step C: 미션 상황 데이터 모델 + API

- 마이그레이션: `missions.status_display_type`, `missions.visible_rank_count` 추가 (Phase13_02 §2)
- 신규 API `GET /api/missions/[id]/status`:
  - 인증 + 참가 여부 확인 (미참가 403)
  - `status_display_type`에 따라 랭킹형/달성형 응답 분기
  - 정렬 규칙 적용, `visible_rank_count` 자르기 + 본인 항상 포함

**완료 기준**: API가 스펙대로 응답 (curl/시뮬레이터로 검증)

## Step D: 미션 상황 UI + 어드민 폼

- 미션 상세(`MissionDetailClient.tsx`): 참가 중일 때만 "미션 상황" 메뉴 노출 → 신규 화면/모달로 이동
- 신규 화면: `src/app/(main)/missions/[id]/status/page.tsx` (또는 클라이언트 모달) — 랭킹형/달성형 레이아웃 분기, 내 순위 강조
- 어드민 (`src/app/admin/missions/MissionList.tsx`): `status_display_type`(select) + `visible_rank_count`(number, 빈값=전체) 폼 필드 추가

**완료 기준**: 참가자만 미션 상황 진입 가능, 랭킹형/달성형 화면 정상 렌더링, 어드민에서 신규 필드 저장됨

## Step E: 검증 + 문서

- `npx tsc --noEmit` 0 에러
- `PRD/badge/BADGE_ENGINE_UNIFIED.md`는 배지 로직 문서라 미션은 범위 밖 — 대신 `PRD/SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 신규 생성 (API·lib·마이그레이션·(main) 변경 해당)
- commit + push

---

## 확장 후보 (이번 범위 아님)

| 기능 | 시점 |
|------|------|
| 표시 방식 자동 판단 | 여러 미션 운영 후 패턴 파악되면 |
| 새 복합 미션 타입 (기간 내 POI 방문 횟수, 배지 발급 순서 등) | 유저가 언급한 시뮬레이션 이후 |
| 완료자 표시 방식 유형별 세분화 | 랭킹형 운영 데이터 쌓인 후 |
