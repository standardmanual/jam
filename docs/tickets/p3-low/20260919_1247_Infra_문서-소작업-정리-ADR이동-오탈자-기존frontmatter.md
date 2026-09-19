---
id: 20260919_1247
category: Infra
priority: P3
status: WAITING
created: 2026-09-19
closed:
---

# [Infra] 문서 소작업 정리: ADR 이동, 가이드라인 오탈자, 기존 frontmatter 5건 이전

> 상위 티켓: 20260919_1223(문서 체계 정비). 하위 T3. 선행 없음(T1과 병행 가능).

## 핵심 요약

- 요구사항: 새 스키마와 어긋나는 기존 문서를 정리한다. ① `adr` type 폐지에 따라 기존 ADR을 `docs/specs/`로 이동 ② `UX_WRITING_GUIDELINE.md` §1.3 믹스 행 X 목록의 오탈자 수정 ③ 기존 frontmatter 5건을 새 스키마로 이전.
- 구현 계획: 문서 이동과 링크 수정, 오탈자 수정, frontmatter 5건 수정, 훅 안내 문구 정리를 한 번에 처리한다. 서비스 플랜 3건은 `jam-doc`에서 별도 커밋한다.
- 관련 파일: `docs/adr/0001-server-error-message-single-source.md`(이동), `docs/specs/UX_WRITING_GUIDELINE.md`(:60 믹스 행, :299·:317 ADR 언급), `docs/specs/PRIVACY_POLICY.md`, `docs/specs/prd/admin-ui/CONDITION_PRECHECK_PRD.md`, `jam-doc/planning/business-plan/00·01·02 *.md`, `.githooks/pre-commit`(안내 문구의 adr 언급)

## 배경 / 문제 정의

스키마 확정으로 `adr` type이 없어졌다. 기존 ADR 1건은 서버 에러 메시지를 딕셔너리 단일 소스로 삼는다는 규칙 문서라서 `guideline`으로 분류하고 `docs/specs/`에 둔다. 또한 `UX_WRITING_GUIDELINE.md` §1.3 믹스 행이 고정 용어 `믹스`를 금지어 목록에도 적어 두어(`:60`), 검사기가 금지 표기를 읽으면 오탐이 생긴다. 기존 frontmatter 5건은 필드 이름과 값이 새 스키마와 다르다.

## 상세 요구사항

### 서비스/코드베이스 관점

- **ADR 이동**: 파일명은 기존 스펙 관례(대문자 스네이크)에 맞춰 `docs/specs/SERVER_ERROR_MESSAGE_RULE.md`를 제안하며 착수 시 확정한다. frontmatter는 `type: guideline`, `description`, `status: active`. `docs/adr/` 폴더는 비운다. 이 문서를 언급하는 `UX_WRITING_GUIDELINE.md`의 경로(:317)를 새 경로로 고치고, §4.0 제목의 "ADR 0001" 표기(:299)는 "ADR" 명칭이 사라지므로 문구를 정리한다. 이 문서를 언급하는 티켓 3건(20260915_2227, 20260915_2236, 20260918_2105)은 이력이므로 고치지 않는다.
- **오탈자**: `UX_WRITING_GUIDELINE.md` §1.3 믹스 행의 X 목록 "조합, 합성, 믹스"에서 `믹스`를 제거한다.
- **기존 frontmatter 5건 이전**:
  - `PRIVACY_POLICY.md`: `last_updated`를 **삭제**한다(사용자 결정). 게시일은 본문 서두의 "2026-09-01 게시 완료(v1.0)"에 남아 있다. `status: published`는 `active`로 바꾸고 `type: guideline`과 `description`을 추가한다.
  - `CONDITION_PRECHECK_PRD.md`: `status: implemented`를 `active`로 바꾸고 `type: prd`와 `description`을 추가한다.
  - 서비스 플랜 `00`, `01`, `02`: `Title`과 `modified`를 제거하고 `type: service-plan`과 `description`을 추가한다. `jam-doc`에서 별도로 커밋·푸시하며 두 커밋 메시지에 같은 티켓 번호를 적는다.
- `.githooks/pre-commit`의 안내 문구에서 `docs/(tickets·specs·adr·agents)`의 adr 언급을 뺀다.

### UI/UX 관점 (해당 시)
- 해당 없음.

### 컨텐츠 관점 (해당 시)
- `PRIVACY_POLICY.md`는 `/privacy` 페이지 원고의 출처이므로 본문은 고치지 않고 frontmatter만 바꾼다.

## 구현 계획

1. `git mv`로 ADR을 옮기고 참조 경로를 고친다.
2. 가이드라인 오탈자와 §4.0 문구를 고친다.
3. frontmatter 5건을 이전한다(서비스 플랜 3건은 `jam-doc` 저장소에서 따로 커밋).
4. 훅 안내 문구를 정리한다.

## 완료 조건

- `docs/adr/`가 없고 `docs/specs/UX_WRITING_GUIDELINE.md`의 해당 경로가 새 파일을 가리키며 그 파일이 존재한다.
- `docs/specs/UX_WRITING_GUIDELINE.md` §1.3 믹스 행의 X 목록에 `믹스`가 없다.
- 적용 대상 문서에서 `last_updated`·`modified`·`Title` 필드와 `status: published`·`status: implemented` 값이 검색되지 않는다.
- 이전한 5건과 이동한 ADR에 `type`과 `description`이 있다.
- `.githooks/pre-commit` 안내 문구에 adr 언급이 없다.
- 서비스 플랜 3건의 변경이 `jam-doc`에 별도로 커밋·푸시되어 있고 두 커밋 메시지에 같은 티켓 번호가 있다.

## 관련 티켓

- 상위 20260919_1223, 병행 20260919_1245(T1), 후속 20260919_1248(T4)

---
## 완료 기록

### 구현 내용 요약

- ADR을 `docs/specs/SERVER_ERROR_MESSAGE_RULE.md`로 이동(`git mv`)하고 `type: guideline`·`description`·`status: active`를 추가했다. 코드 주석과 티켓이 부르는 옛 명칭 'ADR 0001'을 알리는 안내를 본문 첫머리에 넣었다. `docs/adr/` 폴더는 없앴다.
- `UX_WRITING_GUIDELINE.md`: §1.3 믹스 행 X 목록에서 `믹스`를 제거하고, 옛 ADR 경로를 새 경로로 고쳤다.
- `.githooks/pre-commit` 안내 문구에서 adr 언급을 뺐다.
- 기존 frontmatter 5건을 이전했다: `PRIVACY_POLICY.md`(`last_updated` 삭제, `published`를 `active`로), `CONDITION_PRECHECK_PRD.md`(`implemented`를 `active`로), 서비스 플랜 `00`·`01`·`02`(`Title`·`modified` 제거, `jam-doc`에서 별도 커밋).
- `DOCUMENT_SCHEMA.md` §4.1의 `title` 규칙에 예외를 반영했다(아래 의사결정 참고).

### 변경된 파일
```
.githooks/pre-commit
docs/specs/DOCUMENT_SCHEMA.md
docs/specs/PRIVACY_POLICY.md
docs/specs/SERVER_ERROR_MESSAGE_RULE.md (docs/adr/0001-server-error-message-single-source.md에서 이동)
docs/specs/UX_WRITING_GUIDELINE.md
docs/specs/prd/admin-ui/CONDITION_PRECHECK_PRD.md
jam-doc/planning/business-plan/00 JAM! 비즈니스 개념.md
jam-doc/planning/business-plan/01 JAM! 철학.md
jam-doc/planning/business-plan/02 JAM! 서비스 플랜.md
```

### 테스트 결과
- [x] `docs/adr/` 폴더가 없다.
- [x] `last_updated`·`modified`·`Title` 필드와 `status: published`·`implemented` 값이 `docs/specs`, `docs/agents`, `jam-doc`의 planning·marketing·operations에서 검색되지 않는다(소문자 `title`은 아래 예외 2건에 남아 있다).
- [x] 이전한 5건과 이동한 ADR에 `type`과 `description`이 있다.
- [x] `docs/specs/UX_WRITING_GUIDELINE.md` 믹스 행의 X 목록에 `믹스`가 없고, 옛 경로 언급이 새 파일을 가리키며 그 파일이 존재한다.
- [x] `node scripts/check-slop.mjs` 통과(48개 패턴).
- [x] 서비스 플랜 3건이 `jam-doc`에 별도로 커밋·푸시됐고 두 커밋 메시지에 같은 티켓 번호가 있다.
- 링크 검사기(T1)가 아직 없어 링크 유효성은 새 경로 파일의 존재로 수동 확인했다.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 사용자 노출 텍스트 없음 (문서 정리). `UX_WRITING_GUIDELINE.md`의 변경은 믹스 행 금지어 목록의 오탈자 정정이다.

### 배포 정보
- 배포일: 
- 환경: staging (jam-web 변경 없음, 빌드 없음)
- 커밋: 

### 주요 의사결정 / 핵심 메모

- **§4.0 제목의 "ADR 0001" 표기를 유지했다(티켓 계획에서 벗어남).** 착수 후 확인해 보니 `jam-web`의 API 라우트, 컴포넌트, `src/lib/i18n/ko.ts` 등 코드 주석 60여 곳이 이 문서를 'ADR 0001'이라는 이름으로 부른다. 주석을 고치는 것은 `jam-web` 변경이라 lint·배포 검사가 걸리는 범위 밖 작업이므로, 이름은 그대로 두고 이동한 문서 첫머리에 별칭 안내를 남겼다.
- **`Title` 제거는 서비스 플랜 `00`에만 적용했다(티켓 계획에서 벗어남).** `01`은 첫 H1이 "[이슈 1] …"이고 `02`는 H1이 아예 없어서 지우면 문서의 제목을 잃는다. 두 건은 소문자 `title`로 남기고 `DOCUMENT_SCHEMA.md` §4.1에 "H1이 없거나 대표하지 않으면 `title`을 쓸 수 있고 H1보다 우선한다"는 예외를 넣었다.
- `PRIVACY_POLICY.md`는 `title`을 남겼다(H1과 같은 값, 본문은 손대지 않는다). 게시일은 본문 서두의 "2026-09-01 게시 완료(v1.0)"에 남아 있다.
- 서비스 플랜 frontmatter를 읽는 자동화가 없음을 확인하고 `modified`를 제거했다.
- 옛 `docs/adr/...` 경로를 언급하는 티켓은 이력이므로 고치지 않았다.

### 잔여 이슈
- 코드 주석의 'ADR 0001' 표기를 새 문서 이름으로 바꿀지는 별도로 판단한다(필요하면 별도 티켓).
