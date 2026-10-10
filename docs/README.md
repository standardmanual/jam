---
type: guideline
description: JAM! 문서 폴더(docs/)의 입구. 목적별 폴더 지도와 폴더마다의 쓰기 방식, 버전 규칙, 경로 표기 규칙, 문서를 찾는 방법을 안내한다.
status: active
---

# JAM! 문서 폴더

JAM!의 모든 문서는 이 폴더(`docs/`) 하나에 있습니다. 서비스 코드는 `jam-web/`에 있고, 문서는 코드와
같은 저장소에서 같은 커밋으로 바뀝니다.

## 문서 찾기

- **주제로 찾을 때**: [INDEX.md](INDEX.md) 맨 위의 「주제 지도」. 주제(태그)마다 현재 서비스·JAM 2.0·비전·마케팅·운영·에이전트·보관 문서가 함께 나옵니다.
- **폴더로 찾을 때**: 아래 폴더 지도와 INDEX.md 아래쪽의 「폴더별 목록」.
- **티켓으로 찾을 때**: `docs/tickets/`(우선순위 폴더 `p0-urgent`~`p3-low`), 현황은 `node scripts/ticket-dashboard.mjs`.
- 문서 형식(type·frontmatter·태그 어휘)은 [DOCUMENT_SCHEMA.md](DOCUMENT_SCHEMA.md)가 정합니다.

## 폴더 지도와 쓰기 규칙

폴더는 **문서의 목적**으로 나눕니다. 폴더가 곧 "이 문서를 어떻게 쓰나"를 지시합니다.

| 폴더 | 담는 것 | 쓰기 방식 |
|---|---|---|
| `service/` | **지금 서비스**의 기준. 하위: `prd/`(기능·스펙), `badge-engine/`(배지 판정 로직), `content/`(세계관 TRIBES·액티비티배지·아이템북·믹스 레시피·POI·운영 패턴), `writing/`(UX 라이팅·금칙어·에러 메시지 규칙), `legal/`(개인정보 처리방침·위치기반서비스 약관), `SERVICE_OPERATIONS.md`(서비스 운영 로직) | 덮어쓰기. 지금 사실만 담는다 |
| `service/content/tribes-history/` | 세계관 설정을 크게 바꾸기 전 스냅샷 | 신규 추가만 |
| `plan/vision/` | 서비스 플랜·철학·트라이브·배지 철학·라이브 운영 플랜 같은 비전과 장기 전략 | 덮어쓰기. 버전 사본을 만들지 않는다 |
| `plan/jam2/` | **JAM 2.0** 기획(서비스 재설계 정책, 트라이브 재구상, 새 서비스 운영 로직). 아직 서비스에 반영되지 않았다 | 덮어쓰기. 에이전트는 현재 서비스 사실의 근거로 쓰지 않는다 |
| `marketing/` | 마케팅 플레이북·브랜드 보이스·콘텐츠 기획 레퍼런스·트렌드 노트 | 덮어쓰기 |
| `operations/reports/` | 주간·월간·배포·선별 리포트 | 신규 추가만. 기존 파일을 고쳐 쓰지 않는다 |
| `operations/inbox/trends/` | 사용자가 직접 넣는 트렌드 자료(사용법은 [그 폴더의 README](operations/inbox/trends/README.md)) | 신규 추가만. 올린 원문은 고치지 않는다. 에이전트는 재료로만 읽는다 |
| `tickets/` | 실행 계획·작업 이력. 우선순위 폴더 아래에 둔다 | 신규 생성. 완료 후에도 지식베이스로 남는다 |
| `agents/` | 에이전트 팀 운영 지도(`team-operations.md`)·오케스트레이터 규칙·계약(`contract.json`)·개발 프로세스 가드레일 | 덮어쓰기. 자동 생성 구간은 생성기로 고친다 |
| `agents/workflow/` | 2026-09-22에 동결된 설계 원본 기록 | 읽기 전용. README.md 외 수정 금지 |
| `assets/` | 배지 이미지 제작물·UI 프로토타입·브랜드 원본·컨텐츠 시드 생성기(`content-seed/`) | 생성 산출물. 문서 검색 대상이 아니다 |
| `archive/` | 폐기된 기록(지난 서비스 플랜 v1~v4, 옛 서비스 운영 로직 사본 등) | 읽기 전용. 신규 추가·수정 금지. 현재 상태 판단의 근거로 쓰지 않는다 |

루트의 `README.md`(이 문서)·`INDEX.md`(자동 생성 색인)·`DOCUMENT_SCHEMA.md`(문서 규칙)는 폴더 어디에도 속하지 않는 입구 문서입니다.

## 버전 규칙

- 버전 사본(`v3.1`, `_20260827` 등)을 만들지 않습니다. 이력은 git이 보관합니다.
- 지난 기획은 `archive/` 안에서 「버전명-기획내용」 폴더(예: `archive/business-plan/v4-service-plan/`)로 묶습니다.
  이 정리 이동은 사본이 아니며 사용자 승인 후에만 합니다.
- **JAM 2.0을 배포할 때**: `plan/jam2/`의 결과를 `service/`에 반영하고, 밀려난 `service/`·`plan/vision/` 문서를
  `archive/`의 버전 폴더로 옮깁니다.
- 새 버전 기획 문서는 `[JAM 2.0] ` 접두 description, `JAM2.0` 태그, 본문 첫 줄 표시를 붙입니다
  ([DOCUMENT_SCHEMA.md](DOCUMENT_SCHEMA.md) §4.5).

## 쓰기 규칙을 지키는 장치

- 폴더 규칙 일부는 작업 폴더 루트의 `.githooks/pre-commit`이 기계적으로 막습니다(`archive/`·`agents/workflow/` 신규·수정,
  `plan/vision/`·`service/content/TRIBES*` 버전 사본, 트렌드 자료 파일명). 정당한 예외는 `JAM_SKIP_DOCLINT=1`로 우회하고
  사유를 커밋 메시지에 남깁니다.
- 같은 훅이 `scripts/doc-check.mjs`로 문서 링크·백틱 경로·frontmatter도 검사합니다
  ([DOCUMENT_SCHEMA.md](DOCUMENT_SCHEMA.md) §10). 새로 깨지는 링크와 frontmatter(`type`·`description` 누락 등)는
  차단하고, 백틱 경로는 경고만 합니다. 무인 예약 루틴이 쓰는 `operations/reports/`는 검사 범위(`scope.exclude`)에서
  빠져 있어 frontmatter가 없어도 항상 통과합니다.
- `INDEX.md`는 `node scripts/gen-doc-index.mjs`가 만듭니다. 문서를 추가·삭제하거나 description·tags를 고치면 다시 실행합니다.

## 경로 표기 규칙

문서에 경로를 적을 때는 **항상 작업 폴더(`JAM!/`)를 기준으로** 적습니다.

- 문서: `docs/service/content/TRIBES.md`, `docs/service/prd/01_PRD.md`
- 코드: `jam-web/src/...`

폴더명은 영문 소문자로 씁니다. 파일명과, 콘텐츠 제목이 곧 이름인 폴더(이미지 제작의 스타일그룹·브리프 폴더)는
한글을 그대로 씁니다.

`assets/content-seed/`의 생성 스크립트(`v5_*.py`)는 자기 위치에서 세 단계 위를 작업 폴더로 계산해
`jam-web/supabase/migrations/`에 시드를 씁니다. 그래서 이 폴더는 반드시 작업 폴더 바로 아래 `docs/assets/`
안에 있어야 하고, 생성기 묶음을 다른 깊이의 폴더로 옮기면 스크립트의 경로 계산도 함께 고쳐야 합니다.

## 동기화와 이력

별도 설치 절차가 없습니다. 작업 폴더를 복제하면 `docs/`도 함께 따라오고, 동기화는 `/jam-sync`가 처리하며,
커밋과 push도 코드와 같이 한 번에 이뤄집니다.

- 2026-09-18부터 2026-09-20까지 기획·운영 문서는 별도 저장소(`jam-doc`)였고, 다시 합쳤습니다
  (티켓 `docs/tickets/p1-high/20260920_1412_Infra_문서저장소-코드저장소로-재통합.md`).
- 2026-10-10에 `docs/`와 `jam-doc/` 두 루트를 `docs/` 하나로 합치고 목적별 폴더로 다시 나눴습니다
  (티켓 `docs/tickets/p1-high/20261010_1214_Infra_문서-폴더를-docs-하나로-합치고-목적별로-재정비.md`).
  옛 경로에서 새 경로로의 대응은 그 티켓의 이동표와 `scripts/migrate-doc-tree.mjs`에 있습니다.
