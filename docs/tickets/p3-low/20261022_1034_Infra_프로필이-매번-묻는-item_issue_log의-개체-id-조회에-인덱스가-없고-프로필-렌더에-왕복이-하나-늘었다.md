---
id: "20261022_1034"
category: Infra
priority: P3
status: OPEN
created: 2026-10-22
parent: "20261021_1249"
---

# [Infra] 프로필이 매번 묻는 `item_issue_log`의 개체 id 조회에 인덱스가 없고 프로필 렌더에 왕복이 하나 늘었다

## 핵심 요약

- 요구사항: 티켓 `20261021_1249` 5회에서 프로필 서버 화면이 캡슐 개체를 가리려고 `item_issue_log`를 `inventory_item_id IN (…최대 100개) AND route = 'capsule'`로 조회한다(`lib/activity-feed/capsuleItems.ts`). 이 표에는 `inventory_item_id` 인덱스가 없고(마이그레이션 227은 `(user_id, created_at)`과 `source_activity_id` 부분 인덱스만 만들었다), 조회가 프로필의 `Promise.all` 뒤에 직렬로 붙어 개체가 있는 프로필마다 왕복이 한 번 늘었다. 지금 표 크기에서는 문제가 없지만 발급 기록이 쌓이면 프로필을 열 때마다 순차 조회가 느려질 수 있다. 인덱스를 더할지, 조회를 `Promise.all`에 합칠지 정한다.
- 구현 계획: ① 표 크기를 재고(공용 DB 행 수와 증가율) 필요하면 `CREATE INDEX IF NOT EXISTS idx_item_issue_log_inventory_item_id ON public.item_issue_log (inventory_item_id)`를 마이그레이션 파일로 만든다(추가만, 되돌림 `DROP INDEX`). ② 조회를 합성 대상 개체 조회와 같은 라운드에 넣는 방법을 본다(개체 id를 알아야 하므로 `inventory_items`와 조인하는 한 번의 조회로 바꾸는 것이 후보). ③ `capsuleItems.ts`가 상수 하나 때문에 `lib/capsule/open.ts` 전체를 가져오는 방향(피드 모듈이 열기 모듈에 의존)도 상수를 가벼운 파일로 빼는 편이 낫다.
- 관련 파일: `jam-web/src/lib/activity-feed/capsuleItems.ts` 12~25줄, `jam-web/src/app/(main)/[username]/page.tsx` 322줄 근처(민지 보고, 카리나가 직접 확인하지는 않았다), `jam-web/supabase/migrations/227_item_issue_policy_and_log.sql` 73~74줄.

## 배경 / 문제 정의

6-3 5회 게이트(민지, 참고)가 발견했다. 사용자가 5회에 포함하라고 한 프로필 캡슐 개체 수정(티켓 `20261022_1021`)이 만든 조회다.

발견: 2026-10-22 티켓 20261021_1249 5회 게이트.

## 상세 요구사항

### 서비스/코드베이스 관점

- 인덱스를 더해도 앱 동작은 바뀌지 않는다. 공용 DB 변경이므로 사용자 승인 뒤 카리나만 실행한다.

## 완료 조건

- [ ] 인덱스를 더하거나, 더하지 않는 이유(표 크기)를 적었다

## 진행 기록

## 잔여 이슈
