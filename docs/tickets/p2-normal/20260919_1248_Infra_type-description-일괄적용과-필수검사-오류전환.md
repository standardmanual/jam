---
id: 20260919_1248
category: Infra
priority: P2
status: CLOSED
created: 2026-09-19
closed: 2026-09-19
---

# [Infra] type·description 일괄 적용과 필수 검사 오류 전환

> 상위 티켓: 20260919_1223(문서 체계 정비). 하위 T4. **선행: 20260919_1245(T1) 완료(경고 모드로 누락 목록 산출).** 태그 어휘 확정(상위 티켓 3단계)은 별도 티켓 없이 이 티켓에 포함한다.

## 핵심 요약

- 요구사항: 비티켓 문서(혜린 집계 약 70건)에 `type`과 `description`을 붙이고, `catalog`·`research-note`에 태그를 붙인다. 적용이 끝나면 필수 필드 검사를 경고에서 오류로 올린다.
- 구현 계획: 대상 목록 확정 → 폴더별 세 묶음(`docs/specs`, `docs/agents`, `jam-doc`)으로 하니가 type 배정표와 description 초안 작성 → 사용자 검수 → 카리나 반영 → 검사기 오류 전환.
- 관련 파일: `docs/specs/`, `docs/agents/`, `jam-doc/planning/`, `jam-doc/marketing/`, `docs/specs/DOCUMENT_SCHEMA.md`(§3 type, §4 필드, §6 태그), T1의 검사기 설정 파일

## 배경 / 문제 정의

비티켓 문서는 frontmatter가 거의 없어 type과 요약을 기계가 읽을 수 없다. 오류 전환을 먼저 하면 아직 이전되지 않은 문서를 편집하는 모든 세션이 커밋에서 막히므로, 적용을 끝낸 뒤 마지막에 전환한다.

## 상세 요구사항

### 서비스/코드베이스 관점

- **대상 목록을 먼저 확정한다.** 티켓 초안은 "약 60개"였고 혜린 집계는 `docs/specs`·`docs/agents` 약 53건과 `jam-doc`의 planning·marketing·operations 18건이다. 이 티켓에서 최종 목록을 만들고 제외 목록(`operations/reports/`, 옛 티켓, `archive/`, `ITEMBOOKS.xlsx` 등 frontmatter를 담을 수 없는 원천 파일)을 완료 기록에 남긴다.
- **작업은 세 묶음으로 나눠 커밋한다**: `docs/specs`, `docs/agents`, `jam-doc`. 커밋 파일은 항상 명시적으로 나열한다(`git add -A` 금지). `jam-doc` 묶음은 격리 워크트리가 아니라 메인 폴더에서 rebase 후 커밋한다.
- **사용자가 검수하는 것**은 "파일 → type" 배정표 1장과 description 표본 10건이다.
- 트라이브 관련 문서(`TRIBES.md`, 서비스 플랜의 트라이브 문서)의 description은 윈터가 확인한다.
- 새 description이 `scripts/check-slop.mjs`를 통과해야 한다.
- 태그를 필수로 요구하는 type은 `catalog`와 `research-note`뿐이다. 어휘는 `DOCUMENT_SCHEMA.md` §6.2(26개)를 쓴다.
- 서비스 플랜과 활동 배지 문서에 남은 "달리기" 4건(서비스 플랜 3건, 활동 배지 1건)은 러닝으로 통일할지 이 티켓에서 정한다.
- 마지막 단계에서 T1 설정의 `type`·`description`·필수 추가 필드·태그 어휘 검사를 **오류 등급으로 올린다.**

### UI/UX 관점 (해당 시)
- 해당 없음.

### 컨텐츠 관점 (해당 시)
- description은 UX Writing 고정 용어로 쓰고 코드·DB 식별자와 파일명은 원문을 유지하며 필요하면 괄호로 병기한다(`DOCUMENT_SCHEMA.md` §6.1).

## 구현 계획

1. T1 검사기를 경고 모드로 돌려 대상 목록과 누락 목록을 확정한다.
2. 하니가 묶음별 type 배정표와 description 초안을 만든다(하니는 쓰기 도구가 없으므로 제안만 한다).
3. 사용자가 배정표와 표본을 검수한다.
4. 카리나가 묶음별로 반영하고 커밋한다.
5. 검사기 설정에서 필수 검사를 오류로 올리고 전체 실행 결과를 남긴다.

## 완료 조건

- T1 검사기를 `jam`과 `jam-doc`에 돌렸을 때 적용 대상 문서의 `type`·`description` 누락이 0건이다.
- type별 필수 추가 필드(`catalog`의 `source_of_truth`, `report`의 `period`·`from`·`to` 등) 누락이 0건이다. `operations/reports/`는 제외 목록에 있다.
- 어휘 밖 태그 경고가 0건이다.
- 제외 목록이 완료 기록에 있다.
- 필수 검사가 오류 등급으로 전환됐고, `type` 없는 md를 커밋하면 차단된다.
- `scripts/check-slop.mjs`가 새 description을 통과한다.
- 사용자가 type 배정표와 description 표본 10건을 검수했다는 기록이 완료 기록에 있다.

## 관련 티켓

- 상위 20260919_1223, 선행 20260919_1245(T1), 병행 20260919_1247(T3), 후속 20260919_1249(T5), 20260919_1250(T6)

---
## 완료 기록

### 구현 내용 요약

- **대상 확정**: 검사기(`--all`)로 frontmatter가 없던 비티켓 문서 66건을 뽑았다. `operations/reports/` 3건을 제외해 63건이 대상이 됐고, 이 중 `admin-ui` 폐기 문서 2건은 삭제했다.
- **적용 62건**: `docs/specs` 26건, `docs/agents` 23건, `jam-doc` 12건에 `type`·`description`(필요 시 `status`·`tags`·`basis`·`agent`·`code`·`source_of_truth`·`source`·`snapshot`·`title`)을 붙였고, 검사기가 새로 잡은 `docs/tickets/README.md`를 `index`로 배정했다.
- **작성 방식**: 하니 3명이 묶음별로 초안을 만들고(specs·jam-doc은 Sonnet, agents는 기본 모델), 카리나가 낡는 숫자 제거·경계 사례·`status` 판단을 손질했다. 트라이브 문서 3건은 윈터가 확인했다. 적용 뒤 검사기 파서로 61건의 값이 초안과 일치하는지 전수 대조해 불일치 0건을 확인했다.
- **태그 어휘 26개에서 31개로 확장**(사용자 결정): 주제 그룹에 `마케팅`·`시즌`·`디자인시스템`·`계측`·`워크플로`를 추가하고 스키마 §6.1에 "개체·종목 태그는 가이드라인 표에서, 주제 태그는 필요할 때 직접 추가"를 반영했다. `워크플로`는 `docs/agents` 문서 23건에 일괄 부여했다.
- **삭제 2건**(사용자 결정): `docs/specs/prd/admin-ui/DATA_MODEL.md`, `PROJECT_SPEC.md`. `admin-ui/README.md`가 폐기로 밝힌 문서이며 이 문서들을 링크하는 문서가 없음을 검사기로 확인했다. 이력은 git에 있다.
- **필수 검사를 오류 등급으로 전환**: `scripts/doc-check.config.json`의 `severity.field`를 `error`로 올렸다. 함께 `fieldSeverity`가 미지의 type·필드도 오류로 만들던 점을 스키마 §7.3에 맞게 경고로 고쳤다(4줄, 테스트 1줄 추가). `jam-doc/operations/reports/`는 검사 범위에서 제외했다.

### 변경된 파일
```
jam:
docs/specs/ 26건 (frontmatter 추가), docs/specs/prd/admin-ui/DATA_MODEL.md·PROJECT_SPEC.md (삭제)
docs/agents/ 23건 (frontmatter 추가), docs/tickets/README.md (frontmatter 추가)
docs/specs/DOCUMENT_SCHEMA.md (§6 어휘)
scripts/doc-check.mjs, scripts/doc-check.test.mjs, scripts/doc-check.config.json
jam-doc:
marketing 3건, planning/business-plan 3건, planning/content 6건 (frontmatter 추가)
```

### 테스트 결과
- [x] 검사기 `--all`: frontmatter 계열 오류 0건, 경고 0건(제외 목록 제외). 필수 추가 필드 누락 0건, 어휘 밖 태그 0건.
- [x] 오류 전환 후 실제 훅이 다음 4가지 커밋을 차단했다(HEAD 불변, 임시 파일 정리): frontmatter 없음, `description` 없음, 어휘 밖 태그, `catalog` 필수 필드(`tags`, `source_of_truth`) 누락.
- [x] `node scripts/check-slop.mjs` 통과(48개 패턴).
- [x] `node scripts/doc-check.test.mjs` 37건, `node scripts/doc-check-hook.test.mjs` 9건 통과.
- [x] 초안의 `code`·`source` 경로와 `agent` 정의명이 실제로 존재함을 전수 확인했다.
- [x] 제외 목록(아래).
- 사용자 검수: 파일 → type 배정표와 description 표본 10건을 제시했고, 사용자는 배정표·표본에 대한 이의 없이 결정 3건(어휘 확장, 폐기 문서 삭제, `status` 제안 수용)에 답했다. 표본 밖 51건의 description은 사용자가 개별 검수하지 않았다.
- 종료 승인: 사용자가 2026-09-19에 완료 기록을 확인하고 표본 밖 description의 개별 검수 없이 T4 종료와 staging 푸시를 승인했다.

**제외 목록**
- `jam-doc/operations/reports/README.md`, `monthly/2026-09.md`, `weekly/2026-W38.md` (무인 예약 루틴이 커밋)
- 옛 형식 티켓 `docs/tickets/modular/`, `docs/tickets/_TEMPLATE.md`, 티켓 본문(경로로 type 판정, `type`·`description` 면제)
- `jam-doc/archive/`, `jam-doc/assets/`, 컨텐츠 폴더의 산출물(`.json`·`.py`·`.mjs`·`.xlsx`)
- `CLAUDE.md`, `AGENTS.md`, `.claude/` 아래 도구 형식 파일, `jam-web/` 안의 문서

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 사용자 노출 텍스트 없음 (내부 문서 메타데이터). description은 고정 용어로 쓰고 코드·DB 식별자는 원문을 유지했다. 설명에서 시간이 지나면 낡는 숫자(개수)는 뺐다.

### 배포 정보
- 배포일: 2026-09-19
- 환경: staging (`jam-web` 변경 없음, Vercel 빌드 없음), `jam-doc`은 main
- 커밋: b867ed80(specs), ac9935c4(agents), 7eeb5020(검사기), 6fb9bcb8(어휘), `jam-doc` 22e2e63

### 주요 의사결정 / 핵심 메모

- 소요: 하니 3명(164,137 · 83,652 · 115,907토큰, 466초 · 123초 · 401초, 병렬)과 윈터 1명(39,049토큰, 54초). 서브에이전트 토큰 합계 402,745.
- **`03_PHASES`와 `admin-ui/PHASES`는 `prd`로 유지**했다. 내용은 시간순 이력이라 `log` 성격이 강하지만 스키마 §3이 단계 문서를 `prd`에 두며, 재검토는 티켓 20260919_1326에 적었다. `COMBINE_RECIPES`도 정책 서술이 중심이지만 스키마가 "믹스 레시피"를 `catalog`로 명시해 따랐다.
- **`status: draft` 세 건**: 마케팅 플레이북(사례 카드가 비어 있음), 브랜드 보이스 가이드(초안), `POI.md`(서두는 "스텁"이나 본문이 있고 채울 항목 9개 중 5개 미완). 하니는 두 건을 `stub`으로 제안했지만 `stub`은 미작성이라 작성된 절이 있는 문서에는 맞지 않는다고 판단했다.
- **`TRIBES.md`는 `source_of_truth: doc`, `basis`에 04 트라이브 문서**(윈터 권고). 서사 원문은 04, 구조 기준은 `TRIBES.md`라는 구분과 어드민 수정 시 문서 선갱신 절차는 티켓 20260919_1325에 적었다.
- **`fieldSeverity` 수정**: 등급을 오류로 올리면 미지의 type·필드까지 오류가 돼 스키마 §7.3과 어긋났다. 경미 수정 기준(파일 2개 이내, 10줄 이내)으로 카리나가 직접 고치고 테스트를 추가했다.
- 서비스 플랜과 활동 배지 문서의 "달리기" 4건은 러닝 통일을 이 티켓에서 하지 않고 티켓 20260919_1327로 분리했다(활동 배지 문서는 생성물이라 입력 데이터를 고쳐 재생성해야 한다).

### 잔여 이슈
- 하니가 발견한 문서 결함 세 건은 티켓 20260919_1325(컨텐츠 값 불일치, P2), 20260919_1326(낡은 서두·내부 모순, P3), 20260919_1327(옛 표기 정비, P3)로 남겼다. 모두 하니 보고이며 착수 시 사실 확인부터 한다.
- 훅 안내 문구가 필드 오류에도 링크 안내("새로 추가한 링크는 존재하는 경로여야 하고…")를 붙인다. T6(20260919_1250)에서 다듬는다.
- `jam-doc` 문서는 `jam` 훅의 `--staged` 검사 대상이 아니다. T2(20260919_1246)에서 `jam-doc` 훅에 검사기를 복사한다.
- 표본 밖 description 51건은 개별 검수를 받지 않았다. 필요하면 티켓 20260919_1326 착수 때 함께 확인한다.
