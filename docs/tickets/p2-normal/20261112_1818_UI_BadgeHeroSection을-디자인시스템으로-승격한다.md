---
id: "20261112_1818"
category: UI
priority: P3
status: WAITING
created: 2026-11-12
parent: "20261112_1625"
---

# [UI] BadgeHeroSection을 디자인시스템으로 승격한다

## 핵심 요약

- 요구사항: `BadgeHeroSection`을 서비스 전용 컴포넌트에서 MODULAR(`design-system/components/**`) 컴포넌트로 승격한다. 승격 범위(어디까지 props로 정리할지)는 **사용자 결정 대기**(WAITING).
- 구현 계획: 4회차(20261112_1629)에서 `src/components/BadgeHeroSection.tsx`로 옮겨 `size`(page·sheet) 변형을 얻었고 4곳 이상이 쓴다. 승격하려면 배경 애니메이션·테마 배경 의존(`SafeImage`, 배경 레이어)을 props로 걷어야 한다. 결정 뒤 구체화한다.
- 관련 파일(지도, 경로 기준 `jam-web/`):
  - 현 위치: `src/components/BadgeHeroSection.tsx`(주석에 «MODULAR 신규 컴포넌트 아님(20260816_006 선례)»가 있어 갱신 필요).
  - 사용처: `src/app/(main)/badges/[id]/page.tsx`, `src/app/(main)/inventory/[itemId]/LockedItemDetail.tsx`, `src/app/(main)/drops/BadgeDetailSheet.tsx`(`size="sheet"`), `src/app/admin/badges/BadgeDetailPreviewFrame.tsx`, `src/app/dev-sample/item-badge-serial/page.tsx`.
  - 시험: `badges/[id]/__tests__/heroLayout.test.tsx`·`heroTextColor.test.tsx`·`page.locked.test.tsx`·`checkinDetail.test.tsx`, `inventory/[itemId]/__tests__/LockedItemDetail.test.tsx`, `(main)/__tests__/serviceLiteralColors.test.ts`.
  - DS 대상 위치 후보: `design-system/components/patterns/` 또는 `cards/`.

## 배경 / 문제 정의

4회차 채원② 검토가 승격 후보로 올렸다. 서비스에서 가장 많이 재사용되는 «흰 카드 한 장(이미지·칩·이름·설명)» 구조인데 DS에 없어서, DS 문서·스토리·`.prompt.md`로 관리되지 않는다. 다만 `badge` prop이 `BadgeRow` 모양이고 배경 애니메이션·`SafeImage`에 의존해서 그대로는 DS에 들어가지 못한다.

## 상세 요구사항

- 사용자 결정 사항: ① 승격할지 / 서비스 공용으로 둘지 ② 승격한다면 배경(블롭 애니메이션·테마 배경)을 DS에 포함할지, `backgroundSlot` 같은 슬롯으로만 열고 서비스가 채울지 ③ 이미지 컴포넌트(`SafeImage`)를 DS가 모르게 `imageSlot`/`renderImage` prop으로 받을지.
- 승격한다면: DS 원본 `.jsx`·`.d.ts`·`.prompt.md`·`.stories.tsx`·`_ds_manifest.json`·`readme.md` 등록, 서비스 사용처는 `@ds/...` import로 바꾸고 서비스 사본은 지운다(쌍이 아니라 원본 하나로).

## 구현 계획

결정 뒤 확정한다. 5개 이상 파일을 건드리므로 `plan_only` 면제를 위해 파일 단위 계획을 먼저 적는다.

## 완료 조건

- 결정이 «승격»이면: `BadgeHeroSection`이 DS에 있고 서비스 사용처 5곳이 DS를 import한다. 스토리에 `page`·`sheet`·잠긴 개체·이미지 없음이 있다. `ds-sync-check`, 관련 시험, `scripts/verify.sh`가 통과한다.
- 결정이 «유지»이면: 주석의 사유를 현재 상태(4곳 공용)에 맞게 갱신하고 닫는다.
