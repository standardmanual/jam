---
id: 20261007_2122
category: Service
priority: P3
status: OPEN
created: 2026-10-07
---

# [Service] poi_drops.expires_at 코드 주석 3곳이 옛 정책을 적고 있다

> 범위 밖 발견물 — 티켓 20261007_2119(유저 드랍 만료 서술 정정)를 조사하다 발견했다.

## 핵심 요약
- 요구사항: `poi_drops.expires_at`에 대한 코드 주석을 현재 동작(유저·시스템 드랍 모두 값을 채우지 않음, 해당 CHECK 없음)에 맞춘다. 동작은 바꾸지 않는다.
- 구현 계획: 주석 줄만 고친다.
- 관련 파일: `jam-web/src/types/database.ts` 383행(`PoiDropSource` 주석 "'user'=…직접 드랍(30일 만료)"), `jam-web/src/lib/ambient-drop/index.ts` 6행("poi_drops_source_consistency CHECK로 강제"), `jam-web/src/lib/admin/kpiWeekly.ts` 25~31행(같은 CHECK 강제 서술을 인용)

## 배경 / 문제 정의

마이그레이션 108(티켓 20260829_2101)이 `poi_drops.expires_at`의 30일 기본값을 없애고
`poi_drops_source_consistency` CHECK를 `(source = 'user') OR (source = 'system' AND dropper_user_id IS NULL)`로
완화했다. 지금 CHECK는 `expires_at`을 강제하지 않는다. 시스템 드랍의 `expires_at`이 NULL인 이유는
`mint_and_place_ambient_drop()`이 NULL을 넣기 때문이고, 유저 드랍은 `create_user_drop()`이 값을 넣지 않기
때문이다. 위 세 주석은 옛 정책을 그대로 적고 있다.

## 완료 조건
- 세 주석이 "유저·시스템 드랍 모두 `expires_at`을 채우지 않는다(근거: 두 RPC)"는 사실과 일치하고, CHECK가 이를 강제한다는 서술이 없다.
- 주석 외의 코드 줄은 바뀌지 않는다. 재현: `git diff`에 주석 줄만 있다.

---
## 완료 기록 *(작업 완료 후 작성)*
