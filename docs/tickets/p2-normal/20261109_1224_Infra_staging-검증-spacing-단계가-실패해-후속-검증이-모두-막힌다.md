---
id: "20261109_1224"
category: Infra
priority: P2
status: CLOSED
created: 2026-11-09
closed: 2026-11-09
---

# [Infra] staging 검증의 spacing 단계가 실패해 후속 검증이 모두 막힌다

## 핵심 요약

- 요구사항: staging 최신 커밋(79aa27e2e)의 CI `verify`가 `spacing` 단계에서 실패한다. 위반을 고치거나 기준선을 정리해 `verify`를 다시 통과시킨다.
- 구현 계획: `node scripts/check-spacing.mjs` 출력을 보고 위반 파일을 고치거나 `scripts/spacing-baseline.json`을 맞춘다. 위반은 다른 작업(배지 상세·컬렉션 카드 정리)에서 들어온 것이라 해당 작업의 담당 흐름에서 정리하는 편이 맞는지 확인한다.
- 관련 파일(민지 게이트가 탭바 반전 1회차 리뷰 중 발견):
  - `jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx` 94·95줄: 기준선 초과(기준선 1 → 2).
  - `jam-web/src/components/ui/CollectionGridCard.tsx` 71줄: 신규 위반(0 → 1).
  - `jam-web/src/app/(main)/badges/[id]/page.tsx`, `jam-web/src/components/inventory/InventoryItemHistorySheet.tsx`: 기준선 축소 요청(기준선보다 위반이 줄었으니 기준선을 낮추라는 안내).
  - `jam-web/scripts/spacing-baseline.json`, `scripts/check-spacing.mjs`.

## 배경 / 문제 정의

- 탭바 반전 1회차 브랜치의 CI에서 `scripts/verify.sh`의 spacing 단계만 실패했다. 그 브랜치가 건드리지 않은 파일의 위반이고, staging 최신 커밋(79aa27e2e)의 CI도 같은 이유로 실패한다.
- 직전 staging 커밋(47179f66b)은 문서만 바뀌어 전체 verify가 건너뛰어져 이 실패가 가려졌다.
- 이대로 두면 staging 위의 모든 코드 변경이 CI에서 막힌다.

## 완료 조건

- staging 최신 커밋에서 `verify`(spacing 포함)가 통과한다.
- 위반을 기준선으로 덮은 경우 어떤 위반을 왜 허용했는지 완료 기록에 적는다.

---
## 완료 기록

### 구현 내용 요약
티켓 20261109_1448에서 같은 spacing 기준선 불일치를 한 번에 고쳤다. 이 티켓은 중복이어서 별도 변경 없이 닫는다. 어떤 위반을 왜 허용했는지는 1448의 완료 기록에 적었다(허용한 값은 `CollectionGridCard.tsx`의 `px-[9px]` 한 건).

### 변경된 파일
```
- (20261109_1448에서 변경)
```

### 테스트 결과
- [x] `node scripts/check-spacing.mjs` 통과(1448에서 확인).

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 중복 종료 (작업 없음) | - | - / - | - | - |
| 합계 |  | - | - / - | - | - |

### 주요 의사결정 / 핵심 메모
- 같은 원인의 티켓 세 건(1146, 1224, 1448) 중 1448만 구현하고 나머지는 중복으로 닫았다.

### 잔여 이슈
- 없음
