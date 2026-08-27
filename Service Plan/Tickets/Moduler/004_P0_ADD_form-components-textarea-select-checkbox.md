---
id: DS-004
status: CLOSED
severity: P0
type: ADD
category: Component / UX
---

# DS-004 — 폼 컴포넌트 추가 (Textarea, Select, Checkbox)

## Problem
`components/forms/`에 `Input.jsx` 하나만 존재한다. Textarea, Select, Checkbox, Radio 없이는 실제 폼을 이 DS만으로 구현할 수 없다. 로그인, 프로필 수정, 설정 등 모든 폼 화면에서 DS 외부 구현이 불가피해진다.

## Evidence
```
components/forms/
  Input.jsx     ← 존재
  forms.card.html
  /* Textarea.jsx — 없음 */
  /* Select.jsx  — 없음 */
  /* Checkbox.jsx — 없음 */
  /* Radio.jsx   — 없음 */
```

## Reference
기존 DS(`jam-web/src/components/ui/`)에도 폼 컴포넌트가 제한적이었으나, 실제 서비스 코드에서는 `<textarea>`, `<select>`를 직접 인라인 스타일링해서 사용 중. 이 패턴이 DS v2 도입을 막는 이유 중 하나다.

## Recommendation
`Input.jsx`와 동일한 설계 원칙(state prop, aria 속성, `...rest` spread, `.d.ts` 동반)으로 3종 추가한다.

**Textarea.jsx**
- props: `value`, `onChange`, `rows`, `placeholder`, `id`, `name`, `aria-label`, `aria-describedby`, `state`, `disabled`, `...rest`
- `resize: 'vertical'` 기본, `minHeight: 88px`

**Select.jsx**
- props: `value`, `onChange`, `options: [{value, label}]`, `placeholder`, `id`, `name`, `aria-label`, `state`, `disabled`, `...rest`
- 브라우저 기본 `<select>` 스타일링 (`appearance: 'none'` + chevron 아이콘)

**Checkbox.jsx**
- props: `checked`, `onChange`, `label`, `id`, `name`, `disabled`, `...rest`
- `<label>` wrapping 패턴, 44×44 touch target

모두 `state: 'default' | 'error' | 'success'` 동일하게 적용.

## Impact
- 신규 파일 3개 추가 — 기존 컴포넌트 영향 없음
- `.d.ts` 파일 3개 추가
- `forms.card.html` 데모 업데이트 필요

## Risk
- Select의 브라우저별 `<select>` 스타일링 차이 (특히 iOS Safari) — 기본 스타일 override의 한계를 문서화해야 함
- Checkbox의 커스텀 스타일은 `:checked` pseudo-selector가 필요 → inline style 방식의 한계에 걸림. `styles.css` 글로벌 클래스 또는 SVG 오버레이 방식 고려

## Acceptance Criteria
- [ ] `Textarea.jsx`, `Select.jsx`, `Checkbox.jsx` 구현 및 `forms.card.html` 데모 추가
- [ ] 각 컴포넌트에 `.d.ts` 파일 동반
- [ ] `state="error"` 시 border 색상 변경 및 `aria-invalid` 적용
- [ ] 모든 컴포넌트 44px 이상 터치 타겟 확보
- [ ] `disabled` 상태 `opacity: 0.4` + `cursor: not-allowed`

---

## 완료 기록

- **날짜**: 2026-08-14
- **구현**: `Textarea.jsx`, `Select.jsx`, `Checkbox.jsx` 신규 구현. 모두 Input과 동일한 설계 원칙 — state prop, aria 속성, `...rest` spread, `.d.ts` 동반
  - Textarea: `resize:vertical`, `minHeight:88px`
  - Select: `appearance:none` + inline chevron SVG, iOS Safari 한계 주석 문서화
  - Checkbox: 숨김 native input + 커스텀 시각 레이어, 44×44 터치 타겟
- **추가 파일**: `Textarea.jsx/.d.ts`, `Select.jsx/.d.ts`, `Checkbox.jsx/.d.ts`
- **잔여 이슈**: `forms.card.html` 데모 업데이트 미진행 (P1 작업으로 별도 처리 가능)
