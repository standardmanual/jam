---
id: "20261108_1300"
category: Service
priority: P3
status: OPEN
created: 2026-11-08
origin: other
---

# [Service] 프로필에서 쓰지 않게 된 사용자 컬렉션 API(api/users/[username]/itembooks)를 정리한다

## 핵심 요약
- 출처: 티켓 20261108_1216 게이트 리뷰의 범위 밖 발견물.
- 티켓 20261108_1216에서 프로필의 컬렉션 탭을 지우면서 `jam-web/src/app/api/users/[username]/itembooks/route.ts`를 부르는 곳이 없어졌다(아현 grep: ProfileClient 외 사용처 없음).
- 관련 시험: `api/users/[username]/itembooks/__tests__/route.test.ts`·`inactive-books.test.ts`, `jam-web/src/app/__tests__/lockedItemExclusion.test.ts`가 이 라우트를 참조한다.

## 완료 조건
- 사용처를 다시 확인해 정말 없으면 라우트와 시험을 지우고, 다른 시험의 참조를 정리한다. 앞으로 쓸 계획이 있으면 이유를 적고 남긴다.
