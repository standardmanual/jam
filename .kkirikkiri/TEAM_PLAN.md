# 팀 작업 계획

- 팀명: kkirikkiri-dev-phase13-mission
- 목표: JAM! Phase13 — 미션 참가 확정 + 미션 상황(랭킹/달성) + 보상 구성(배지 복수선택+포인트) 실제 구현. PRD의 Step A~F 전체, 테스트 포함.
- 생성 시각: 2026-07-24
- 참고 PRD: PRD/Phase13_01_PRD.md, PRD/Phase13_02_DATA_MODEL.md, PRD/Phase13_03_PHASES.md, PRD/Phase13_05_MISSION_SAMPLES.md

## 팀 구성 (Agent Teams 인프라 없음 — Agent+SendMessage로 대체)
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| phase13-lead | 팀장 겸 실행 | Opus | Step A~F 전체 순차 실행, 필요 시 독립 파일 작업(Step D UI, 테스트)만 하위 에이전트로 병렬 위임, tsc 검증, SERVICE_OPERATIONS 문서 생성, commit+push |

## 중요 제약
- checker.ts / rewards.ts / missions 마이그레이션은 Step A→B→C→E 순서로 동일 파일을 반복 수정하므로 **반드시 순차 처리** (병렬 스폰 금지)
- Step D(UI)와 Step E의 어드민 폼(MissionList.tsx)은 Step C API/마이그레이션 완료 후에는 서로 다른 파일이라 병렬 위임 가능
- CLAUDE.md 규칙: 서비스 로직(lib/api/migrations/(main)) 변경 커밋 시 PRD/SERVICE_OPERATIONS_YYYYMMDD_HHMM.md 신규 생성 필수, 기존 파일 수정 금지
- 코드 변경 후 항상 commit + git push origin main

## 태스크 목록
- [x] Step A: 참가 필수화 버그 수정 + 참가취소 제거 + 단위테스트
- [x] Step B: poi_visit/item_collect 진행률 구현
- [x] Step C: 마이그레이션(status_display_type/visible_rank_count/reward_badge_ids) + GET /api/missions/[id]/status
- [x] Step D: 미션 상황 UI + 어드민 폼(표시타입/rank count)
- [x] Step E: rewards.ts 신규 + checker.ts 연동 + 어드민 다중선택 배지 UI + 피드 메타데이터/렌더링 확장
- [x] Step F: tsc --noEmit 검증 + SERVICE_OPERATIONS 문서 생성 + commit + push

## 주요 결정사항
- (팀장이 결정할 때마다 기록)
