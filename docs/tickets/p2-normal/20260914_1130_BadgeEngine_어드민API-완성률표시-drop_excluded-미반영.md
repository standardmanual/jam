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

---
## 조사 결과 (2026-09-21) — 착수 보류, 범위 확대로 재결정 필요

전수 확인에서 티켓 전제(표시 쿼리만 어긋난다)보다 범위가 넓다는 것이 드러났다. **`drop_excluded`를 분모에서 빼는 곳은 드랍엔진(`lib/drop-engine/index.ts`의 `buildBadgeIdsOfBook`) 하나뿐**이고, 표시와 실제 완성 판정이 모두 배지 전체를 센다.

| 위치 | 역할 | `drop_excluded` 반영 |
|---|---|---|
| `lib/drop-engine/index.ts` | 드랍 후보·완성률 분모 | 반영함 |
| `lib/itembook/checker.ts` | 슬롯 기반 완성 catch-up, **보상 배지 발급** | 반영 안 함 |
| `lib/itembook/completable.ts` | 완성 가능 컬렉션 판정 | 반영 안 함 |
| `app/api/itembooks/[id]/slot/route.ts` | 슬롯 장착 시 실시간 완성 처리 | 반영 안 함 |
| `app/api/itembooks/route.ts` | 내 컬렉션 목록 `totalBadgeCount` | 반영 안 함 |
| `app/api/users/[username]/itembooks/route.ts` | 타인 컬렉션 목록 | 반영 안 함 |
| `app/(main)/collections/[id]/page.tsx` | 상세 「N/M」와 `isCompleted` | 반영 안 함 |
| `app/(main)/[username]/collections/page.tsx` | 프로필 컬렉션 카드 | 반영 안 함 |
| `lib/today/status.ts` | 오늘 화면 진행 중 컬렉션 | 반영 안 함 |

- 표시만 드랍엔진 기준으로 맞추면 화면은 8/8인데 `checker.ts`는 9개를 기준으로 완성을 판정해 **화면과 보상 발급이 어긋난다.** 처음 생각한 「표시만 통일」은 안전하지 않다.
- 반대로 완성 판정까지 맞추면 **컬렉션 완성 보상 발급 조건이 바뀌고**, 이미 그 배지를 보유한 유저의 완성 상태가 재계산된다. `checker.ts`에는 「분모는 삭제 여부와 무관하게 고정」한다는 별도 정책 주석(20260825_025)도 있어 정책 충돌 검토가 필요하다.
- 따라서 이 티켓은 표시 수정이 아니라 **엔진 유형(`engine`) 작업**이다. `BADGE_ENGINE_UNIFIED.md` 대조와 민지의 게이트 리뷰가 필요하다.

**결정 필요**: (A) 완성 판정·보상까지 포함해 드랍 제외 배지를 분모에서 빼는 것으로 정책을 통일한다. (B) 드랍엔진만 예외로 두고 표시·완성은 전체 배지 기준을 유지한다(현재 상태를 의도로 확정하고 티켓을 닫는다). 20260911_2235의 「드랍 제외 배지는 컬렉션 완성 조건에서도 제외로 확정」 문구는 (A)를 가리키지만, 실제 완성 판정 코드는 아직 반영하지 않았다.
