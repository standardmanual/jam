---
id: "20261001_2218"
category: Service
priority: P3
status: OPEN
created: 2026-10-01
closed:
parent: "20260930_1457"
---

# [Service] 앰비언트 예약 사유 라벨 조회가 prototype 키를 통과시킨다

> 출처: 20261001_2052(조각 A) 게이트(민지) 범위 밖 발견물 `[정확성/참고]`

## 핵심 요약

- 요구사항: `entry.reason in SCHEDULE_EXCLUDE_REASON_LABEL`과 `SKIPPED_BY_REASON[outcome.reason]`가 `constructor` 같은 prototype 키를 통과시킨다. reason은 코드가 정하는
  값이라 지금은 도달할 수 없지만, 「DB의 JSON을 믿지 않는다」는 파일 방침에 맞춰 `Object.hasOwn`으로 바꾼다.
- 구현 계획: 착수할 때 관련 파일을 읽고 파일 단위로 적는다.
- 관련 파일: `jam-web/src/lib/ambient-drop/scheduleList.ts` 46행, `jam-web/src/lib/ambient-drop/scheduleView.ts` 192행

## 완료 조건

- [ ] reason이 `constructor`·`__proto__` 같은 값이어도 라벨·문장이 기본(모름) 경로로 간다(테스트).

---
## 완료 기록 *(작업 완료 후 작성)*

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
