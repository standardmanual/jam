---
id: "20261027_1005"
category: UI
priority: P2
status: CLOSED
created: 2026-10-27
closed: 2026-10-27
---

# [UI] 전역 텍스트 설정에 text-wrap balance 및 word-break keep-all 반영

## 핵심 요약
- 요구사항: JAM 디자인시스템과 서비스 전반의 텍스트 설정에 `text-wrap: balance` 및 `word-break: keep-all` 전역 적용
- 구현 계획: `design-system/styles.css`, `design-system/tokens/typography.css`, `src/app/globals.css`, Storybook 설정 및 가이드라인 문서에 기본 텍스트 래핑/줄바꿈 규칙 반영
- 관련 파일: `jam-web/design-system/styles.css`, `jam-web/design-system/tokens/typography.css`, `jam-web/src/app/globals.css`, `jam-web/.storybook/preview.tsx`, `jam-web/design-system/foundations/Typography.stories.tsx`, `docs/service/writing/UX_WRITING_GUIDELINE.md`

## 배경 / 문제 정의
한국어 UI 텍스트에서 단어가 어절 중간에서 끊어지거나, 제목·본문 줄바꿈 시 한 글자만 다음 줄로 넘어가는 고아 단어(orphan words) 현상으로 인해 가독성과 디자인 완성도가 저하되는 문제가 있었다. 서비스 전역과 디자인시스템 레벨에서 일관된 줄바꿈 규칙(`text-wrap: balance`, `word-break: keep-all`)을 기본 적용할 필요가 있었다.

## 상세 요구사항
1. 디자인시스템 기본 바디 및 타이포그래피 토큰에 `text-wrap: balance`, `word-break: keep-all` 추가
2. 서비스 전역 웹 애플리케이션(`globals.css`)의 기본 html/body 및 주요 텍스트 태그에 해당 속성 반영
3. Storybook 미리보기 및 foundations 스토리, 문서 가이드라인(`UX_WRITING_GUIDELINE.md`, `DESIGN.md`)에 규칙 명시

## 구현 계획
1. `design-system/styles.css` 및 `tokens/typography.css`에 전역 텍스트 스타일 정의
2. `src/app/globals.css`에 body 및 기본 텍스트 클래스 스타일 주입
3. `.storybook/preview.tsx` 및 `Typography.stories.tsx`에 프리뷰 스타일 동기화
4. `UX_WRITING_GUIDELINE.md` 및 `DESIGN.md` 문서에 한글 줄바꿈 기본 방침 기록

## 완료 조건
- [x] 서비스 전체 웹 화면에서 한글 단어가 중간에 잘리지 않고 어절 단위로 개행(`keep-all`)됨
- [x] 제목 및 안내 문구에서 줄 균형(`text-wrap: balance`)이 자연스럽게 적용됨
- [x] 디자인시스템 스토리북 및 문서 체계 갱신 완료
- [x] 기존 컴포넌트 렌더링 회귀 없음

---

## 완료 기록

### 구현 내용 요약
- `jam-web/design-system/styles.css`와 `tokens/typography.css`에 `text-wrap: balance`, `word-break: keep-all` 반영
- `jam-web/src/app/globals.css` 전역 스타일에 줄바꿈 규칙 주입
- Storybook preview 및 Typography 스토리 반영
- UX 라이팅 가이드라인 및 디자인 문서 갱신

### 변경된 파일
```
- jam-web/design-system/styles.css
- jam-web/design-system/tokens/typography.css
- jam-web/src/app/globals.css
- jam-web/.storybook/preview.tsx
- jam-web/design-system/foundations/Typography.stories.tsx
- jam-web/design-system/readme.md
- jam-web/DESIGN.md
- docs/service/writing/UX_WRITING_GUIDELINE.md
```

### 테스트 결과
- Storybook 및 Next.js 프로덕션 빌드 정상 통과

### 배포 정보
- 배포일: 2026-10-27
- 환경: staging
- 커밋: f68289615
