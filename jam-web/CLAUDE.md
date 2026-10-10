@AGENTS.md

# jam-web 작업 규칙

## UI를 만들기 전에 — 채원의 판정을 따른다

새 UI가 필요하면 **코드부터 짜지 않는다.** 어떤 컴포넌트를 쓸지, 새로 만들지, MODULAR에 올릴지는
채원(`jam-designer`) 모드 ①의 **사전 판정**이 정한다.

1. **판정이 있으면 그대로 따른다.** 재사용하기로 한 컴포넌트를 두고 새로 만들지 않는다.
   판정에 적힌 토큰·상태 목록·텍스트 배치도를 빠짐없이 구현한다.
2. **판정이 없는데 UI 작업이 필요하면 멈추고 요청한다** (`needs_design`). 직접 고르지 않는다.
3. **MODULAR을 고쳤으면 Storybook Story를 함께 작성한다.** 컴포넌트만 고치고 Story를 빠뜨리면
   `.githooks/pre-commit`이 경고한다.

판정 기준과 의사결정 트리는 `/jam-design` 스킬에 있다. 리뷰 점검표는
`.claude/skills/jam-design/references/ui-review-checklist.md`.

**예외**: `src/app/admin/` 어드민 화면은 MODULAR 적용 대상이 아니고 채원의 판정 대상도 아니다
(정책 결정). 어드민 UI는 바로 service-specific으로 구현한다.

## 오버레이(시트·모달·토스트)를 만들거나 고치기 전에

**`../docs/service/prd/2026-08-15 DESIGN_RENEWAL_SPEC.md`의 "z-index 레이어 체계" 절을
먼저 읽는다.** 층 서열, "같은 z에서는 DOM 순서가 이긴다"는 규칙, `document.body` 포털 원칙,
하단 점유 높이 신고(`src/lib/uiOverlay.ts`), 새 오버레이 체크리스트가 있다.

이 규칙이 문서에 없어서 같은 종류의 레이어 사고가 네 차례 반복됐다
(티켓 20260825_039, 20260826_005). 특히 **기하값은 `min-h-*`·`py-*`로 역산하지 말고
`offsetHeight`로 실측한다** — 추정으로 틀린 사례가 그 안에 정리돼 있다.

## 사용자 노출 텍스트는 UX Writing 가이드를 따른다

화면 텍스트·버튼·에러 메시지·알림 등 모든 노출 문구는
`../docs/service/writing/UX_WRITING_GUIDELINE.md`를 먼저 확인한다. 핵심:

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
- **마이그레이션을 추가하면 생성 타입을 재생성해 같은 커밋에 넣는다.** 이 환경에는 supabase
  CLI가 없어 `npm run db:types`(제거됨)는 실행 불가하고, 실행하면 실패하며 파일을 빈 값으로
  덮어쓴다. Supabase MCP의 `generate_typescript_types`로 최신 타입을 받아 기존
  `src/types/database.generated.ts`와 대조해 반영한다. 생성 타입이 낡으면 올바른 코드가
  잘못된 컴파일 오류를 낸다.

배경과 실측은 `../docs/tickets/20260831_1213_Service_Supabase제네릭-생성타입전환-쓰기타입검사-복구.md` 참조.
