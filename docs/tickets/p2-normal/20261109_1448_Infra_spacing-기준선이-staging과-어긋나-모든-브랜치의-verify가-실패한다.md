---
id: "20261109_1448"
category: Infra
priority: P2
status: CLOSED
created: 2026-11-09
closed: 2026-11-09
---

# [Infra] spacing 기준선이 staging과 어긋나 모든 브랜치의 verify가 실패한다

## 핵심 요약

- 요구사항: `scripts/verify.sh`의 spacing 단계(`node scripts/check-spacing.mjs`)가 staging 현재 코드에서 실패한다. 기준선(`scripts/spacing-baseline.json`)과 코드의 눈금 밖 간격 값이 어긋나 있어, 이 상태에서는 어느 브랜치의 CI `verify`도 녹색이 되지 않는다. 기준선과 코드를 맞춰 staging의 `verify`를 녹색으로 되돌린다.
- 구현 계획: 아래 네 파일의 어긋남을 하나씩 판정한다. 위반이 **줄어든** 두 파일은 기준선 숫자를 내린다. 위반이 **늘어난** 두 파일은 눈금 안 값(spacing 토큰)으로 고치거나, 눈금 밖이 의도된 값이면 `spacing-allow` 주석과 사유를 단다. 코드 수정은 해당 화면의 디자인을 바꾸지 않는 범위로 한다.
- 관련 파일:
  - `scripts/spacing-baseline.json`, `scripts/check-spacing.mjs`
  - `jam-web/src/app/(main)/badges/[id]/page.tsx` (기준선 6 → 현재 4, 기준선을 내린다)
  - `jam-web/src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx` (기준선 1 → 현재 0, 기준선을 내린다)
  - `jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx` (기준선 1 → 현재 2, 94·95줄 근처)
  - `jam-web/src/components/ui/CollectionGridCard.tsx` (기준선 0 → 현재 1, 71줄 근처)

## 배경 / 문제 정의

2026-11-09 UI 티켓 세 건(20261109_1414·1419·1429)의 게이트에서 민지가 발견했다. 세 브랜치의 CI `verify`가 모두 spacing 단계 하나로 실패했고, 같은 기준(staging 코드 커밋 `30dc1c5e4`)의 CI도 같은 이유로 이미 실패 상태였다. 문서만 바꾼 커밋은 전체 검증이 건너뛰어져 성공으로 보여 이 실패가 가려졌다. 위 네 파일은 세 티켓이 건드리지 않은 파일이다.

주의: 이 중 `BadgeHeroSection.tsx`와 `CollectionGridCard.tsx`는 다른 세션이 작업 중인 배지 상세·컬렉션 변경과 겹칠 수 있다. 작업 전에 해당 파일에 커밋되지 않은 변경이 없는지 확인한다.

## 완료 조건

- `node scripts/check-spacing.mjs`가 staging 최신 코드에서 통과한다.
- staging 최신 커밋의 CI `verify`가 녹색이다(코드 변경이 있는 커밋 기준).
- 화면 모양이 바뀌지 않는다(눈금 값 교체는 기존 값과 같거나 가장 가까운 눈금으로 하고, 바뀌면 사유를 적는다).

---
## 완료 기록

### 구현 내용 요약
staging의 `node scripts/check-spacing.mjs` 실패를 한 번에 고쳤다(티켓 20261109_1146·1224·1448이 같은 원인이다). 위반이 줄어든 두 파일(`badges/[id]/page.tsx` 6→4, `InventoryItemHistorySheet.tsx` 1→0)은 기준선 숫자를 내렸다. 위반이 늘어난 두 파일 중 `BadgeHeroSection.tsx`는 위반으로 센 두 줄이 코드가 아니라 «pb-[32px]», «pt-[32px]»를 적은 주석이어서 주석 문구만 바꿔 기준선 1건이 0건이 됐다. `CollectionGridCard.tsx` 71줄의 `px-[9px]`는 디자인 시스템 사본의 `TAG_STYLE`과 같은 값이어서 같은 줄에 `spacing-allow` 사유 주석을 달았다. 화면 모양은 바뀌지 않는다.

### 변경된 파일
```
scripts/spacing-baseline.json
jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx (주석 문구)
jam-web/src/components/ui/CollectionGridCard.tsx (spacing-allow 주석)
```

### 테스트 결과
- [x] `node scripts/check-spacing.mjs` 통과, `eslint` 두 파일 오류 없음, `src/components/ui` 시험 19개 파일 310건 통과.
- [ ] staging 최신 커밋의 CI `verify` 녹색은 push 뒤에 확인한다.

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 카리나 직접 (경미 수정) | - | - / - | - | - |
| 합계 |  | - | - / - | - | - |

### 주요 의사결정 / 핵심 메모
- 위반을 기준선으로 덮은 것은 없다. 예외로 허용한 값은 `CollectionGridCard.tsx`의 `px-[9px]` 한 건이고 이유는 디자인 시스템 사본과 같은 값이기 때문이다.
- 티켓 20261109_1146·1224는 1448과 같은 원인이라 함께 닫았다.

### 잔여 이슈
- CI `verify` 녹색 확인은 push 뒤 카리나가 한다.
