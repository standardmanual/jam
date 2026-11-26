---
type: workflow-rule
description: "서비스 전체를 파악할 때 어떤 문서를 어떤 순서로 읽는지 에이전트에게 안내한다."
tags: [워크플로]
---

# 도메인 문서

탐색 전에 어떤 문서를 읽어야 하는지에 대한 지침. 이 저장소는 `CONTEXT.md` 체계를 쓰지 않고,
5개 카테고리 문서 체계(`CLAUDE.md` 「문서 체계 개요」)를 domain doc으로 사용한다. 폴더 지도는
`docs/README.md`, 주제로 찾는 길은 `docs/INDEX.md`의 주제 지도다.

## 탐색 전에 먼저 읽을 것

서비스 전체를 파악해야 할 때 코드부터 탐색하지 않는다. 아래 순서로 읽는다(새 세션 읽기 순서의 단일 원천).

1. `docs/tickets/`의 관련 최신 티켓 (유사 작업·의사결정 확인)
2. `docs/INDEX.md` (주제 지도와 전체 문서 목록. 자동 생성이라 손으로 고치지 않는다)
3. `docs/service/prd/01_PRD.md` (필요 시 `02_DATA_MODEL.md`, 주제별 폴더 `docs/service/prd/{주제}/`)
4. `docs/service/content/` (배지·아이템·트라이브·POI 관련 시)
5. `docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md` (배지·드랍 로직 관련 시)
6. 위에서 찾지 못한 경우에만 코드(`jam-web/src/`) 탐색

## 용어 사용

출력에서 도메인 개념을 지칭할 때(티켓 제목, 리팩터 제안, 테스트 이름 등) `docs/service/prd/`와
`docs/service/content/`에 정의된 용어를 그대로 쓴다. 문서가 피하는 동의어로 임의로 바꾸지 않는다.

## 문서 충돌 시

출력이 기존 PRD·배지엔진 문서와 상충하면 조용히 덮어쓰지 말고 명시적으로 알린다.

> _`docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md`의 판정 로직과 상충하지만, ~한 이유로 재검토가
> 필요할 수 있다._
