@AGENTS.md

# jam-web 작업 규칙

## UI를 만들기 전에 — MODULAR 먼저 탐색한다

새 UI가 필요하면 **코드부터 짜지 않는다.** 순서:

1. **탐색** — `design-system/_ds_manifest.json`(컴포넌트 색인) → `design-system/readme.md` 색인 →
   `**/*.stories.*`(변형·사용례) 순으로 검색한다. Storybook 웹 UI(`npm run storybook`, :6006)는
   사람이 눈으로 확인할 때 쓰고, 코드 탐색에는 위 파일들을 쓴다.
2. **재사용 판단** — 기존 컴포넌트로 해결되면 신규 UI를 만들지 않는다.
3. **신규가 필요하면** — MODULAR에 추가할 가치가 있는지 먼저 판단한다.
   판단 기준과 의사결정 트리는 `/jam-design` 스킬 참조.
4. **MODULAR에 추가하면 Storybook Story를 함께 작성한다.** 컴포넌트만 고치고 Story를 빠뜨리면
   `.githooks/pre-commit`이 경고한다.

**예외**: `src/app/admin/` 어드민 화면은 MODULAR 적용 대상이 아니다 (정책 결정).
어드민 UI는 이 탐색 절차를 거치지 않고 service-specific으로 구현한다.

## 사용자 노출 텍스트는 UX Writing 가이드를 따른다

화면 텍스트·버튼·에러 메시지·알림 등 모든 노출 문구는
`../Service Plan/Specs/UX_WRITING_GUIDELINE.md`를 먼저 확인한다. 핵심:

- **용어**: "획득·드랍·픽업·방문 인증" 등 문서에 정의된 고정 용어만 사용 (신용어는 문서 추가 후)
- **톤**: 상황에 맞게 (배지 획득=신남, 거래=단호, 오류=전문)
- **에러 메시지**: [현상] → [원인] → [해결책] 3단계 구조
- **문장**: 해요체, 간결하게, 제목에 마침표 없음

코드 리뷰·테스트·배포 단계에서 확인해야 하는 필수 항목이다.
