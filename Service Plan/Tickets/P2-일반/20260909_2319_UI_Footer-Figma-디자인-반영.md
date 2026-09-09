---
id: 20260909_2319
category: UI
priority: P2
status: CLOSED
created: 2026-09-09
closed: 2026-09-09
---

# [UI] Footer 컴포넌트를 Figma 디자인으로 변경

## 배경 / 문제 정의
Figma 디자인(https://www.figma.com/design/UXcBEgFagmO5ARwH5F0mMW/asset?node-id=13-39)에
맞춰 전역 Footer(`src/components/ui/Footer.tsx`)를 재구성한다. 기존 Footer와 비교했을 때
배경색·정렬 방향·링크 배치·로고 유무가 모두 다르다.

## Figma 디자인 상세 (get_design_context 조회 결과, nodeId 13:39, fileKey UXcBEgFagmO5ARwH5F0mMW)

- 배경: `#2f2f2f`, 컨테이너 기준 폭 430px(모바일 기준, 실제로는 화면 폭에 맞춰 반응)
- 좌측 정렬(현재는 가운데 정렬), 세로 flex, 블록 간 gap 40px
- 텍스트 3블록 (모두 흰색, 15px, line-height 28px, Pretendard Regular):
  1. 슬로건 2줄: "JAM!은 삐끗할 때도 있습니다." / "하지만 곧 바로 잡습니다."
  2. 링크 2개가 **세로로** 쌓임(현재는 가로 배치): "Philosophy" / "개인정보처리방침"
  3. 저작권: "© 2026 Standard Manual" — **로고 이미지 없이 텍스트만**

## 상세 요구사항

### 서비스/코드베이스 관점
- `src/components/ui/Footer.tsx` 수정. MODULAR에 대응 병존 구현 없음(확인 완료) — 신규
  컴포넌트 생성 불필요, 이 파일만 고치면 됨
- 레이아웃을 가운데 정렬(`items-center`) → 좌측 정렬(`items-start`)로 변경
- Philosophy·개인정보처리방침 링크를 가로(`flex-row`) → 세로(`flex-col`) 배치로 변경.
  **기존 히트박스 규칙(`min-h-11`, `-my-4`로 늘어난 높이 상쇄, active:opacity-60)은 그대로
  유지** — 접근성 회귀 금지, 세로 배치에 맞게 마진 상쇄 값만 재계산
- 배경색 `#2f2f2f`: 프로젝트 색상 토큰에 정확히 일치하는 값이 없음(가장 가까운 건
  `--color-surface-elevated: #1f1f1f`, `--color-bg-tint: #222222` — 둘 다 다른 값).
  **새 값을 하드코딩하지 말고**, 먼저 디자인 시스템 토큰에 `#2f2f2f`와 일치하거나 매우 가까운
  기존 토큰이 있는지 다시 전수 확인하고, 없으면 이 배경색을 하드코딩할지 신규 토큰을 추가할지
  판단해 근거를 완료 기록에 남길 것
- 로고 이미지(`/jam-logo-white.png`) 제거 여부: Figma 디자인에는 로고가 없다. 디자인대로
  제거하되, 완료 기록에 "로고 제거함"을 명시할 것(브랜드 자산 노출 감소이므로 리뷰에서
  짚을 수 있게)
- `FOOTER_EXCLUDED_PATHS` 등 기존 조건부 렌더링 로직·주석에 남은 배경(z-10 승격 등)은 이번
  변경과 무관하므로 그대로 유지

### UI/UX 관점
- 슬로건 문구가 기존 i18n(`d.common.footerSlogan`: "JAM은 삐끗할 때도 있습니다. 하지만 곧
  바로 잡습니다.")과 Figma 디자인("JAM!은 삐끗할 때도 있습니다." 두 줄로 줄바꿈, 느낌표 위치도
  다름)이 다르다. **Figma 디자인 문구·줄바꿈 그대로 반영**하고, `ko.ts`의 `footerSlogan`
  값도 함께 갱신할 것
- 저작권 문구도 Figma는 "© 2026 Standard Manual"이고 기존 i18n은 "© 2026 Standard Manual
  All Rights Reserved."다. **Figma 문구 그대로 반영**하고 `footerCopyright` 값도 갱신할 것
- 두 문구 모두 `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 기준에 맞는지 함께 확인
- Footer는 전역 컴포넌트이므로, 배경색이 투명 → 짙은 회색으로 바뀌면서 Footer를 노출하는
  모든 화면(홈/드랍/철학/개인정보처리방침 제외 전체)에서 페이지 배경과 어색하게 끊기지
  않는지 확인할 것

## 구현 계획
Figma 스크린샷·`get_design_context` 결과를 참고해 `Footer.tsx`의 컨테이너·타이포그래피·
배치를 다시 짠다. 텍스트 문구는 `ko.ts`에서 갱신한다. 배경색 토큰 확인 후 적용한다. 로컬
`next dev`에서 실렌더로 확인하고, Footer가 노출되는 대표 화면(예: `/badges`, `/profile`)
몇 곳에서 스크린샷으로 검증한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`Footer.tsx`를 Figma 디자인(nodeId 13:39)에 맞춰 재구성했다: 가운데 정렬 → 좌측 정렬,
슬로건/링크 2개/저작권 세로 3블록(gap 40px), 배경 `bg-transparent` → `bg-[#2f2f2f]`(기존
색상 토큰에 정확히 일치하는 값이 없어 하드코딩 + 근거 주석), Philosophy·개인정보처리방침
링크를 가로 → 세로 배치, 로고 이미지 제거하고 저작권 텍스트만 유지. `ko.ts`의
`footerSlogan`·`footerCopyright` 문구도 Figma 표기 그대로 갱신했다.

인터페이스 리뷰에서 세로 배치 전환 후 두 링크 히트박스가 16px 겹치는 HIGH 등급 접근성
결함이 발견되어, 가로 배치 시절 상쇄용이던 `-my-4`를 제거해 겹침을 해소했다(재검증 완료).

### 변경된 파일
```
jam-web/src/components/ui/Footer.tsx
jam-web/src/lib/i18n/ko.ts
```

### 테스트 결과
- [x] `npm run lint` 전체 실행 — 에러 0건, 경고 13건(모두 이번 변경과 무관한 기존 항목)
- [x] `npx tsc --noEmit` — 오류 0건
- [ ] 실렌더 확인 — 워크트리 환경 제약으로 로컬 next dev를 띄우지 못해 staging 배포 후
      육안 확인 필요 (잔여 이슈에 기록)

### UX Writing 검증
- [x] 용어 일관성: 신규 고정 용어 없음, Figma 지정 문구 그대로 반영
- [x] 톤앤매너: 기존 슬로건 톤 유지
- [x] 문장 규칙: 해요체 대상 아님(브랜드 슬로건·저작권 표기)
- [x] 표기 규칙: 저작권 연도·표기 Figma 그대로 반영

### 배포 정보
- 배포일: 2026-09-09 (staging 머지)
- 환경: staging
- 커밋: cd62f8d2d0642fb25d16c2dd0b6918ffb4caba2f (머지 커밋)

### 주요 의사결정 / 핵심 메모
- 배경색 `#2f2f2f`는 기존 토큰(`--color-surface-elevated` #1f1f1f, `--color-bg-tint`
  #222222, `--color-base-grey-700` #2a2a2a) 전수 대조 후 일치하는 값이 없어 하드코딩.
  Footer 단일 용도라 신규 시맨틱 토큰은 만들지 않았고, 재사용처가 생기면 그때 토큰화하기로
  결정(개선 리뷰 제안과 일치)
- `text-[15px] leading-[28px]` 타이포도 기존 스텝(`--text-caption` 12px, `--text-body`
  16px 등)과 일치하지 않아 임의값 사용. 같은 조합이 이 컴포넌트 안에서 3번 반복되므로,
  Footer 외 다른 곳에서도 필요해지면 토큰 추가를 검토할 것
- MODULAR 승격 후보 없음(design-system에 Footer 대응 컴포넌트 없음, 신규 UI 생성도 아님)

### 잔여 이슈
- 인터페이스 리뷰가 제안한 두 항목은 참고용으로 남김(병합 차단 대상 아님):
  - `15px/28px` 임의값이 Footer 외 다른 곳에서도 필요해지면 시맨틱 토큰화 검토
  - `/jam-logo-white.png`가 Footer 외 다른 곳에서도 쓰이는지 확인해 죽은 자산 여부 점검

### 후속 수정 (2026-09-09, 실렌더 확인 후 사용자 피드백 반영)
staging 배포 후 `/badges`에서 실렌더 확인한 결과, 세 가지 폴리시 수정 요청을 받아 반영:
1. **배경색**: `#2f2f2f` 하드코딩 → `bg-transparent`로 되돌림. 부모 `<main>`의 페이지 배경
   (`bg-surface`, 화면마다 다른 원색 풀블리드 배경)과 톤이 달라 튀어 보인다는 피드백.
   Figma가 지정한 배경색보다 "페이지와 이질감 없이 자연스럽게" 보이는 쪽을 우선했다 —
   위 "주요 의사결정"의 배경색 하드코딩 근거는 이 변경으로 더 이상 유효하지 않다
2. **Philosophy·개인정보처리방침 링크 사이 공백**: 컨테이너 `gap-[var(--spacing-16)]` →
   `gap-0`. 각 링크가 `min-h-11`(44px) 히트박스인데 텍스트(28px)가 그 안에서 중앙 정렬되어
   위아래 8px씩 여백이 생기고, 거기에 gap 16px까지 더해져 텍스트 사이 시각적 공백이 32px로
   과하게 벌어져 보였다. gap을 0으로 줄여도 히트박스 44px는 그대로 맞닿을 뿐 겹치지 않으므로
   (인터페이스 리뷰가 지적했던 겹침 결함과는 다른 상황 — 그때는 음수 마진으로 박스 자체가
   겹쳤던 것), 텍스트 사이 실제 간격만 16px(8+8)로 줄어들고 접근성 회귀는 없다
3. **슬로건/링크/저작권 블록 간 간격**: `gap-[var(--spacing-40)]`(40px, Figma 원안 값) →
   `gap-[var(--spacing-24)]`(24px)로 축소. Figma 스펙보다 실제 화면에서 더 조밀한 배치를
   선호한다는 피드백

**변경된 파일**: `jam-web/src/components/ui/Footer.tsx`
**테스트**: `npx eslint src/components/ui/Footer.tsx` 통과(경고·에러 없음)
**배포**: staging (커밋은 push 후 갱신)
