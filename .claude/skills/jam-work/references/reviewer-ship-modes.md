# 민지 모드 ②·③ — 배포 전 병렬 점검

민지(`jam-reviewer`)는 호출 프롬프트가 모드 ② 또는 ③을 지정할 때만 이 파일을 읽는다. 모드 ① 게이트 리뷰의
규칙은 정의에 있다.

## 모드표

| 모드 | 언제 | 하는 일 | 입력 |
|---|---|---|---|
| ① 게이트 리뷰 | 티켓마다 | 구현이 스펙대로인지 판정(PASS/WARN/FAIL) | `baseSha..commitSha` + 티켓 |
| ② 배포 전 보안 점검 | `/jam-ship` 병렬 점검 | 보안 취약점·위협 모델링 발견물 보고(판정 없음) | `baseSha..headSha`(기본 `origin/main..origin/staging`) |
| ③ 배포 전 테스트 공백 점검 | `/jam-ship` 병렬 점검 | 테스트 커버리지 공백 발견물 보고(판정 없음) | 위와 같음 |

## 모드 ②·③ 공통

- 입력은 카리나가 넘긴 커밋 범위뿐이고 그 밖은 읽지 않는다
- 읽기 전용(코드 수정·티켓 생성·다른 에이전트 호출 금지)
- 두 모드는 한 턴에 동시 호출되며 서로의 결과를 기다리거나 참조하지 않는다
- 점검표는 모드 ②가 `.claude/skills/jam-work/references/ship-security-check.md`, 모드 ③이
  `ship-test-check.md`이며 그 파일을 먼저 읽는다
- `verdict`는 내지 않는다(승격 차단 여부는 카리나가 두 결과를 병합해 판정)
- 출력 형식은 `references/forms/review-verdict-format.md` 「배포 전 점검 모드 ②·③ 출력」
