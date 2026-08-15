---
id: DS-033
status: CLOSED
severity: P2
type: ADD
category: Component / Pattern
---

# DS-033 — CollectionGridCard 패턴 등록 및 서비스 UI 적용

## Problem

배지(아이템북) 컬렉션을 그리드 목록으로 표시하는 화면이 두 곳 존재했으나
각기 다른 인라인 스타일로 구현되어 있고 흰 배경 카드(`bg-surface-inverse`)를 사용해
다크 테마 기조와 불일치했다.

- `BadgesClient.tsx` 아이템북 탭: 수평 리스트 형태 (`flex-col`), 화이트 Card
- `ProfileClient.tsx` itembooks 탭: 2열 그리드, 화이트 카드 인라인 구현

## Figma 출처

사용자 제공 CSS 스펙 (2026-08-15)

## Design Spec

| 항목 | 값 |
|---|---|
| 카드 배경 | 없음 (페이지 배경 `#000` 위에 직접 배치) |
| 썸네일 영역 | 흰 배경(`#FFFFFF`), 1:1 비율, `--radius-cards` 16px |
| 완성 배지 | `top-2 left-2`, `bg-[#E8461F]` 레드오렌지, 흰 텍스트 10px, 알약형 |
| 타이틀 | 15px Bold, 흰색(`--color-text`), 1줄 truncate |
| 진행 바 | 높이 6px, 트랙 `bg-white/20`, 채움 `bg-[#E8461F]` |
| 슬롯 카운트 | 11px, `--color-text-secondary` |
| 클릭 피드백 | `active:scale-[0.98]` |

## Solution

`src/components/ui/CollectionGridCard.tsx` 신규 컴포넌트 등록.

### Props

| prop | 타입 | 설명 |
|---|---|---|
| `name` | `string` | 컬렉션 이름 |
| `imageUrl` | `string \| null` | 썸네일 이미지 URL |
| `collected` | `number` | 수집한 슬롯 수 |
| `total` | `number` | 전체 슬롯 수 |
| `completed` | `boolean` | 완성 배지 표시 여부 |
| `href` | `string` | Link 모드 |
| `onClick` | `() => void` | Button 모드 |
| `className` | `string` | 컨테이너 오버라이드 |
| `children` | `ReactNode` | 하단 추가 콘텐츠 |

### 적용 범위

| 파일 | 변경 내용 |
|---|---|
| `components/ui/CollectionGridCard.tsx` | 신규 생성 |
| `app/(main)/badges/BadgesClient.tsx` | 아이템북 탭: flex-col 리스트 → 2열 그리드 + CollectionGridCard |
| `app/(main)/profile/ProfileClient.tsx` | itembooks 탭: 인라인 카드 → CollectionGridCard |

## 의사결정

- **카드 배경 없음**: Figma 스펙이 썸네일 바깥에 카드 배경 없이 설계됨 — 흰 썸네일이 다크 페이지 배경 위에 직접 노출되는 방식.
- **BadgesClient 레이아웃 변경 (리스트 → 그리드)**: Figma 스펙이 그리드 타일 디자인이므로 기존 수평 리스트 레이아웃을 `grid-cols-2`로 변경.
- **완성 배지 위치**: Figma 스펙 준수 — `top-left` (기존 ProfileClient는 `top-right`였음).
- **진행 바 색상**: Figma 스펙 `#E8461F` (common 희귀도 레드오렌지) 직접 사용.
- **불필요 import 정리**: `BadgesClient.tsx`에서 `Link`, `Image`, `ChevronRightIcon` 제거.

## 테스트

- TypeScript 타입 오류 없음 (`npx tsc --noEmit`)

## 배포 정보

- 날짜: 2026-08-15
- 환경: staging 브랜치
- 커밋: (이하 참조)
