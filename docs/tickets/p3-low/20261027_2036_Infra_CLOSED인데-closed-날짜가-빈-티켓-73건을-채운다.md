---
id: "20261027_2036"
category: Infra
priority: P3
status: OPEN
created: 2026-10-27
closed:
parent: "20261026_2028"
specs:
  - "docs/service/prd/admin-boards/PRD.md"
---

# [Infra] `status: CLOSED`인데 `closed:` 날짜가 빈 티켓 73건을 채우고 앞으로 비지 않게 막는다 (2028 2회차 후속)

> 상위: 20261026_2028

## 핵심 요약

- 문제: 티켓 색인(`docs/tickets/_index.json`, 2026-10-27) 기준 `CLOSED`가 1,567건인데 그중 73건(2026-09 생성 43건, 2026-10 생성 30건)은 `closed:`가 비어 있다. 개발·배포 상황판은 닫은 날짜로 「staging 반영」과 「배포됨」을 가르므로(main에 색인이 없는 동안의 추정 규칙) 이 73건은 칸에 넣을 수 없다. 2028 3회차는 이 티켓들을 칸에서 빼고 「닫은 날짜가 없는 완료 티켓 N건」으로만 알린다.
- 구현 계획: (1) 각 티켓 파일에서 `status: CLOSED`가 처음 들어간 커밋 날짜(KST)를 `git log -S`로 찾아 `closed:`를 채우는 일회용 스크립트를 돌린다(결과는 하나씩 눈으로 확인할 수 있게 목록을 먼저 출력). (2) `scripts/doc-check.mjs` 티켓 검사에 「`status: CLOSED`이면 `closed:`가 있어야 한다」를 새 티켓부터 경고로 더한다(소급하지 않는다, `docs/DOCUMENT_SCHEMA.md` §7 확장 규칙 1).
- 관련 파일: `docs/tickets/_index.json`(`status: CLOSED`이고 `closed: ""`인 항목이 대상 목록), `scripts/doc-check.mjs`·`scripts/doc-check.config.json`, `docs/DOCUMENT_SCHEMA.md`

## 완료 조건

- `_index.json`에서 `status: CLOSED`이고 `closed`가 빈 항목이 0건이다.
- 새 티켓을 `CLOSED`로 바꾸면서 `closed:`를 비워 두면 커밋 때 경고가 나온다(시험).
