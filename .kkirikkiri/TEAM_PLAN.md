# 팀 작업 계획

- 팀명: kkirikkiri-dev-phase8-itembook
- 목표: Phase 8 — 아이템북 완성 루프 구현
- 생성 시각: 2026-07-10

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| jam-lead | 팀장 | Opus | 아키텍처 설계, 태스크 배분, 코드 리뷰, 최종 통합 |
| jam-dev1 | 개발자 1 | Opus | 핵심 로직: 완성 감지 엔진 + 보상 발급 API + Strava 파이프라인 연결 |
| jam-dev2 | 개발자 2 | Opus | UI: 완성 배지마크 + 알림 컴포넌트 + 아이템북 상세 페이지 완성 표시 |
| jam-tester | 테스터 | Sonnet | 완성 감지 로직 테스트 + API 엔드포인트 테스트 코드 작성 |

## Phase 8 요구사항 (PRD 기준)
1. **아이템북 완성 감지**: 인벤토리에 required_item_badge_ids + required_activity_badge_id가 모두 갖춰지면 자동 감지
2. **완성 시 보상 발급**: reward_badge_id가 있으면 user_activity_badges에 자동 INSERT
3. **완성 알림**: "아이템북 완성! 보상 배지를 획득했어요" 화면 내 알림 (토스트 or 배너)
4. **완성 UI**: 아이템북 상세 페이지(/itembooks/[id])에서 완성 상태 표시
5. **Strava 동기화 시 트리거**: badge-engine 실행 직후 아이템북 완성 체크 파이프라인 추가

## 핵심 데이터 구조 (기존 코드 기준)
- `item_books` 테이블: id, required_activity_badge_id, required_item_badge_ids (UUID[]), reward_badge_id
- `user_activity_badges`: 액티비티 배지 보유 여부
- `inventory_items`: 인벤토리 아이템 (badge_id 컬럼)
- badge-engine: `/jam-web/src/lib/badge-engine/index.ts`
- 아이템북 상세: `/jam-web/src/app/(main)/itembooks/[id]/page.tsx` (이미 존재)

## 태스크 목록
- [ ] T1: 코드베이스 스캔 + 완성 감지 엔진 설계 → jam-lead
- [ ] T2: `src/lib/itembook/completion.ts` — 완성 감지 함수 구현 → jam-dev1
- [ ] T3: `POST /api/itembooks/[id]/complete` API 또는 서버사이드 트리거 → jam-dev1
- [ ] T4: badge-engine 에 완성 체크 파이프라인 연결 → jam-dev1
- [ ] T5: 아이템북 상세 페이지 완성 배너 + 알림 UI → jam-dev2
- [ ] T6: 완성 감지 로직 테스트 코드 작성 → jam-tester
- [ ] T7: 최종 통합 + TypeScript 체크 + 커밋 → jam-lead

## 주요 결정사항
(팀장이 결정할 때마다 여기에 기록)
