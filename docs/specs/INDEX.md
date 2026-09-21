---
type: index
description: docs/specs, jam-doc/planning, jam-doc/marketing 문서를 frontmatter description으로 모은 자동 생성 목록이다.
status: active
---

# 문서 색인

이 파일은 `node scripts/gen-doc-index.mjs`가 생성한다. 손으로 고치지 않는다. 문서를 추가·삭제하거나 description을 고치면 같은 명령을 다시 실행한다(pre-commit이 최신 여부를 검사한다).

## docs/specs/

- [DEV_PROCESS_GUARDRAILS.md](DEV_PROCESS_GUARDRAILS.md) — 핵심 루프에 손대기 전에 확인할 반복된 개발 프로세스 실수 패턴과 지켜야 할 규칙을 정리한 문서다.
- [DOCUMENT_SCHEMA.md](DOCUMENT_SCHEMA.md) — JAM! 문서의 type, frontmatter 필드, 연결 규칙, 태그 어휘를 정의하는 문서 체계 스키마다.
- [PRIVACY_POLICY.md](PRIVACY_POLICY.md) — 개인정보 처리방침 원고(서비스 /privacy 페이지의 출처 문서)
- [SERVER_ERROR_MESSAGE_RULE.md](SERVER_ERROR_MESSAGE_RULE.md) — 서버 API 에러 메시지는 i18n 딕셔너리를 단일 소스로 삼고, 클라이언트는 서버가 보낸 메시지를 그대로 노출한다
- [SERVICE_OPERATIONS.md](SERVICE_OPERATIONS.md) — Strava 동기화부터 배지 획득, 드랍, 미션, 피드, 어뷰징 방어, Cron, API, DB 테이블까지 서비스 운영 로직을 정리한 문서다.
- [SLOP_DICTIONARY.md](SLOP_DICTIONARY.md) — 글 슬롭의 금칙 단어와 표현, 대체 표현을 모으고 새로 발견한 표현을 직접 추가해 가는 사전이다.
- [UX_WRITING_GUIDELINE.md](UX_WRITING_GUIDELINE.md) — 화면 문구의 고정 용어, 톤, 문장 구조, 에러 대응, CTA, 네비게이션 규칙과 Anti-slop 판단 기준을 정의한 가이드라인이다.

## docs/specs/badge-engine/

- [BADGE_ENGINE_UNIFIED.md](badge-engine/BADGE_ENGINE_UNIFIED.md) — 액티비티배지 엔진과 아이템배지 드랍 엔진의 배지 획득·드랍 판정 로직과 두 엔진의 역할 분담을 정의한 통합 문서다.
- [CONDITION_JSON_SPEC.md](badge-engine/CONDITION_JSON_SPEC.md) — 배지 조건(`condition_json`)에 쓸 수 있는 모든 필드의 타입, 의미, 평가 방식을 정의한 단일 출처 문서다.

## docs/specs/prd/

- [01_PRD.md](prd/01_PRD.md) — 유저 모바일 웹의 제품 개요, 사용자, 핵심 기능과 구현 상태, 화면 구성, 성공 기준, 만들지 않는 것을 정의한 PRD다.
- [02_DATA_MODEL.md](prd/02_DATA_MODEL.md) — 유저 모바일 웹의 도메인별 테이블 구조와 관계, 원안 대비 변경 요약을 개념 수준으로 정리한 데이터 모델 문서다.
- [03_PHASES.md](prd/03_PHASES.md) — 티켓 기준으로 재구성한 시간순 개발 이력과 현재 구현 상태 요약을 담은 단계 문서다.
- [04_PROJECT_SPEC.md](prd/04_PROJECT_SPEC.md) — 기술 스택, 프로젝트 구조, 어드민 인증, Cron, 금지 사항, 환경변수, 핵심 비즈니스 규칙을 정리한 프로젝트 스펙이다.
- [2026-08-15 DESIGN_RENEWAL_SPEC.md](prd/2026-08-15%20DESIGN_RENEWAL_SPEC.md) — 서비스 UI 리뉴얼의 목표, 디자인 원칙, 시각 방향, 컴포넌트·레이아웃·UX 규칙과 변경 금지·필수 변경 항목을 정한 스펙이다.
- [README.md](prd/README.md) — PRD 폴더의 문서 구성, 읽는 시점, 주제별 PRD 하위 폴더, 과거 이력 자료를 안내하는 목차 문서다.

## docs/specs/prd/admin-ui/

- [ADMIN_PRD.md](prd/admin-ui/ADMIN_PRD.md) — 어드민의 배지·지점(POI)·컬렉션 관리, 시뮬레이터, 유저 조회 기능과 화면 구성, 기술 스펙을 정의한 어드민 PRD다.
- [CONDITION_PRECHECK_PRD.md](prd/admin-ui/CONDITION_PRECHECK_PRD.md) — 어드민이 배지·미션을 저장하기 전에 조건이 드랍엔진에서 어떻게 판정되는지 미리 계산해 보여 주는 기능의 PRD
- [PHASES.md](prd/admin-ui/PHASES.md) — 어드민 UI를 shadcn 디자인시스템으로 전환하는 단계별 범위, 의존성, 완료 기준과 완료 결과를 정리한 문서다.
- [README.md](prd/admin-ui/README.md) — 어드민 UI 리디자인 폴더의 문서 구성을 안내하고 현재 유효한 문서를 밝히는 목차 문서다.
- [REDESIGN.md](prd/admin-ui/REDESIGN.md) — 어드민을 shadcn/ui 디자인시스템으로 전환하는 원칙, 폴더 분리, 프리셋 값과 미리보기 예외를 정의한 PRD다.

## docs/specs/prd/analytics/

- [GA4_EVENTS.md](prd/analytics/GA4_EVENTS.md) — GA4 커스텀 이벤트의 연동 구조, staging·production 트래픽 분리, 이벤트별 트리거와 파라미터, 계측 위치를 정리한 명세다.

## docs/specs/prd/badge-share/

- [PRD.md](prd/badge-share/PRD.md) — 배지 상세 페이지에서 배지를 이미지로 만들어 공유하거나 기기에 저장하는 기능의 플로우와 플랫폼별 동작을 정의한 PRD다.

## docs/specs/prd/inventory/

- [PRD.md](prd/inventory/PRD.md) — 인벤토리가 가득 찼을 때 원인과 해결책을 안내하고 드랍 지도 화면(`/drops`)으로 이동시키는 상시 안내를 정의한 PRD다.

## docs/specs/prd/notification/

- [DATA_MODEL.md](prd/notification/DATA_MODEL.md) — 알림의 `notifications` 테이블과 `notification_type`, 읽음·묶음 모델, `group_key`, `payload` 스키마를 정의한 데이터 모델이다.
- [PRD.md](prd/notification/PRD.md) — 앱 안 알림(소식) 히스토리의 정체성, 설계 원칙, 소식 종류, 생성 트리거, 문구 강조 규칙, 화면을 정의한 PRD다.
- [RECAP_CASEBOOK.md](prd/notification/RECAP_CASEBOOK.md) — 한 번의 활동에서 나올 수 있는 보상 유형별 문구 사례와 문구 규칙을 모은 활동 결산 케이스북이다.
- [REST_CASEBOOK.md](prd/notification/REST_CASEBOOK.md) — 활동 결산을 제외한 소식의 문구 사례와 묶음 문구, 문구 규칙을 모은 확정판 케이스북이다.

## docs/specs/prd/point-system/

- [INTERACTION_FLOW.md](prd/point-system/INTERACTION_FLOW.md) — 포인트 시스템 1a단계에서 유저와 어드민이 어느 화면에서 무엇을 하고 어디로 이동하는지 정리한 화면 흐름 문서다.
- [OBJECT_MODEL.md](prd/point-system/OBJECT_MODEL.md) — 포인트 지갑(PointWallet), 내역(PointTransaction), 발행 장부(PointTreasury)와 적립 규칙을 정의한 포인트 시스템 객체 모델이다.

## docs/specs/prd/ranking-board/

- [OBJECT_MODEL.md](prd/ranking-board/OBJECT_MODEL.md) — 미션에서 분리된 독립 랭킹 엔티티 `ranking_modes`의 대상·지표 필드와 정렬 지표 규칙을 정리한 랭킹 객체 모델이다.

## jam-doc/marketing/

- [마케팅_플레이북.md](../../jam-doc/marketing/마케팅_플레이북.md) — 브랜드·프로모션·팝업·콜라보 사례를 JAM! 기능에 대입한 사례 카드를 모으고 대입 패턴과 주의 사항을 정리하는 문서다.
- [브랜드_보이스_가이드.md](../../jam-doc/marketing/브랜드_보이스_가이드.md) — 마케팅 채널(뉴스레터, 홈피드, 캠페인)의 목소리 원칙, 상황별 톤, 금칙 사항을 정리한 초안이다.
- [트렌드_노트.md](../../jam-doc/marketing/트렌드_노트.md) — 액티비티 씬의 유행과 밈, 시즌 소재, 수집·게임화 사례를 월별로 모아 소재 카드와 관찰, 분기 회고로 쌓는 문서다.

## jam-doc/planning/business-plan/

- [00 JAM! 비즈니스 개념.md](../../jam-doc/planning/business-plan/00%20JAM!%20비즈니스%20개념.md) — JAM!의 초기 비즈니스 개념 분석: 서비스 철학과 구조, 핵심 기능 구상, 수익화 구조, 확장과 리스크 대응
- [01 JAM! 철학.md](../../jam-doc/planning/business-plan/01%20JAM!%20철학.md) — JAM!의 서비스 철학을 이슈별 원칙(자체 트래커 미제공, 자립형 성장, 트라이브 기반 배지 생태계)으로 정리한 문서
- [02 JAM! 서비스 플랜.md](../../jam-doc/planning/business-plan/02%20JAM!%20서비스%20플랜.md) — 브랜드와 비전, 타깃, 비즈니스 모델, 게임 경제, 향후 업그레이드 아젠다를 담은 현행 서비스 플랜
- [03 JAM! 배지 철학 및 시스템 구조.md](../../jam-doc/planning/business-plan/03%20JAM!%20배지%20철학%20및%20시스템%20구조.md) — JAM! 배지의 철학, 액티비티배지·아이템배지 분류, 일련번호·드랍·픽업 메커니즘, 유저 수준별 리텐션 접근을 정의한다.
- [04 JAM! 트라이브.md](../../jam-doc/planning/business-plan/04%20JAM!%20트라이브.md) — JAM! 유니버스의 프롤로그, 트라이브별 캐치프레이즈와 서사, 크로스오버 에필로그 한 단락을 담은 설정 원문이다.
- [05 JAM! 활동 배지 체계 재설계 분석.md](../../jam-doc/planning/business-plan/05%20JAM!%20활동%20배지%20체계%20재설계%20분석.md) — 현행 걷기 배지 구조의 소진 문제를 진단하고 재설계 원칙을 정리한 분석 메모다.

## jam-doc/planning/content/

- [ACTIVITY_BADGES.md](../../jam-doc/planning/content/ACTIVITY_BADGES.md) — v5 액티비티배지의 조건·설명과 설계 원칙, 시딩하지 않은 항목, 발급되지 않는 항목을 정리한 목록이다(정본은 DB).
- [COMBINE_RECIPES.md](../../jam-doc/planning/content/COMBINE_RECIPES.md) — 믹스 결과의 두 갈래, 레시피 슬롯 구조, 실패 처리, 등록 레시피 현황과 카탈로그 공백을 정리한 정책 문서다.
- [POI.md](../../jam-doc/planning/content/POI.md) — 지점(POI)의 데이터 소스, 티어 구조, 신규 등록 정책과 채워야 할 항목을 모은 컨텐츠 관리 문서다.
- [TRIBES.md](../../jam-doc/planning/content/TRIBES.md) — 세계관 트라이브의 캐치프레이즈·컬렉션·아이템배지와 예외 트라이브 JAM! 레벨 0, 인접 그래프, 데이터 소스를 정리한 목록이다.
- [v5_badge_name_split.md](../../jam-doc/planning/content/v5_badge_name_split.md) — v5 액티비티배지에서 종목마다 계열 이름을 다르게 짓는 이름 분화의 근거, 후보안, 승인 후 검증 결과를 기록한 문서다.

## jam-doc/planning/content/tribes-history/

- [README.md](../../jam-doc/planning/content/tribes-history/README.md) — 드랍 확률에 쓰이는 트라이브 설정을 크게 바꾸기 전에 스냅샷 사본을 남기는 폴더의 용도, 명명 규칙, pre-commit 예외를 안내한다.
