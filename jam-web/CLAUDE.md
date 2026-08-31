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

## 오버레이(시트·모달·토스트)를 만들거나 고치기 전에

**`../Service Plan/Specs/PRD/2026-08-15 DESIGN_RENEWAL_SPEC.md`의 "z-index 레이어 체계" 절을
먼저 읽는다.** 층 서열, "같은 z에서는 DOM 순서가 이긴다"는 규칙, `document.body` 포털 원칙,
하단 점유 높이 신고(`src/lib/uiOverlay.ts`), 새 오버레이 체크리스트가 있다.

이 규칙이 문서에 없어서 같은 종류의 레이어 사고가 네 차례 반복됐다
(티켓 20260825_039, 20260826_005). 특히 **기하값은 `min-h-*`·`py-*`로 역산하지 말고
`offsetHeight`로 실측한다** — 추정으로 틀린 사례가 그 안에 정리돼 있다.

## 사용자 노출 텍스트는 UX Writing 가이드를 따른다

화면 텍스트·버튼·에러 메시지·알림 등 모든 노출 문구는
`../Service Plan/Specs/UX_WRITING_GUIDELINE.md`를 먼저 확인한다. 핵심:

- **용어**: "획득·드랍·픽업·체크인" 등 문서에 정의된 고정 용어만 사용 (신용어는 문서 추가 후)
- **톤**: 상황에 맞게 (배지 획득=신남, 거래=단호, 오류=전문)
- **에러 메시지**: [현상] → [원인] → [해결책] 3단계 구조
- **문장**: 해요체, 간결하게, 제목에 마침표 없음

코드 리뷰·테스트·배포 단계에서 확인해야 하는 필수 항목이다.

## Supabase 쓰기 타입은 생성 타입이 기준이다

`.from(t).insert/update/upsert()`의 컬럼명·타입 검사는 **`src/types/database.generated.ts`**
기준으로 걸린다 (`lib/supabase/{client,server}.ts` 3곳이 이 파일을 주입한다).
수기 `src/types/database.ts`는 도메인 타입·주석 자산으로 남아 있을 뿐, 고쳐도 쓰기 검사에는
영향이 없다.

- **컴파일 오류를 억제로 덮지 않는다.** `@ts-expect-error`뿐 아니라 `as never`·
  `as unknown as XxxInsert` 같은 전체 캐스팅도 컬럼명 검증까지 함께 끈다. 억제가 정말 필요하면
  어긋나는 **한 컬럼 단위로** 좁힌다(`Omit<Insert, 'serial_number'>` 형태).
- **페이로드에 `Record<string, unknown>` 반환 함수를 스프레드하지 않는다.** 그 키들은 타입에서
  사라져 오타가 통과한다.
- **마이그레이션을 추가하면 `npm run db:types`로 생성 타입을 재생성해 같은 커밋에 넣는다.**
  생성 타입이 낡으면 올바른 코드가 잘못된 컴파일 오류를 낸다.

배경과 실측은 `../Service Plan/Tickets/20260831_1213_Service_Supabase제네릭-생성타입전환-쓰기타입검사-복구.md` 참조.
