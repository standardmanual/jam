---
type: workflow-rule
description: "서비스 전체를 파악할 때 어떤 문서를 어떤 순서로 읽는지 에이전트에게 안내한다."
tags: [워크플로]
---

# 도메인 문서

탐색 전에 어떤 문서를 읽어야 하는지에 대한 지침. 이 저장소는 `CONTEXT.md` 체계를 쓰지 않고,
5개 카테고리 문서 체계를 domain doc으로 사용한다. 코드와 함께 바뀌는 문서는 `docs/`에, 기획·마케팅·
운영 자료는 `jam-doc/`에 있으며 둘 다 같은 저장소의 폴더다(2026-09-20 재통합, 티켓 20260920_1412).
경로는 항상 작업 폴더(JAM!) 기준으로 적는다.

## 탐색 전에 먼저 읽을 것

서비스 전체를 파악해야 할 때 코드부터 탐색하지 않는다. 아래 순서로 읽는다.

1. `docs/tickets/`의 관련 최신 티켓 (유사 작업·의사결정 확인)
2. `docs/specs/prd/01_PRD.md` (필요 시 `02_DATA_MODEL.md`, 주제별 폴더 `docs/specs/prd/{주제}/`)
3. `jam-doc/planning/content/` (배지·아이템·트라이브·POI 관련 시)
4. `docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md` (배지·드랍 로직 관련 시)
5. 위에서 찾지 못한 경우에만 코드(`jam-web/src/`) 탐색

## 파일 구조

```
JAM!/                          ← standardmanual/jam (Vercel에 배포되는 저장소)
├── jam-web/src/
├── docs/
│   ├── specs/
│   │   ├── prd/               ← 기능·스펙·로직 정의 (현재 상태, 덮어쓰기)
│   │   ├── badge-engine/      ← 배지 발급·드랍 판정 로직
│   │   └── (루트)             ← UX_WRITING_GUIDELINE 등 코드와 함께 바뀌는 횡단 참조 문서
│   ├── tickets/               ← 작업 이력 (신규 생성, 지식베이스로 계속 검색됨)
│   ├── adr/                   ← 아키텍처 결정 기록
│   └── agents/                ← 에이전트 팀 설계
└── jam-doc/                   ← 기획·운영 문서 (같은 저장소의 폴더, 티켓 20260920_1412)
    ├── planning/content/      ← 배지·아이템북·트라이브·POI 정의
    ├── planning/business-plan/← 비전·장기 전략 (덮어쓰기)
    ├── marketing/             ← 마케팅 플레이북·브랜드 보이스·트렌드 노트
    ├── operations/reports/    ← 주간·월간·배포 리포트 (쌓기만 함)
    ├── assets/                ← 이미지 제작물·프로토타입·브랜드 원본 (문서 검색 대상 아님)
    └── archive/               ← 폐기된 기록 (읽기 전용, 현재 상태 판단 근거로 삼지 않음)
```

**격리 워크트리에도 `jam-doc/`이 함께 들어 있다.** 같은 저장소의 폴더이므로 워크트리 안의 상대경로로
읽고 고치며, 코드와 같은 브랜치·커밋으로 push한다.

## 용어 사용

출력에서 도메인 개념을 지칭할 때(티켓 제목, 리팩터 제안, 테스트 이름 등) `docs/specs/prd/`와
`jam-doc/planning/content/`에 정의된 용어를 그대로 쓴다. 문서가 피하는 동의어로 임의로 바꾸지 않는다.

## 문서 충돌 시

출력이 기존 PRD·배지엔진 문서와 상충하면 조용히 덮어쓰지 말고 명시적으로 알린다.

> _`docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md`의 판정 로직과 상충하지만, ~한 이유로 재검토가
> 필요할 수 있다._

## 문서 체계 갱신 절차

문서 작성 규칙·파일명 규칙·필수 항목은 `/jam-docs` 스킬을 따른다.
