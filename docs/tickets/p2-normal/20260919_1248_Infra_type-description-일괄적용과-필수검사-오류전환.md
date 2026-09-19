---
id: 20260919_1248
category: Infra
priority: P2
status: OPEN
created: 2026-09-19
closed:
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
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 사용자 노출 텍스트 없음 (내부 문서 메타데이터). description은 고정 용어 기준으로 작성한다.

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
