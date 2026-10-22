---
id: "20261022_1022"
category: Service
priority: P3
status: OPEN
created: 2026-10-22
parent: "20261021_1249"
---

# [Service] 활동 피드 기록 함수가 insert 오류를 확인하지 않고, 피드에 중복 방지 키가 없다

## 핵심 요약

- 요구사항: `lib/activity-feed/index.ts`의 `recordFeedEvent`는 던지지 않는 함수인데 `user_activity_feed` insert의 `error`를 확인하지 않는다. 그래서 enum 값이 DB에 없는 채로 코드가 먼저 배포되는 것 같은 실패가 로그도 없이 피드만 사라지게 한다(소식은 로그가 남는다). 또 피드 표에는 유니크 키가 없어, 티켓 `20261021_1249` 5회가 더한 컬렉션 등급 완성 피드는 호출부 계약(새 완성만 호출)에 기대고 있고 드문 동시 장착 경합이면 두 건이 될 수 있다. 두 가지를 정리한다.
- 구현 계획: ① insert의 `error`를 확인해 `console.error`로 남긴다(던지지는 않는다). ② 중복 방지를 DB에서 하려면 `(user_id, event_type, 키)`에 해당하는 유니크 키가 필요한데 메타 안의 값이라 부분 유니크 인덱스(`(user_id, (metadata->>'collection_id'), (metadata->>'tier')) WHERE event_type = 'collection_tier_completed'` 같은 식)를 만들어야 한다. 비용 대비 효과를 보고 «호출부 계약으로 충분»으로 닫을지 정한다.
- 관련 파일: `jam-web/src/lib/activity-feed/index.ts` 140줄 근처(민지 보고, 카리나가 직접 확인하지는 않았다), `jam-web/src/lib/chapter/collection.ts` 79줄 근처.

## 배경 / 문제 정의

6-3 5회 게이트(민지, 주의·참고)가 발견했다. 오류 미확인은 기존 동작이고, 마이그레이션 270을 코드 배포보다 먼저 적용하면 5회에서는 문제가 되지 않는다.

발견: 2026-10-22 티켓 20261021_1249 5회 게이트.

## 상세 요구사항

### 서비스/코드베이스 관점

- 오류를 남기더라도 피드 기록 실패가 호출한 흐름(챕터 오름, 컬렉션 완성, 배지 발급)을 막지 않는다.

## 완료 조건

- [ ] 피드 insert 오류가 로그에 남는다(시험으로 고정)
- [ ] 컬렉션 등급 완성 피드의 중복 방지 방식을 정했다

## 진행 기록

## 잔여 이슈
