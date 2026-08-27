---
id: 20260827_007
category: API
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [API] SERVICE_OPERATIONS.md 어드민 API HTTP 메서드 표기 오류 정정

## 배경 / 문제 정의
`Service Plan/Archive/Operations/SERVICE_OPERATIONS.md`의 "어드민" API 엔드포인트 표(16번
섹션 직전, 어드민 API 목록)에서 factions·badges·itembooks·missions·poi·abusing 등 여러
엔드포인트의 HTTP 메서드가 실제 코드(`jam-web/src/app/api/admin/*/[id]/route.ts` 등)와
다르게 기재돼 있다. 예: `/api/admin/factions/[id]`는 문서상 `PATCH`지만 실제 구현은 `PUT`이다.

티켓 20260827_005(세계관 PUT API 부분 body 버그 수정) 개선 리뷰 중 나온 범위 밖 발견물이다.

## 상세 요구사항

### 서비스/코드베이스 관점
어드민 API route.ts 파일 전체를 grep해 실제 export된 HTTP 메서드를 확인한 결과, 아래 표에
정정이 필요하다(단순 PATCH→PUT 일괄 치환이 아니라 파일별로 실제 export된 메서드 전체를
반영):

| 경로 | 문서(기존, 오류) | 실제 코드(정정) | 근거 파일 |
|---|---|---|---|
| `/api/admin/badges/[id]` | GET, PATCH, DELETE | PUT, PATCH, DELETE | `badges/[id]/route.ts` (GET 없음, PUT 있음) |
| `/api/admin/factions/[id]` | GET, PATCH, DELETE | GET, PUT, DELETE | `factions/[id]/route.ts` (PATCH 없음, PUT 있음) |
| `/api/admin/itembooks/[id]` | GET, PATCH, DELETE | PUT, PATCH, DELETE | `itembooks/[id]/route.ts` (GET 없음, PUT+PATCH 둘 다 있음 — PATCH는 `is_active` 단일 필드 토글 전용) |
| `/api/admin/missions/[id]` | GET, PATCH, DELETE | PATCH, DELETE | `missions/[id]/route.ts` (GET 없음) |
| `/api/admin/poi/[id]` | GET, PATCH, DELETE | PUT, DELETE | `poi/[id]/route.ts` (GET·PATCH 없음, PUT 있음) |
| `/api/admin/abusing/policy` | GET, PATCH | GET, PUT | `abusing/policy/route.ts` (PATCH 없음, PUT 있음) |
| `/api/admin/abusing/bans` | GET, POST | GET, POST, DELETE | `abusing/bans/route.ts` (DELETE 누락) |
| `/api/admin/abusing/poi-blocks` | GET, POST, DELETE | GET, DELETE | `abusing/poi-blocks/route.ts` (POST 없음) |

변경 없이 실제와 이미 일치하는 행(auth·badges·factions·itembooks·missions·poi 목록/생성,
recipes, users, simulate)은 손대지 않는다.

## 구현 계획
1. 위 표대로 `SERVICE_OPERATIONS.md`의 어드민 API 표를 정정한다.
2. 문서 전용 수정 — 코드 변경 없음, `/jam-work` docs 유형(단독 처리)으로 진행한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `SERVICE_OPERATIONS.md` 어드민 API 표의 HTTP 메서드 8행을 실제 route.ts export와 일치하도록
  정정했다. `jam-web/src/app/api/admin/` 하위 전체 route.ts에 대해 `export async function
  (GET|POST|PUT|PATCH|DELETE)` 패턴으로 grep해 실측한 결과를 근거로 삼았다(티켓 본문의
  대조표 참조).
- 단순 PATCH→PUT 치환이 아니라 파일별 실제 지원 메서드 전체를 반영했다 — 예:
  `itembooks/[id]`는 PUT(전체 수정)과 PATCH(`is_active` 단일 토글)가 별도로 공존해 둘 다
  표기했고, `missions/[id]`·`poi/[id]`는 문서에 있던 GET이 실제로는 없어 제거했다.
- 실제와 이미 일치하던 행(auth·badges·factions·itembooks·missions·poi의 목록/생성, recipes,
  users, simulate)은 변경하지 않았다.

### 변경된 파일
```
Service Plan/Archive/Operations/SERVICE_OPERATIONS.md
```

### 테스트 결과
- [x] 코드 변경 없음(문서 전용) — `jam-web/src/app/api/admin/**/route.ts` 전체를 grep해 표의
      8개 행 각각을 실제 export와 1:1 대조 확인함(테스트 실행 대상 아님).

### 배포 정보
- 배포일: 2026-08-27 (staging)
- 환경: staging (문서 전용 변경 — 프로덕션 반영은 통상 `/jam-ship` 절차를 따르되 코드 동작에는
  영향 없음)
- 커밋:

### 주요 의사결정 / 핵심 메모
- 이번 정정은 "표에 이미 있는 행의 메서드가 틀렸다"는 범위로 한정했다. 조사 중
  `badges/[id]/poi-links`·`badges/search`·`combine-policy`·`drop-policy`·
  `factions/[id]/apply-background`·`itembooks/[id]/apply-background`·
  `itembooks/[id]/deactivation-impact`·`poi-categories`·`poi-categories/[slug]`·
  `poi/naver-search`·`poi/search`·`points`·`points/grant`·`theme-presets`·
  `theme-presets/[id]/activate`·`today`·`today/[id]`·`upload-image`·`ambient-drop/config`·
  `ambient-drop/deploy` 등 표에 아예 행이 없는 어드민 엔드포인트가 다수 발견됐다 — 이는 "메서드
  오표기"가 아니라 "표 자체의 커버리지 누락"이라 이번 티켓 범위(원 발견물이 지적한 메서드 정합성)
  밖으로 판단해 손대지 않았다. 별도 문서 완성도 작업으로 분리한다(잔여 이슈 참조).

### 잔여 이슈
- `SERVICE_OPERATIONS.md` 어드민 API 표에 실제 존재하는 다수 엔드포인트(위 목록)가 아예
  누락돼 있다 — 표 전체를 재작성하는 별도 문서 완성도 작업이 필요하다(이번 범위 밖).
