# 팀 작업 계획

- 팀명: kkirikkiri-dev-0723-phase12-points
- 목표: JAM! 잼 포인트 시스템 1a단계 개발 (기존 JAM! 서비스 코드베이스에 기능 추가)
- 생성 시각: 2026-07-23

## 기준 문서 (반드시 읽을 것, 이 순서로)
1. `PRD/Phase12_01_PRD.md` — 배경·확정 결정사항·비범위·완료 기준
2. `PRD/Phase12_02_DATA_MODEL.md` — 테이블 3개 + `badges.point_reward` + `award_points()` RPC 전체 SQL
3. `PRD/Phase12_03_PHASES.md` — Step A→B→C→D 순서와 각 완료 기준 (반드시 이 순서 준수, 건너뛰기 금지)
4. `PRD/Phase12_04_PROJECT_SPEC.md` — 파일 구성, 구현 규칙, 절대 하지 마 목록
5. `PRD/POINT_SYSTEM_OBJECT_MODEL.md` — 개념 모델(왜 이렇게 설계했는지 근거)
6. `PRD/POINT_SYSTEM_INTERACTION_FLOW.md` — 화면 흐름(브레드보드)

## 팀 구성
| 역할 | 담당 업무 |
|------|----------|
| 팀장 | Phase12_03의 Step A→B→C→D를 순서대로 배분, 코드 리뷰, 통합 판단. 직접 코드 작성 금지 |
| 핵심 개발(백엔드) | Step A(마이그레이션 045 + award_points RPC + src/lib/points/) + Step B(배지·드랍·미션 3개 지점 적립 연동) |
| 화면 개발 | Step C(유저 화면) + Step D(어드민 화면) — Step B 완료 후 착수 |
| 테스터 | `awardPoints()` 단위 테스트 + 잔액·원장 정합성 시나리오 테스트, `npx tsc --noEmit` 검증 |

## 태스크 목록 (TaskCreate로 동일하게 생성됨)
- [ ] Step A: 스키마(045) + award_points RPC + points 헬퍼
- [ ] Step B: 배지/드랍/미션 적립 연동 + 피드 메타 확장
- [ ] Step C: 유저 화면(내 프로필 잔액, 포인트 내역, 배지 상세 안내)
- [ ] Step D: 어드민 화면(/admin/points, 유저 지급/회수 양쪽 배치, 배지·미션 에디터 확장)
- [ ] 테스트: 단위 테스트 + tsc 0 에러 확인
- [ ] 최종 통합 검증 + SERVICE_OPERATIONS 문서 생성 + commit

## 주요 결정사항
(팀장이 진행 중 결정할 때마다 여기 기록)

## 이전 세션에서 이어받은 유용한 정보
같은 코드베이스(jam-web)에서 작업한 이전 팀(Phase10 유저검색)의 발견 사항 중 이번에도 유효한 것 — 상세는 TEAM_FINDINGS.md "코드베이스 공통 패턴" 섹션 참고:
- 인증/서비스롤 패턴, supabase select 타입 캐스팅 컨벤션, PostgREST `.or()` 필터 이스케이프 주의사항
