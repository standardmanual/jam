---
id: "20261007_0942"
category: Infra
priority: P1
status: OPEN
created: 2026-10-07
closed:
---

# [Infra] sharp high 취약점(GHSA-wq5f-xc86-pv6w, librsvg)을 0.35.5로 올린다

## 핵심 요약

- 요구사항: `cd jam-web && npm audit --omit=dev`가 high 1건을 낸다. `sharp` 0.35.4(직접 의존성, `package.json` `^0.35.3`)가 쓰는 librsvg의 취약점(CVE-2026-96889, `<0.35.5`)이고 0.35.5에서 고쳐졌다. lock 파일을 갱신해 0.35.5 이상으로 올리고 high 0건을 만든다.
- 구현 계획: `npm update sharp --package-lock-only`로 lock만 갱신한다(워크트리의 `node_modules`는 메인 폴더 링크이므로 메인 설치를 건드리지 않는다). `package.json` 범위(`^0.35.3`)가 0.35.5를 허용하므로 범위는 그대로 둔다. `@img/sharp-*` 플랫폼 바이너리·libvips 항목이 함께 바뀌는 것은 정상이고, sharp와 무관한 패키지가 바뀌면 멈추고 보고한다. `scripts/verify.sh`를 확인한다.
- 실측(2026-10-07 아현 1차 호출, plan_only로 반환): `npm update sharp --package-lock-only` 결과 lock 1파일 +118/−118(236줄), 바뀌는 키 27개가 전부 `node_modules/sharp`·`node_modules/@img/sharp-*`(sharp 계열 17곳 0.35.4→0.35.5, libvips 10곳 1.3.3→1.3.4), 갱신 후 `npm audit --omit=dev` 0건.
- 실행 방법(숨김 lock 보호): 워크트리의 `jam-web/node_modules`는 메인 폴더 링크라 그대로 `npm update`를 돌리면 메인 폴더의 `node_modules/.package-lock.json`이 바뀐다(1차 호출에서 실제로 바뀌었고 아현이 복구함). 실행 전에 워크트리의 `jam-web/node_modules` **링크만** 지우고(`rm jam-web/node_modules`, 메인 폴더 원본은 그대로) `--package-lock-only`로 갱신한 뒤, `scripts/workspace-setup.sh link "$(pwd)"`로 링크를 되살려 `verify.sh`를 돌린다. 끝나면 메인 폴더 `node_modules/.package-lock.json`의 `node_modules/sharp` 버전이 0.35.4 그대로인지 확인한다.
- 관련 파일: `jam-web/package-lock.json`(11182행 `node_modules/sharp`, 1108–1640행 `node_modules/@img/sharp-*`). 호출부는 바꾸지 않는다: `jam-web/src/lib/avatarImage.ts` 18행 `sanitizeAvatarImage`(21행 `sharp(input).metadata()`), `jam-web/src/lib/imageAverageColor.ts`, `jam-web/src/lib/admin/badgeImageWebp.ts`

## 배경 / 문제 정의

2026-10-07 `/jam-ship` 3단계 배포 전 점검표에서 발견했다(점검 기준: critical·high 0건). `package.json`·`package-lock.json`의 sharp 항목은 그 배포 범위(origin/main → staging)에서 바뀌지 않아 이번 배포가 들여온 것이 아니라 그 전부터 프로덕션에 있던 상태다.
다만 `app/api/profile/avatar/route.ts`가 부르는 `sanitizeAvatarImage`가 형식을 검사하기 전에 사용자가 올린 파일로 `sharp(input).metadata()`를 호출하므로 사용자 입력이 sharp의 SVG 처리에 닿을 수 있다(판단). 사용자 결정(2026-10-07): 이 티켓을 먼저 staging에 머지한 뒤 배포를 이어 간다.

## 완료 조건

- `cd jam-web && npm audit --omit=dev`가 critical·high 0건이고 `scripts/verify.sh`가 통과한다.
- lock 파일 변경이 sharp와 `@img/sharp-*` 항목에 한정된다.

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
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.
- 2026-10-07 카리나 규모 사전 판정이 빗나갔다: lock 파일 1개라 기준 안으로 봤으나 플랫폼별 바이너리 항목 27개가 함께 바뀌어 236줄이었다(아현 plan_only). 파일이 하나라 쪼갤 수 없어 실측을 「구현 계획」에 적고 사용자 승인으로 계획 반환 면제를 부여했다.

### 잔여 이슈
-
