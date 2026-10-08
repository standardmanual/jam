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
- [LOCATION_TERMS.md](LOCATION_TERMS.md) — 위치기반서비스 이용약관 원고. `/location-terms` 페이지로 게시했으며 시행일은 2026년 10월 1일이다. 실제 위치정보 처리 흐름을 근거로 작성했다
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

## docs/specs/prd/asset-generator/

- [HOME_FEED_REGISTRATION_BUNDLE.md](prd/asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md) — 에셋 제너레이터 자동 경로(윤진)가 만드는 홈피드 카드 등록 묶음(bundle.json)의 필드·검증 규칙·실행 절차와 등록 기록·되돌림 방식의 정본이다.
- [MISSION_REGISTRATION_BUNDLE.md](prd/asset-generator/MISSION_REGISTRATION_BUNDLE.md) — 에셋 제너레이터 자동 경로(윤진)가 만드는 미션 등록 묶음(bundle.json)의 필드·검증 규칙·실행 절차와 등록 기록·되돌림 방식의 정본이다.
- [PRD.md](prd/asset-generator/PRD.md) — JAM! 에셋 제너레이터를 어드민 디자인 도구로 확장해 배지·미션·컬렉션·홈피드 대표 이미지를 수동·자동(윤진) 두 경로로 만들고 적용하는 스펙 정본이다.
- [REGISTRATION_BUNDLE.md](prd/asset-generator/REGISTRATION_BUNDLE.md) — 에셋 제너레이터 자동 경로(윤진)가 만드는 배지 등록 묶음(bundle.json)의 필드·검증 규칙·실행 절차와 등록 기록·되돌림 방식의 정본이다.

## docs/specs/prd/badge-share/

- [PRD.md](prd/badge-share/PRD.md) — 배지 상세 페이지에서 배지를 이미지로 만들어 공유하거나 기기에 저장하는 기능의 플로우와 플랫폼별 동작을 정의한 PRD다.

## docs/specs/prd/content-automation/

- [PRD.md](prd/content-automation/PRD.md) — 정식 오픈 후 홈피드·배지·미션 운영을 자동화하는 6층 파이프라인(입력·세그먼트·생성·제안승인·전략변경안·유형리뷰)의 스펙 정본이다.

## docs/specs/prd/home-feed/

- [PRD.md](prd/home-feed/PRD.md) — 홈피드(홈 「투데이」) 화면 구성·카드 노출 규칙·노출 태그·템플릿·카드 모양·레이아웃·이동 목적지·기사 상세·계측을 코드 기준으로 정의하는 정본이다.

## docs/specs/prd/inventory/

- [PRD.md](prd/inventory/PRD.md) — 인벤토리가 가득 찼을 때 원인과 해결책을 안내하고 드랍 지도 화면(`/drops`)으로 이동시키는 상시 안내를 정의한 PRD다.

## docs/specs/prd/notification/

- [DATA_MODEL.md](prd/notification/DATA_MODEL.md) — 알림의 `notifications` 테이블과 `notification_type`, 읽음·묶음 모델, `group_key`, `payload` 스키마를 정의한 데이터 모델이다.
- [PRD.md](prd/notification/PRD.md) — 앱 안 알림(소식) 히스토리의 정체성, 설계 원칙, 소식 종류, 생성 트리거, 문구 강조 규칙, 화면을 정의한 PRD다.
- [RECAP_CASEBOOK.md](prd/notification/RECAP_CASEBOOK.md) — 한 번의 활동에서 나올 수 있는 보상 유형별 문구 사례와 문구 규칙을 모은 활동 결산 케이스북이다.
- [REST_CASEBOOK.md](prd/notification/REST_CASEBOOK.md) — 활동 결산을 제외한 소식의 문구 사례와 묶음 문구, 문구 규칙을 모은 확정판 케이스북이다.

## docs/specs/prd/ops-tool/

- [PRD.md](prd/ops-tool/PRD.md) — 에이전트가 제출한 운영 묶음을 사용자가 어드민에서 보고 고치고 승인하면 예약 공개하고 모든 결정을 기록하는 어드민 운영툴의 스펙이다. 07 라이브 운영 블루프린트 4절을 개발 단위로 옮겼다.

## docs/specs/prd/point-system/

- [INTERACTION_FLOW.md](prd/point-system/INTERACTION_FLOW.md) — 포인트 시스템 1a단계에서 유저와 어드민이 어느 화면에서 무엇을 하고 어디로 이동하는지 정리한 화면 흐름 문서다.
- [OBJECT_MODEL.md](prd/point-system/OBJECT_MODEL.md) — 포인트 지갑(PointWallet), 내역(PointTransaction), 발행 장부(PointTreasury)와 적립 규칙을 정의한 포인트 시스템 객체 모델이다.

## docs/specs/prd/ranking-board/

- [OBJECT_MODEL.md](prd/ranking-board/OBJECT_MODEL.md) — 미션에서 분리된 독립 랭킹 엔티티 `ranking_modes`의 대상·지표 필드와 정렬 지표 규칙을 정리한 랭킹 객체 모델이다.

## jam-doc/marketing/

- [마케팅_플레이북.md](../../jam-doc/marketing/마케팅_플레이북.md) — 브랜드·프로모션·팝업·콜라보 사례를 JAM! 기능에 대입한 사례 카드를 모으고 대입 패턴과 주의 사항을 정리하는 문서다.
- [브랜드_보이스_가이드.md](../../jam-doc/marketing/브랜드_보이스_가이드.md) — 마케팅 채널(뉴스레터, 홈피드, 캠페인)의 목소리 원칙, 상황별 톤, 금칙 사항을 정리한 초안이다.
- [콘텐츠_기획_레퍼런스.md](../../jam-doc/marketing/콘텐츠_기획_레퍼런스.md) — 외부 마케팅 글에서 뽑은 콘텐츠 기획 원칙을 JAM!에 대입한 표다. 윤진이 캠페인·카피·시즌·홈피드 작업 전에 읽는다.
- [트렌드_노트.md](../../jam-doc/marketing/트렌드_노트.md) — 액티비티 씬의 유행과 밈, 시즌 소재, 수집·게임화 사례를 월별로 모아 소재 카드와 관찰, 분기 회고로 쌓는 문서다.

## jam-doc/planning/business-plan/

- [00 JAM! 비즈니스 개념.md](../../jam-doc/planning/business-plan/00%20JAM!%20비즈니스%20개념.md) — JAM!의 초기 비즈니스 개념 분석: 서비스 철학과 구조, 핵심 기능 구상, 수익화 구조, 확장과 리스크 대응
- [01 JAM! 철학.md](../../jam-doc/planning/business-plan/01%20JAM!%20철학.md) — JAM!의 서비스 철학을 이슈별 원칙(자체 트래커 미제공, 자립형 성장, 트라이브 기반 배지 생태계)으로 정리한 문서
- [02 JAM! 서비스 플랜.md](../../jam-doc/planning/business-plan/02%20JAM!%20서비스%20플랜.md) — 브랜드와 비전, 타깃, 비즈니스 모델, 게임 경제, 향후 업그레이드 아젠다를 담은 현행 서비스 플랜
- [03 JAM! 배지 철학 및 시스템 구조.md](../../jam-doc/planning/business-plan/03%20JAM!%20배지%20철학%20및%20시스템%20구조.md) — JAM! 배지의 철학, 액티비티배지·아이템배지 분류, 일련번호·드랍·픽업 메커니즘, 유저 수준별 리텐션 접근을 정의한다.
- [04 JAM! 트라이브.md](../../jam-doc/planning/business-plan/04%20JAM!%20트라이브.md) — JAM! 유니버스의 프롤로그, 트라이브별 캐치프레이즈와 서사, 크로스오버 에필로그 한 단락을 담은 설정 원문이다.
- [05 JAM! 활동 배지 체계 재설계 분석.md](../../jam-doc/planning/business-plan/05%20JAM!%20활동%20배지%20체계%20재설계%20분석.md) — 현행 걷기 배지 구조의 소진 문제를 진단하고 재설계 원칙을 정리한 분석 메모다.
- [06 JAM! 라이브 운영 플랜.md](../../jam-doc/planning/business-plan/06%20JAM!%20라이브%20운영%20플랜.md) — 유저 락인 → 컬렉션 런칭 → 브랜드 협업·수익화로 이어지는 라이브 운영 방향을 사용자와 대화로 정리한 과정 기록. 1단계는 종료됐고 설계 정본은 07 블루프린트이며, 이 문서는 런칭 세션과 패턴 원고의 재료다
- [07 JAM! 라이브 운영 블루프린트.md](../../jam-doc/planning/business-plan/07%20JAM!%20라이브%20운영%20블루프린트.md) — 에이전트가 정기 루틴으로 운영을 기획하고 사용자가 어드민 운영툴에서 결정·실행하는 라이브 운영 체계의 설계도. 승인 뒤 우선순위를 정해 개발한다
- [08 JAM! 액티비티 배지 재구상 노트.md](../../jam-doc/planning/business-plan/08%20JAM!%20액티비티%20배지%20재구상%20노트.md) — 종목·거리 중심의 액티비티 배지를 활성에너지·원정·트라이브 관계 중심의 루프로 다시 구상한 대화 기록과 트라이브 재검토 브리프다. 구상 단계이며 서비스에 반영하지 않는다.
- [09 JAM! 서비스 재설계 진행 노트.md](../../jam-doc/planning/business-plan/09%20JAM!%20서비스%20재설계%20진행%20노트.md) — 액티비티 배지·트라이브 재구상을 새 서비스 정책으로 옮기는 진행 계획과 결정 기록. 새 세션은 이 문서에서 시작한다. 서비스에 반영하지 않는다.

## jam-doc/planning/business-plan/service-redesign/

- [01 공통 용어.md](../../jam-doc/planning/business-plan/service-redesign/01%20공통%20용어.md) — 서비스 재설계 주제 1 정책(사용자 확인). 트라이브와 상관없이 함께 쓰는 기능 이름(에너지, 틴케이스, 잠긴 아이템 배지, 챕터, 등급, 퀘스트)과 배지 이름의 띄어쓰기, 쓰지 않는 말을 정한다.
- [02 활동 평가와 에너지.md](../../jam-doc/planning/business-plan/service-redesign/02%20활동%20평가와%20에너지.md) — 서비스 재설계 주제 2 정책(사용자 확인). 어떤 활동을 인정하는지, 종목마다 강도를 어떻게 매기는지, 에너지를 어떻게 계산하고 쌓고 보여 주는지, 어뷰징을 어떻게 거르는지 정한다.
- [03 배지 획득 조건.md](../../jam-doc/planning/business-plan/service-redesign/03%20배지%20획득%20조건.md) — 서비스 재설계 주제 3 정책(사용자 확인). 액티비티 배지와 미션에 쓰는 배지 획득 조건(시간대, 날씨, 계절, 종목, 지점, 동네, 운동 속성 등)의 종류와 정의, 운동 속성의 정성적 기준, 쓰는 곳과 쓰지 않는 곳, 판정에 쓰는 데이터를 정한다.
- [04 트라이브, 출신, 레벨.md](../../jam-doc/planning/business-plan/service-redesign/04%20트라이브,%20출신,%20레벨.md) — 서비스 재설계 주제 4 정책(사용자 확인). 트라이브를 고르는 시점과 화면, 바꿀 수 없다는 원칙과 어드민 변경, 트라이브가 유저에게 주는 것, 챕터(유저의 레벨)의 기본 규칙을 정한다.
- [05 틴케이스.md](../../jam-doc/planning/business-plan/service-redesign/05%20틴케이스.md) — 서비스 재설계 주제 5 정책(사용자 확인). 에너지를 채워 열면 아이템 배지가 나오는 틴케이스의 개수와 자리, 채우는 방법, 채워야 하는 양, 여는 방법과 보상, 표시와 기록을 정한다.
- [06 잠긴 아이템 배지.md](../../jam-doc/planning/business-plan/service-redesign/06%20잠긴%20아이템%20배지.md) — 서비스 재설계 주제 6 정책(사용자 확인). 아이템 배지가 잠기는 경우, 잠긴 동안 할 수 있는 것과 없는 것, 열기 전에 보여 주는 것, 여는 데 필요한 양, 채우고 여는 방법, 드랍과 픽업, 틴케이스와 다른 점을 정한다.
- [07 아이템 배지 발급.md](../../jam-doc/planning/business-plan/service-redesign/07%20아이템%20배지%20발급.md) — 서비스 재설계 주제 7 정책(사용자 확인). 아이템 배지를 얻는 경로별 트라이브와 잠김, 지금 드랍 엔진 규칙의 정리, 동기화로 받는 아이템 배지의 대상 활동, 일련번호, 인벤토리가 가득 찼을 때 받지 않은 상태로 두는 처리, 공개 기간과 기한을 정한다.
- [08 컬렉션, 믹스, 드랍과 픽업.md](../../jam-doc/planning/business-plan/service-redesign/08%20컬렉션,%20믹스,%20드랍과%20픽업.md) — 서비스 재설계 주제 8 정책(사용자 확인). 컬렉션을 보여 주는 기준과 다른 트라이브 컬렉션의 완성, 장착과 완성, 트라이브를 넘는 믹스 레시피와 믹스 결과, 잠긴 아이템 배지를 포함한 드랍과 픽업, 시스템 드랍에 다른 트라이브를 섞는 방법을 정한다.
- [09 액티비티 배지와 체크인 배지.md](../../jam-doc/planning/business-plan/service-redesign/09%20액티비티%20배지와%20체크인%20배지.md) — 서비스 재설계 주제 9 정책(사용자 확인). 새 액티비티 배지 트리의 가지, 배지의 종류와 등급, 누적과 연속 조건, 조건 표기와 트라이브 서사, 밤과 궂은 날씨 배지의 표시, 에너지와 챕터를 조건으로 쓰는 배지, 포인트와 공개 기간과 기한, 방문 횟수로 등급이 오르는 체크인 배지를 정한다.
- [10 미션.md](../../jam-doc/planning/business-plan/service-redesign/10%20미션.md) — 서비스 재설계 주제 10 정책(사용자 확인). 트라이브 미션과 공통 미션, 참가 범위, 트라이브 제한, 미션의 틀과 조건, 기간과 순위, 보상, 게이트 미션, 그대로 두는 지금 규칙을 정한다.
- [11 포인트.md](../../jam-doc/planning/business-plan/service-redesign/11%20포인트.md) — 서비스 재설계 주제 11 정책(사용자 확인). 포인트를 주는 곳과 붙이지 않는 곳, 에너지와의 관계, 쓰는 곳(지금은 없음)과 앞으로의 활용처, 돈으로 파는지, 표시와 기록을 정한다.
- [12 연동 소스.md](../../jam-doc/planning/business-plan/service-redesign/12%20연동%20소스.md) — 서비스 재설계 주제 12 정책(사용자 확인). 연동 소스를 Strava 하나로 두는 원칙, 동기화 방식과 첫 동기화, 같은 Strava 계정을 다른 JAM 계정에 연결할 때의 안내와 처리, Strava 연결 끊기를 정한다.
- [13 온보딩과 기존 유저·데이터.md](../../jam-doc/planning/business-plan/service-redesign/13%20온보딩과%20기존%20유저·데이터.md) — 서비스 재설계 주제 13 정책(사용자 확인). 새 체계로 바꾸는 순서, 온보딩 순서와 트라이브 고르기, 첫 챕터를 주는 퀘스트의 구성과 보상, 계정 삭제 기능과 지운 계정의 기록 처리, 정식 오픈 전 테스트 유저 정리를 정한다.
- [14 안전과 윤리.md](../../jam-doc/planning/business-plan/service-redesign/14%20안전과%20윤리.md) — 서비스 재설계 주제 14 정책(사용자 확인). 만 14세 이상 유저를 위한 원칙, 밤과 궂은 날씨 조건의 보호 장치(액티비티 배지와 미션), 금지 소재, 확률 공개, 뽑기를 부추기지 않는 연출, 유료 아이템, 개인정보와 위치정보를 정한다.
- [17 챕터.md](../../jam-doc/planning/business-plan/service-redesign/17%20챕터.md) — 서비스 재설계 주제 17 정책(사용자 확인). 유저의 단계인 챕터의 수, 오르는 방법의 원칙, 챕터마다 달라지는 것, 트라이브별 이름, 보여 주는 방식, 순위를 두지 않는 원칙을 정한다.
- [20 어뷰징과 밴.md](../../jam-doc/planning/business-plan/service-redesign/20%20어뷰징과%20밴.md) — 서비스 재설계 주제 20 정책(사용자 확인). 어뷰징을 거르는 필터와 기준값, 제재를 이용 정지 하나로 두는 원칙과 그 순서(알림, 진행 멈춤, 정지, 고객센터 소통), 자동 감지 때의 처리, 여러 계정으로 아이템 배지를 모으는 경우를 정한다.
- [README.md](../../jam-doc/planning/business-plan/service-redesign/README.md) — 서비스 재설계 2단계(정책 다시 세우기)의 주제별 정책 초안 안내. 폴더 규칙, 주제 목록, 사용자 확인 상태를 둔다.

## jam-doc/planning/business-plan/tribe-rethink/

- [01 미식.md](../../jam-doc/planning/business-plan/tribe-rethink/01%20미식.md) — 구상 단계 미식 트라이브 '한입만 연구회'의 시놉시스, 인물, 장소, 아이템. 서비스에 반영하지 않는다.
- [02 사진.md](../../jam-doc/planning/business-plan/tribe-rethink/02%20사진.md) — 구상 단계 사진 트라이브 '찰칵단'의 시놉시스, 인물, 장소, 아이템. 서비스에 반영하지 않는다.
- [03 음악.md](../../jam-doc/planning/business-plan/tribe-rethink/03%20음악.md) — 구상 단계 음악 트라이브 '비사이드 레코즈'의 시놉시스, 인물, 장소, 아이템. 서비스에 반영하지 않는다.
- [04 물건 덕후.md](../../jam-doc/planning/business-plan/tribe-rethink/04%20물건%20덕후.md) — 구상 단계 물건 덕후·맥시멀리스트 트라이브 '소나무 잡화점'의 시놉시스, 인물, 장소, 아이템. 서비스에 반영하지 않는다.
- [05 내향인.md](../../jam-doc/planning/business-plan/tribe-rethink/05%20내향인.md) — 구상 단계 내향인 트라이브 '혼자들'의 시놉시스, 인물, 장소, 아이템. 서비스에 반영하지 않는다.
- [README.md](../../jam-doc/planning/business-plan/tribe-rethink/README.md) — 구상 단계 트라이브 다섯 개의 문서 안내. 트라이브 목록, 서로 이어지는 단서, 공통 작성 규칙과 문서 형식을 둔다.
- [적용 전 검토 노트.md](../../jam-doc/planning/business-plan/tribe-rethink/적용%20전%20검토%20노트.md) — 다섯 트라이브 서사를 서비스에 적용하기 전에 고려할 이슈, 적용 단계, 결정 질문을 정리한 검토 기록. 서비스에 반영하지 않는다.
- [컨텐츠 분석 노트.md](../../jam-doc/planning/business-plan/tribe-rethink/컨텐츠%20분석%20노트.md) — 다섯 트라이브 서사를 트라이브를 설정하는 컨텐츠로 평가한 기록. 트라이브별 강점과 보강점, 공통 평가, 보강 목록과 반영 상태를 담는다.

## jam-doc/planning/content/

- [ACTIVITY_BADGES.md](../../jam-doc/planning/content/ACTIVITY_BADGES.md) — v5 액티비티배지의 조건·설명과 설계 원칙, 시딩하지 않은 항목, 발급되지 않는 항목을 정리한 목록이다(정본은 DB).
- [COMBINE_RECIPES.md](../../jam-doc/planning/content/COMBINE_RECIPES.md) — 믹스 결과의 두 갈래, 레시피 슬롯 구조, 실패 처리, 등록 레시피 현황과 레시피 결과물의 범위를 정리한 정책 문서다.
- [OPS_PATTERNS.md](../../jam-doc/planning/content/OPS_PATTERNS.md) — 라이브 운영 에이전트가 매주 새 운영을 기획할 때 쓰는 운영 패턴 18개의 원고다. 06 플랜의 채택 아이디어 63개를 작동 원리로 묶었다. 2026-10-07 운영툴(DB)에 입력했고, 지금은 입력일 기준 사본이다.
- [POI.md](../../jam-doc/planning/content/POI.md) — 지점(POI)의 데이터 소스, 티어 구조, 신규 등록 정책과 채워야 할 항목을 모은 컨텐츠 관리 문서다.
- [SPECIAL_DAYS.md](../../jam-doc/planning/content/SPECIAL_DAYS.md) — 특일정보 API가 조회하는 2026년 공휴일·24절기·기념일·잡절 전체 목록과, 어떤 날에 어떤 노출 태그를 켤지 사용자가 고르는 선택표다.
- [TRIBES.md](../../jam-doc/planning/content/TRIBES.md) — 세계관 트라이브의 캐치프레이즈·컬렉션·아이템배지, 인접 그래프, 소재·시간대·POI 유형 매핑, 데이터 소스를 정리한 목록이다.
- [v5_badge_name_split.md](../../jam-doc/planning/content/v5_badge_name_split.md) — v5 액티비티배지에서 종목마다 계열 이름을 다르게 짓는 이름 분화의 근거, 후보안, 승인 후 검증 결과를 기록한 문서다.

## jam-doc/planning/content/tribes-history/

- [README.md](../../jam-doc/planning/content/tribes-history/README.md) — 드랍 확률에 쓰이는 트라이브 설정을 크게 바꾸기 전에 스냅샷 사본을 남기는 폴더의 용도, 명명 규칙, pre-commit 예외를 안내한다.
