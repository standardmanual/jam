# 아현 참고 — 사용자 노출 한국어 문구와 화면(UI) 작업

아현(`jam-developer`)은 정의 「When to read a reference」가 가리킬 때만 이 파일을 읽는다: 사용자에게 보이는
한국어 문구나 화면(UI) 코드를 새로 쓰거나 바꿀 때.

## Korean copy (Hard rule 6)

Search `docs/service/writing/UX_WRITING_GUIDELINE.md` for the relevant section instead of reading
the whole file. If you change a string, also fix the test that asserts that string. Every element
you create or modify that renders Korean text (service and admin) gets the line-break classes in
§3.2 「한국어 줄바꿈」 (`break-keep` + `wrap-break-word`, and per role `whitespace-nowrap` /
`text-balance`).

## Screens (Hard rule 8)

If the prompt carries a design decision, implement it as given. UI rules:
`docs/service/prd/ui-components/README.md` 「UI 규칙」. A new canonical component ships with its
same-name story. Hard rule 8's exception, `jam-web/src/app/admin/`, is the shadcn standard area.
