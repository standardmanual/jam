---
id: "20261008_1435"
category: Service
priority: P3
status: OPEN
created: 2026-10-08
---

# [Service] 프로필 피드가 user_activity_feed 행 전체를 클라이언트로 넘긴다

## 핵심 요약
- 요구사항: `/{username}` 페이지가 `feedItems` prop으로 넘기는 피드 행을 화면(`FeedSection`)이 쓰는 열과 `metadata` 키로 줄인다. 이 테이블에 민감한 열이나 `metadata` 키가 새로 생겨도 다른 유저 프로필로 새지 않게 한다.
- 구현 계획: (미정 — 착수 시 작성) `FeedSection`이 읽는 필드를 전수 확인한 뒤, 조회 열 목록과 화면용 변환 함수를 두는 방향. 다른 유저 UUID인 `metadata.dropper_user_id`를 화면이 쓰지 않으면 함께 뺀다.
- 관련 파일: `jam-web/src/app/(main)/[username]/page.tsx` L94 부근(`service.from('user_activity_feed').select('*')`, 커밋 `b9f42125e` 기준), 같은 파일의 레거시 합성 행(`makeFeedItem`, `dropper_user_id`) / `jam-web/src/app/(main)/FeedSection.tsx` / 같은 구조 확인 대상: `jam-web/src/app/(main)/feed/page.tsx` L54-57

## 배경 / 문제 정의

### 확인한 사실 (2026-10-08 14:35 KST, 코드 읽기와 읽기 전용 SQL)
- 페이지는 서비스 클라이언트(RLS 우회)로 대상 유저의 피드를 `select('*')`로 읽어 행 그대로 `ProfileClient`(클라이언트 컴포넌트)의 `feedItems`로 넘긴다.
- 운영 DB `user_activity_feed` 열: `id, user_id, event_type, event_at, metadata, created_at, strava_activity_id`.
- 운영 DB 전체 행 기준 `metadata` 키에 좌표는 없다. `item_picked_up`의 `dropper_user_id`(다른 유저 UUID) 80행, `badge_earned`의 `visit_count`·`poi_name` 등이 있다.
- 티켓 20261008_1354 게이트 리뷰에서 민지가 범위 밖 발견물 `[보안/참고]`로 지적했다.

### 판단
- 지금 실리는 값은 화면에 이미 보이는 정보와 UUID뿐이라 당장의 노출은 크지 않다. 다만 1354와 같은 "행을 통째로 넘기는" 구조라서, 테이블에 열이나 `metadata` 키가 늘면 다시 샌다. **위험도: 참고, 확신도 높음.**

## 완료 조건
- (착수 시 구체화) 다른 유저 프로필의 `feedItems` prop이 `FeedSection`이 쓰는 필드만 담는다는 것을 테스트로 고정한다. 피드 화면은 그대로다.
