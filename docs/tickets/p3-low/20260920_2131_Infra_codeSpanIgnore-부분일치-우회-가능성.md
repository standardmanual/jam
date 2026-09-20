---
id: "20260920_2131"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-20
parent: "20260920_2121"
closed: 2026-09-20
---

# [Infra] codeSpanIgnore가 YYYY·0XX_ 를 부분 일치로 걸러 실제 오타 경로가 통과할 수 있다

## 핵심 요약

- 요구사항: `isCodeSpanIgnored`가 `YYYY`·`0XX_`를 경로 어디에든 걸리는 부분 일치로 처리해, 이 문자열이 든 실제 오타 경로가 검사를 우회한다. 위험은 낮으나 자리표시자 형태(파일명 위치에서만 일치)로 좁힐지 검토한다.
- 관련 파일: `scripts/doc-check.mjs`(`isCodeSpanIgnored`), `scripts/doc-check.config.json`(`codeSpanIgnore`)

## 배경 / 문제 정의

티켓 20260920_2121 게이트 리뷰(민지)의 범위 밖 발견물이다.

## 완료 조건

- 자리표시자 패턴이 의도한 위치에서만 일치한다. `doc-check.test.mjs`에 우회 사례 테스트가 있다.

---
## 완료 기록

### 구현 내용 요약
- `scripts/doc-check.config.json`의 `codeSpanIgnore`를 좁혔다. `YYYY`는 `/[^/]*YYYY[^/]*$`(파일명 위치), `0XX_`는 `/0XX_[^/]*$`(파일명 위치)로 바꿔, 디렉터리 이름에 이 문자열이 든 실제 오타 경로가 검사를 우회하지 못한다.
- `scripts/doc-check.test.mjs`에 실제 설정 패턴을 검증하는 테스트를 추가했다(`docs/YYYYtypo/real.md`·`docs/0XX_dir/real.md`는 예외 아님).

### 변경된 파일
```
scripts/doc-check.config.json
scripts/doc-check.test.mjs
```

### 테스트 결과
- [x] `doc-check.test.mjs` 통과 (44건)
- [x] `scripts/verify.sh` 통과
- [x] 티켓 외 문서: 깨진 링크 0, 깨진 경로 0 유지

### 잔여 이슈
- 없음. 파일명에 `YYYY`가 든 오타 경로는 여전히 예외로 걸리지만, 자리표시자 파일명과 구분할 방법이 없어 수용한다.
