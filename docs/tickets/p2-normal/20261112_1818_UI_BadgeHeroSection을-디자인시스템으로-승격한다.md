---
id: "20261112_1818"
category: UI
priority: P3
status: CLOSED
closed: 2026-11-12
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

사용자 결정(2026-11-12): **슬롯으로 열어 승격한다.** DS는 DB 타입·`SafeImage`·블롭 애니메이션·테마 판정 유틸을 모른다. 서비스에는 얇은 어댑터 한 벌이 남아 5곳이 이를 함께 쓴다(5곳이 각각 어댑터를 만들지 않는다).

파일 단위 계획(경로 기준 `jam-web/`):

1. **DS 신규** `design-system/components/cards/BadgeHeroSection.jsx` — 현재 `src/components/BadgeHeroSection.tsx`의 마크업(103~200행)을 옮긴다. props: `name`, `rarity`, `level`(칩은 DS의 `RarityBadge`·`BadgeLevelChip`을 그대로 씀), `hasEarned`, `descriptionLines`(문자열 배열, 문장 나누기는 호출부), `imageSlot`(없으면 `MedalIcon` 대체 대신 빈 자리가 아니라 호출부가 항상 채움), `chipExtra`, `titleNode`, `descriptionNode`, `backgroundSlot`(카드 안 최하단 z-0 레이어), `backgroundColor`(첫 페인트 폴백), `onMedia`(글자 흰색 여부), `textStyle`(텍스트 블록 그림자 보정), `size`(`page`|`sheet`, 지금 `SIZE_STYLE` 값 그대로). 서비스 import를 하나도 쓰지 않는다. 색은 토큰만.
2. **DS 신규** `BadgeHeroSection.d.ts`, `BadgeHeroSection.prompt.md`(영어, 다른 `.prompt.md` 형식), `BadgeHeroSection.stories.tsx`(page·sheet·잠긴 개체(chipExtra·titleNode·descriptionNode)·이미지 없음·배경 슬롯 있음), `_ds_manifest.json`·`readme.md` 등록(기존 `SlotOutline` 등록 방식을 따름).
3. **서비스 어댑터** `src/components/BadgeHeroSection.tsx` — 파일 이름·`BadgeHeroSectionProps`(BadgeRow 모양 `badge`, `themedBackground`, `backgroundAnimation`, 슬롯들)를 **그대로 유지**해 사용처 5곳의 코드를 바꾸지 않는다. 안에서 `hasBadgeBackgroundTheme`·`getBadgeThemedTextStyle`로 `onMedia`·`textStyle`을 계산하고, `SafeImage`/`MedalIcon`으로 기본 `imageSlot`, `BlobAnimationBackground`로 `backgroundSlot`, `splitDescriptionSentences`로 `descriptionLines`를 만들어 DS를 렌더한다. 파일 위 주석의 «MODULAR 신규 컴포넌트 아님(20260816_006 선례)»를 현재 사실(DS 승격, 이 파일은 어댑터)로 고친다.
4. **사용처 5곳은 코드 변경 없음**(`badges/[id]/page.tsx`, `inventory/[itemId]/LockedItemDetail.tsx`, `drops/BadgeDetailSheet.tsx`, `admin/badges/BadgeDetailPreviewFrame.tsx`, `dev-sample/item-badge-serial/page.tsx`). 렌더 결과(DOM·클래스)는 지금과 같아야 한다.
5. **시험**: 기존 `heroLayout`·`heroTextColor`·`page.locked`·`checkinDetail`·`LockedItemDetail`·`serviceLiteralColors` 시험이 그대로 통과해야 한다. DS 컴포넌트 단독 시험 `src/components/ui/__tests__/BadgeHeroSection.test.tsx`(page·sheet 클래스, onMedia 색, 슬롯 렌더)를 더한다.
6. **문서**: `docs/service/prd/`에서 배지 상세·체크인 시트 PRD 중 이 컴포넌트를 적은 곳, DS 목록 문서가 있으면 갱신.

## 완료 조건 보충

- 사용처 5곳이 렌더하는 DOM이 승격 전과 같다(기존 시험으로 확인).
## 완료 조건

- 결정이 «승격»이면: `BadgeHeroSection`이 DS에 있고 서비스 사용처 5곳이 DS를 import한다. 스토리에 `page`·`sheet`·잠긴 개체·이미지 없음이 있다. `ds-sync-check`, 관련 시험, `scripts/verify.sh`가 통과한다.
- 결정이 «유지»이면: 주석의 사유를 현재 상태(4곳 공용)에 맞게 갱신하고 닫는다.

## 구현 기록 (2026-11-12, 아현)

- 부류: **연결된 컴포넌트 신규 편입**(21종 → 22종, `ds-connection-scope.md` 갱신). 병존 구현(`src/components/ui/`에 동명 파일) 해당 없음 — 병존 구현을 고치지 않았다.
- DS 신규: `design-system/components/cards/BadgeHeroSection.{jsx,d.ts,prompt.md,stories.tsx}`, `_ds_manifest.json`(SlotOutline 다음 줄)·`readme.md` 등록. 서비스 import와 색 리터럴 0개. 마크업의 Tailwind 클래스 문자열을 그대로 유지했다(DS 첫 선례; 사유는 prompt.md·스토리 설명에 적었다).
- 채원 판정 조정: `hasEarned`는 DS props에서 뺐고(어댑터가 기본 이미지 슬롯에 grayscale·opacity-50을 건다), `imagePx`·`imageBox`는 어댑터의 SIZE 표에 남겼다(DS에는 wrapper·card 클래스만).
- 어댑터 `src/components/BadgeHeroSection.tsx`: 이름·props 그대로, DS를 렌더. 머리 주석을 현재 사실로 고쳤다. 영향 호출부 5곳(`badges/[id]/page.tsx`, `inventory/[itemId]/LockedItemDetail.tsx`, `drops/BadgeDetailSheet.tsx`, `admin/badges/BadgeDetailPreviewFrame.tsx`, `dev-sample/item-badge-serial/page.tsx`)의 코드 변경은 0줄.
- 시험: `src/components/ui/__tests__/BadgeHeroSection.test.tsx` 추가(7건). `serviceLiteralColors.test.ts` FILES에 DS 파일 추가. 기존 6종(`heroLayout`·`heroTextColor`·`page.locked`·`checkinDetail`·`LockedItemDetail`·`serviceLiteralColors`)은 수정 없이 통과.
- 문서: `ds-connection-scope.md`, `docs/service/prd/inventory/PRD.md`(체크인 시트 카드 설명).
- 남은 확인(병합 뒤 메인 트리): `next dev`로 배지 상세·체크인 시트·잠긴 상세를 열어 클라이언트/서버 경계와 Tailwind가 design-system/ 안의 클래스(`gap-4 p-6`, `text-snow`)를 생성하는지 실렌더로 확인, Storybook(:6006)에서 흰 카드·칩·이름·설명 배치를 서비스 화면과 눈으로 대조.


## 완료 기록

### 구현 내용 요약
- 사용자 결정(2026-11-12): «슬롯으로 열어 승격». 채원① 판정: MODULAR 확장(신규 DS 컴포넌트 `cards/BadgeHeroSection`), 서비스는 얇은 어댑터. 새 토큰 없음. 마크업의 Tailwind 클래스는 그대로 유지(기존 시험 6종이 클래스 문자열을 단언하므로, DS 첫 선례).
- 서비스 어댑터 `src/components/BadgeHeroSection.tsx`는 이름·props를 유지해 사용처 5곳의 코드 변경은 0줄이다. 원래 티켓의 «서비스 사본을 지운다»와 달리 어댑터 한 벌이 남는다(BadgeRow·SafeImage·블롭 애니메이션·테마 판정을 DS가 모르게 하려는 결정의 결과).
- 게이트 WARN(실렌더 미확인)을 카리나가 머지 뒤 메인 트리 `next dev`로 해소: `/dev-sample/item-badge-serial`에서 카드 간격 16px·안쪽 여백 24px·흰 면·반경 16px, 제목 30px 굵게, 설명 16px `#666`·일반 줄바꿈, 바깥 여백 `0 16 20`으로 승격 전 규격과 같았다. Tailwind가 `design-system/` 안의 클래스를 생성함을 확인했다. 콘솔 오류는 HMR 웹소켓뿐이다.
- 확인하지 못한 항목: Storybook(:6006) 눈 대조, 체크인 시트(`sheet`)·잠긴 상세·배경 애니메이션이 있는 상세의 실렌더(시험은 통과).
- 후속: 티켓 20261112_1848(Tailwind 의존 정리 검토).

### 실행 지표
| 실행 | 에이전트 수 | 출력 토큰 | 전체 토큰 | 소요 |
|---|---|---|---|---|
| 1818 승격(판정·구현·게이트·디자인 리뷰) | 4 | 62,662 | 309,878 | 약 17분 |
| 합계 | 4 | 62,662 | 309,878 | 약 17분 |
