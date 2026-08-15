---
id: DS-031
status: CLOSED
severity: P2
type: ADD
category: Component / Pattern
---

# DS-031 — BadgeGridCard 패턴 등록 및 서비스 UI 일괄 적용

## Problem

배지 메뉴·인벤토리·믹스·아이템북 상세 등 그리드 타입 배지 목록이 존재하는 모든 화면에서
배지 카드 UI가 각자 다른 인라인 코드로 구현되어 있어 일관성이 없었다.

- `BadgesClient.tsx`: `<Card>` (화이트 카드) + 72px 썸네일 + 2줄 고정 이름박스
- `SlotGrid.tsx`: 테두리만 있는 div + 64px 썸네일
- `InventoryGrid.tsx`: 화이트 카드 + full-width aspect-square 썸네일 + 만료일
- `CombineClient.tsx`: 테두리만 있는 button + 56px 썸네일

## Figma 출처

`https://www.figma.com/design/SxKAaTkcjHy4WYLH6rx736/JAM?node-id=38-1000`
(item-card/용린 갑옷)

## Design Spec

| 항목 | 값 |
|---|---|
| 카드 배경 | `--color-surface` (#1a1a1a) |
| 카드 테두리 | `--color-border` (#2a2a2a) inset 1px |
| 카드 radius | `--radius-card` (16px) |
| 카드 padding | `--spacing-12` (12px) |
| 썸네일 | 90×90px, `--radius-card`, `bg-white/10` placeholder |
| 이름 | 11px Bold, `--color-text`, 1줄 truncate |
| 희귀도 배지 | 기존 `RarityBadge` 컴포넌트 재사용 |
| 클릭 피드백 | `active:scale-95` (interactive 시) |

## Solution

`src/components/ui/BadgeGridCard.tsx` 신규 컴포넌트 등록.

### Props

| prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `name` | `string` | — | 배지 이름 |
| `imageUrl` | `string \| null` | — | 배지 이미지 URL |
| `rarity` | `BadgeRarity` | — | 희귀도 |
| `href` | `string` | — | Link 모드 |
| `onClick` | `() => void` | — | Button 모드 |
| `earned` | `boolean` | `true` | false = 썸네일 흑백+반투명 |
| `undiscovered` | `boolean` | `false` | true = ??? 표시 + 흑백 |
| `selected` | `boolean` | `false` | 강조 링 (select 모드) |
| `className` | `string` | — | 컨테이너 오버라이드 |
| `children` | `ReactNode` | — | 하단 추가 콘텐츠 (만료일, 슬롯버튼 등) |

### 적용 범위

| 파일 | 변경 내용 |
|---|---|
| `components/ui/BadgeGridCard.tsx` | 신규 생성 |
| `app/(main)/badges/BadgesClient.tsx` | 액티비티·POI 배지 그리드 → BadgeGridCard |
| `app/(main)/itembooks/[id]/SlotGrid.tsx` | 슬롯 그리드 → BadgeGridCard (슬롯/해제 버튼은 children) |
| `components/inventory/InventoryGrid.tsx` | 인벤토리 카드 → BadgeGridCard (만료일은 children) |
| `app/(main)/combine/CombineClient.tsx` | 내아이템 그리드 → BadgeGridCard |

## 의사결정

- **화이트 카드 → 다크 카드**: Figma 스펙이 `--color-surface`(다크) 기반이므로 따름. 기존 `<Card>`(화이트) 패턴에서 전환.
- **썸네일 90px 고정**: Figma 스펙. 3열 그리드 셀 ~114px에서 카드 패딩 12px을 제하면 90px이 맞게 들어감.
- **이름 11px**: Figma 스펙. 그리드 공간상 16px(`--text-body-sm`)보다 조밀하게.
- **children 슬롯**: `SlotGrid`의 슬롯/해제 버튼, `InventoryGrid`의 만료일 등 화면별 추가 콘텐츠를 수용하기 위해 범용 `children` prop 제공.

## 테스트

- TypeScript 타입 오류 없음 (`npx tsc --noEmit` 통과, 기존 테스트 타입 오류 제외)
- 배지 메뉴·인벤·믹스·아이템북 상세 4개 화면 코드 적용 완료

## 배포 정보

- 날짜: 2026-08-15
- 환경: staging 브랜치
- 커밋: (아래 commit 후 기입)
