---
id: 20260909_2319
category: UI
priority: P2
status: OPEN
created: 2026-09-09
closed:
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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
