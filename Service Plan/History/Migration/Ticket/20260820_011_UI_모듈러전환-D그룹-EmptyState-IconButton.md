---
id: 20260820_011
category: UI
status: OPEN
created: 2026-08-20
---

# [UI] 모듈러 전환 D그룹 — EmptyState 전면 전환 + IconButton 효과 통일

## 배경 / 문제 정의

티켓 20260820_007 조사에서 D그룹으로 분류된 컴포넌트 중, 사용자 의사결정(20260820_010 참고)에
따라 이번 라운드에서 실제로 전환하는 2개만 다룬다:

1. **EmptyState** — `design-system/components/feedback/EmptyState.jsx`는 아이콘+타이틀(h4)+
   설명(body)+선택적 CTA 버튼(`action:{label,onClick}`) 4단 구조, `role="status"`. 서비스는
   15곳 이상에서 전부 텍스트 한 줄(또는 두 줄)만 렌더링하는 로컬 구현을 쓴다 — 아이콘도
   CTA 버튼도 없음. **사용자 결정: 일괄 풀 구조로 전환.** 즉 15곳 전부 아이콘+타이틀+설명 형태로
   시각적으로 확대된다 — 화면마다 새 제목/설명 문구를 UX 라이팅 가이드에 맞게 새로 작성해야 한다.

2. **IconButton** — `design-system/components/buttons/IconButton.jsx`는 44px 원형, 투명 배경,
   `icon`(7종 프리셋: chevron-left/right, close, check, info, search, menu) + `label`(필수) prop.
   서비스 호출처(`BottomSheet.tsx`, `DropsClient.tsx`, `FeedSection.tsx`, `MapView.tsx` 등)는
   각자 `active:scale-90/95`, 그림자, 배경색(`bg-white` 등), `--radius-nav-buttons` 같은 DS에
   없는 개별 효과를 얹고 있다. **사용자 결정: DS 기본값으로 통일(효과 제거)** — 그림자·scale·
   배경색 커스텀을 전부 제거하고 DS의 44px 투명 원형으로 맞춘다. 시각적으로 통일되지만
   일부 화면에서 클릭 피드백이 약해질 수 있음.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **EmptyState 전환** (15곳 이상 — 정확한 개수는 `grep -rn "\.length === 0"` 등으로 구현 시
   전수 확인):
   - `missions/MissionsListClient.tsx`, `inventory/page.tsx`, `[username]/followers/page.tsx`,
     `[username]/following/page.tsx`, `drops/DropsClient.tsx` 등 (조사 시점 확인된 대표 목록,
     구현 시 전수 grep으로 누락 확인)
   - 각 화면마다 `<EmptyState icon title description />`로 교체. `title`/`description` 문구는
     기존 텍스트를 최대한 재사용하되, 한 줄이던 문구를 "제목+설명" 2단으로 나눠야 하는 화면은
     UX_WRITING_GUIDELINE.md 기준으로 새로 작성 (짧고 명확하게, 해요체).
   - CTA 버튼(`action`)은 문맥상 명확한 다음 행동이 있는 화면에만 추가한다(예: "검색해보세요"
     같은 액션 유도가 자연스러운 곳). 없는 화면은 `action` 생략.
2. **IconButton 전환**:
   - 4곳(`BottomSheet.tsx`, `DropsClient.tsx`, `FeedSection.tsx`, `MapView.tsx`) 우선 확인,
     구현 시 `w-11 h-11` 또는 `44px` 원형 인라인 버튼 패턴을 전수 grep으로 추가 확인.
   - `<IconButton icon="close" label="닫기" onClick={...} />` 형태로 교체. 기존 그림자·scale·
     배경색 커스텀 className은 제거(DS 기본값 사용). 단 `MapView.tsx`의 지도 위 버튼처럼 배경이
     없으면 지도 배경에 묻혀 시인성이 사라지는 경우가 있는지 반드시 확인 — 그런 경우 발견 시
     즉시 HALT하고 오케스트레이터에 보고(사용자 결정과 충돌하는 예외 케이스이므로 임의 판단 금지).
   - DS IconButton의 7종 프리셋(`chevron-left/right, close, check, info, search, menu`) 밖의
     아이콘을 쓰는 호출처는 전환 대상에서 제외하고 잔여 이슈에 기록.

### UI/UX 관점

- EmptyState 신규 작성 문구는 `Specs/UX_WRITING_GUIDELINE.md` 전수 점검 대상(용어 일관성·
  톤앤매너·문장 규칙).
- IconButton 효과 제거로 시인성이 떨어지는 화면이 있으면 전환하지 말고 잔여 이슈로 남길 것.

## 구현 계획

1. EmptyState 실사용처 전수 grep → 화면별 문구 초안 작성 → 전환
2. IconButton 실사용처 전수 grep → 배경 필요 여부 확인 → 전환(배경 필요한 곳은 예외 처리)
3. staging에서 dev-login으로 실제 화면 확인 (미션·인벤토리·팔로워 등 EmptyState 노출 화면,
   BottomSheet·DropsClient 등 IconButton 노출 화면)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- EmptyState: 서비스 14개 파일·22개 호출 지점(요구 "15곳 이상" 충족)을 아이콘+타이틀+설명 풀
  구조로 전환. 로컬 `EmptyState`/텍스트 한 줄 패턴을 `design-system/components/feedback/EmptyState.jsx`로
  교체. 신규 문구는 `Specs/UX_WRITING_GUIDELINE.md` 기준(해요체·간결함)으로 작성해 `src/lib/i18n/ko.ts`에
  title/description(body) 쌍으로 추가.
- IconButton: **전환하지 못했다.** 대상 4곳(BottomSheet.tsx / DropsClient.tsx / FeedSection.tsx /
  MapView.tsx) 전수 조사 결과, 4곳 모두 DS IconButton으로 교체 시 시인성이 사라지는 구조적 문제를
  발견해 HALT 처리했다 — 아래 "주요 의사결정" 참고. 잔여 이슈로 남긴다.

### 변경된 파일
```
jam-web/src/lib/i18n/ko.ts (EmptyState description 문구 신규 추가)
jam-web/src/app/(main)/FeedSection.tsx
jam-web/src/app/(main)/page.tsx
jam-web/src/app/(main)/combine/CombineClient.tsx
jam-web/src/app/(main)/missions/MissionsListClient.tsx
jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx
jam-web/src/app/(main)/itembooks/[id]/page.tsx
jam-web/src/app/(main)/search/page.tsx
jam-web/src/app/(main)/points/page.tsx
jam-web/src/app/(main)/[username]/followers/page.tsx
jam-web/src/app/(main)/[username]/following/page.tsx
jam-web/src/app/(main)/[username]/itembooks/page.tsx
jam-web/src/app/(main)/inventory/page.tsx
jam-web/src/app/(main)/profile/ProfileClient.tsx
jam-web/src/app/(main)/badges/BadgesClient.tsx
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 변경 파일 범위 내 타입 에러 없음(테스트 파일의 사전 존재 jest 타입
      누락 에러는 이번 변경과 무관)
- [x] `npx eslint <변경 파일 전체>` — 신규 lint 에러/경고 없음(사전 존재 warning 3건은 이번
      변경과 무관함을 `git stash` 비교로 확인)
- [ ] staging 실 화면 확인 — 이 브랜치는 아직 `jam-stage.vercel.app`에 병합되지 않아 dev-login으로도
      실 화면을 볼 수 없다. staging 병합 후 화면 확인 필요.

### UX Writing 검증
- [x] 용어 일관성: 고정 용어만 사용 (드랍·픽업·컬렉션·인벤토리·참가 등 신규 문구도 표 기준 준수)
- [x] 톤앤매너: 안내(담담) 톤 유지, 배지/포인트 관련 기존 문구 톤과 통일
- [x] 문장 규칙: 해요체, 간결함. 기존 title 문구의 마침표 유무는 그대로 유지(혼재 상태였음 —
      이번 티켓 범위 밖이라 통일하지 않음), description은 기존 이웃 문구와 동일하게 마침표 생략

### 배포 정보
- 배포일:
- 환경: staging
- 커밋:

### 주요 의사결정 / 핵심 메모
- **Card tone="inverse" 안의 EmptyState는 Card 래퍼를 제거하고 페이지 캔버스(어두운 배경) 위에
  직접 배치했다.** DS EmptyState는 아이콘/타이틀/설명 색을 `--color-text`/`--color-text-secondary`로
  하드코딩하는데, 서비스는 `color-scheme: dark` 고정이라 이 토큰이 항상 흰색이다. `Card tone="inverse"`
  (흰 배경)에 그대로 얹으면 흰 텍스트가 흰 배경에 묻혀 보이지 않는다. EmptyState 자체 Storybook 기본
  데모도 카드 없이 캔버스에 직접 배치하는 패턴이라, Card 래퍼 제거가 컴포넌트 설계 의도와 합치한다고
  판단해 진행했다(FeedSection, page.tsx, search/page.tsx, points/page.tsx, profile/ProfileClient.tsx,
  badges/BadgesClient.tsx 6곳 해당).
- **IconButton 전환은 4곳 모두 보류(HALT)했다** — 상세는 alerts 참고. 요약: (1) MapView.tsx는 티켓이
  예상한 대로 지도 위 흰 배경 원형 버튼이라 DS 기본값(투명)으로 바꾸면 시인성이 사라지고, 커스텀
  "현재 위치" 아이콘이라 7종 프리셋 밖이라 애초에 전환 대상도 아니다. (2) BottomSheet.tsx 기본(라이트)
  시트, DropsClient.tsx의 흰 드랍/픽업 패널, FeedSection.tsx의 흰 상세 시트는 모두 흰 배경 위에
  검정 아이콘이 필요한데, DS IconButton의 `surface` prop은 `--color-text`(흰색, light)와
  `--color-bg-inverse`(흰색, dark 둘 다 서비스에서는 흰색으로 귀결)만 참조해 이 서비스 안에서는
  검정 아이콘을 낼 방법이 없다(`colors.light.css`를 로드하지 않는 고정 다크 테마 구조라서).
  즉 IconButton은 이 서비스의 라이트/화이트 표면에서 구조적으로 쓸 수 없다 — DS 컴포넌트 자체
  수정이 필요한 문제라 이번 티켓 범위를 벗어난다.

### 잔여 이슈
- EmptyState 미전환(흰 배경 시트라 동일한 구조적 이유로 보류): `drops/DropsClient.tsx`의
  `dropEmptyTitle`/`dropNoItems`, `inventory/[itemId]/InventoryItemHistorySheet.tsx`의
  `historyEmpty` — 모두 `bg-surface-inverse`(흰 배경) 시트 내부라 EmptyState 하드코딩 흰색
  텍스트가 묻힌다. IconButton과 동일 원인이므로 함께 해결(DS 다크 표면 대응 or 서비스 라이트 시트
  자체를 재검토)이 필요.
- IconButton 4곳 전체 미전환(위 "주요 의사결정" 참고) — DS IconButton이 라이트 표면에서 시인성
  있는 아이콘 색을 낼 수 있도록 컴포넌트 자체를 고치거나(`surface='dark'`가 `--color-text-inverse`를
  참조하도록 수정 등), 대상 화면들을 다크 표면으로 재설계하거나, 이번 전환을 포기하는 것 중 하나를
  사용자가 결정해야 한다.
