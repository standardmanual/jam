# JAM! Phase 13 프로젝트 스펙 — 미션 참가 확정 + 미션 상황

> 작성일: 2026-07-23

---

## 1. 기술 스택 (기존 유지)

기존 미션 시스템(`src/lib/missions/`, `src/app/(main)/missions/`, `src/app/admin/missions/`) 패턴 그대로 확장. 신규 스택 도입 없음.

## 2. 파일 구성

```
[마이그레이션]
supabase/migrations/0XX_mission_status_display.sql   # status_display_type, visible_rank_count

[lib]
src/lib/missions/checker.ts        # 참가 게이트 추가 + poi_visit/item_collect 진행률 구현 (수정)
src/lib/missions/status.ts         # 랭킹/달성 조회·정렬 로직 (신규, API에서 재사용)

[API]
src/app/api/missions/[id]/join/route.ts      # DELETE 제거 (수정)
src/app/api/missions/[id]/status/route.ts    # 신규 GET

[서비스 UI]
src/app/(main)/missions/[id]/MissionDetailClient.tsx   # 취소버튼 제거, 미션상황 메뉴 추가, 달성형 표시 분기 (수정)
src/app/(main)/missions/[id]/status/page.tsx           # 신규 — 미션 상황 화면
src/app/(main)/missions/[id]/status/StatusClient.tsx   # 신규 — 랭킹형/달성형 렌더링

[어드민]
src/app/admin/missions/MissionList.tsx    # status_display_type·visible_rank_count 폼 필드 추가 (수정)
src/app/api/admin/missions/route.ts       # (필요 시) 신규 필드 저장 확인 — 이미 body 통째 insert라 별도 수정 불필요할 가능성 높음, 검증만
```

## 3. 구현 규칙

- **참가 게이트는 `checker.ts` 한 곳에서만** — 진행률 갱신과 완료 판정 둘 다 `participationSet.has(mission.id)` 체크 이후에만 실행.
- `poi_visit`/`item_collect` 진행률은 **0/1 정수**로 취급 — 소수점 없음, `getTarget()`도 1 고정.
- 미션 상황 API는 **참가자만 호출 가능** (403) — 미참가자에게 다른 유저들의 진행상황을 노출하지 않는다.
- `visible_rank_count`가 설정된 경우, 응답 목록은 그 수만큼 자르되 **요청자 본인은 항상 포함**(목록 안에 있으면 그대로, 없으면 `me` 필드로 별도 전달).
- 랭킹 정렬은 `checker.ts`가 이미 갖고 있는 완료 판정 로직과 일관되게 — 완료 여부·완료 시각을 `user_mission_completions`에서, 진행값은 `user_mission_participations.progress_value`에서 가져온다 (별도 캐시 테이블 만들지 않음).
- 어드민 폼의 `status_display_type` 기본값은 `mission_type`에 따라 추천값을 미리 선택해두되(`distance`/`activity_count` → ranking, `poi_visit`/`item_collect` → achievement), **강제하지 않는다** (관리자가 자유롭게 변경 가능).

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
- [ ] Step E: tsc 0 에러 + SERVICE_OPERATIONS 문서 + commit/push
