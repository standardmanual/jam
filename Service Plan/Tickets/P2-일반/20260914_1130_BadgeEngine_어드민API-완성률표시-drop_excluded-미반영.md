---
id: 20260914_1130
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-14
closed:
---

# [BadgeEngine] 어드민 API의 컬렉션 완성률 표시가 drop_excluded를 반영하지 않아 드랍엔진과 분모가 어긋날 수 있다

## 배경 / 문제 정의

티켓 [20260911_2235](20260911_2235_BadgeEngine_개별배지드랍제외-컬렉션완성분모미반영.md)의
개선 리뷰에서 발견된 범위 밖 이슈.

`20260911_2235`가 드랍엔진(`jam-web/src/lib/drop-engine/index.ts`)의 `badgeIdsOfBook`
(컬렉션 완성률 계산용 분모)을 개별 배지 `drop_excluded=true`도 제외하도록 고쳤다. 그런데
어드민 API(`jam-web/src/app/api/itembooks/route.ts` 등, 정확한 대상 라우트는 착수 시
전수 확인 필요)의 컬렉션 완성률 표시 쿼리는 `drop_excluded` 필터를 적용하지 않는다.

그 결과 드랍엔진 기준으로는 8/8(드랍 제외 배지를 뺀 분모)로 완성 판정되는 컬렉션이,
어드민/유저 화면의 "N/M 보유" 표시에서는 여전히 9/9 기준으로 계산되어 두 화면의 숫자가
서로 어긋날 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `drop_excluded` 필터 없이 컬렉션 전체 배지 수를 세는 API/쿼리를 전수 확인한다
  (`/api/itembooks/route.ts` 우선 확인, 다른 유저·어드민 노출 API도 함께 grep).
- 드랍엔진의 `buildBadgeIdsOfBook`(`20260911_2235`에서 순수 함수로 추출됨)과 동일한 기준
  (`drop_excluded=true` 배지 제외)으로 통일할지, 아니면 두 표시가 원래 다른 의미(전체
  카탈로그 vs 드랍 가능 분모)를 갖도록 의도된 것인지 먼저 판단한다.
- 통일하기로 하면 각 쿼리를 수정하고, 이미 그 배지를 보유한 유저의 진행률 표시가 즉시
  바뀌는 것에 대한 영향 범위를 확인한다.

## 구현 계획
> 조사 후 구체화 — 20260911_2235의 `buildBadgeIdsOfBook` 재사용 가능 여부가 핵심 판단 포인트.

## 참고
- 발견 경위: 티켓 20260911_2235 개선 리뷰(progressive-reviewer)
