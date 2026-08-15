---
id: DS-032
status: CLOSED
severity: P2
type: ADD
category: Component / Pattern
---

# DS-032 — ListRowCard 패턴 등록 및 서비스 UI 일괄 적용

## Problem

가로로 긴 목록형 UI(포인트 내역, 팔로잉/팔로워, 유저 검색, 최근활동 피드 등)가
각 화면마다 다른 인라인 스타일로 구현되어 있고, 흰 배경 카드(`bg-surface-inverse`)를
사용해 다크 테마 기조와 불일치했다.

## Design Spec

| 항목 | 값 |
|---|---|
| 카드 배경 | `--color-surface` (#1a1a1a) |
| 카드 테두리 | `--color-border` (#2a2a2a) inset 1px |
| 카드 radius | `--radius-cards` (16px) |
| 카드 padding | `--spacing-16` (16px) |
| 구조 | `[icon 40×40] [text: title + subtitle] [trailing]` |
| 타이틀 | `--text-body`, 흰색 |
| 서브타이틀 | `--text-body-sm`, `--color-text-secondary` |
| 값(trailing 기본) | 17px, `#8A5A2E` (포인트 금액 등) |
| 클릭 피드백 | `active:scale-[0.98]` (interactive 시) |

## Solution

`src/components/ui/ListRowCard.tsx` 신규 컴포넌트 등록.

### Props

| prop | 타입 | 설명 |
|---|---|---|
| `icon` | `ReactNode` | 40×40 아이콘 영역 (크기·형태·배경 호출부 결정) |
| `title` | `string` | 메인 텍스트 |
| `subtitle` | `ReactNode` | 서브 텍스트 (string 이면 자동 스타일 적용) |
| `trailing` | `ReactNode` | 우측 영역 (값 텍스트, 버튼, 아이콘 등) |
| `children` | `ReactNode` | 텍스트 영역 전체 커스텀 (FeedCard처럼 복잡한 레이아웃용) |
| `href` | `string` | Link 모드 |
| `onClick` | `() => void` | Button 모드 |
| `className` | `string` | 컨테이너 오버라이드 |

### 적용 범위

| 파일 | 변경 내용 |
|---|---|
| `components/ui/ListRowCard.tsx` | 신규 생성 |
| `app/(main)/points/page.tsx` | 포인트 내역 행 → ListRowCard (CoinIcon 원형 + 금액 trailing) |
| `app/(main)/search/page.tsx` | 유저 검색 결과 → ListRowCard (아바타 + username + 화살표) |
| `app/(main)/FeedSection.tsx` | FeedCard → ListRowCard (이벤트 아이콘 + 복합 텍스트 children) |
| `app/(main)/profile/ProfileClient.tsx` | 팔로잉/팔로워 목록 → ListRowCard (아바타 + username + Follow 버튼) |
| `app/(main)/[username]/followers/page.tsx` | 팔로워 목록 → ListRowCard |
| `app/(main)/[username]/following/page.tsx` | 팔로잉 목록 → ListRowCard |

## 의사결정

- **화이트 카드 → 다크 카드**: 기존 `<Card>`(흰 배경 `bg-surface-inverse`)에서 `bg-surface`(다크)로 전환 — DS v2 방향성 통일.
- **padding `--spacing-16`**: Figma 스펙은 24px이나, 기존 피드카드·팔로워 카드가 모두 16px을 사용해 통일.
- **children 슬롯**: FeedCard처럼 event label + badge name + sub + tags가 3단으로 구성되는 복잡한 경우를 위해 텍스트 영역 전체를 커스텀할 수 있는 `children` prop 제공.
- **서버 컴포넌트 followers/following 페이지**: `e.stopPropagation()` 인라인 핸들러를 서버 컴포넌트에서 쓸 수 없으므로, ListRowCard의 `href`를 사용하지 않고 내부 Link + trailing FollowButton 패턴 유지 (카드 컨테이너만 ListRowCard 스타일 적용).
- **포인트 내역 구조 변경**: 기존 단일 `<Card>` 안에 행을 묶고 divider를 쓰던 방식 → 개별 ListRowCard로 분리. CoinIcon을 아이콘 원형에 사용.

## 테스트

- TypeScript 타입 오류 없음 (`npx tsc --noEmit`, 테스트 파일 제외)
- 적용 대상 6개 파일 변경 완료

## 배포 정보

- 날짜: 2026-08-15
- 환경: staging 브랜치
- 커밋: (이하 참조)
