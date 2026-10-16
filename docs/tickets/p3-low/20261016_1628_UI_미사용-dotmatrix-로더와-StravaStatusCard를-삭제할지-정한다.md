---
id: "20261016_1628"
category: UI
priority: P3
status: OPEN
created: 2026-10-16
parent: "20261015_2134"
---

# [UI] 미사용 dotmatrix 로더와 StravaStatusCard를 삭제할지 정한다

## 핵심 요약

- 요구사항: 서비스 연결이 없는 코드가 직접 적은 색 정리 대상에 계속 걸린다. `jam-web/src/components/dotmatrix-loader.css`·`src/lib/dotmatrix-core.tsx`는 서비스에서 쓰이지 않는 로더이고, `jam-web/src/components/strava/StravaStatusCard.tsx`는 import 0건이다. 연결하는 시점에는 미연결 상태 점(`bg-border`, 주황 10% 틴트 위 1.46:1)의 색을 다시 봐야 한다.
- 구현 계획: 삭제할지 남길지 정하고, 남기면 색을 토큰으로 정리하고 대비를 확인한다. 삭제하면 `dev-sample` 페이지와 `--color-dot-on`(정의 없는 옛 이름) 참조도 함께 정리한다.
- 근거: 티켓 20261015_2134 2회 민지·채원① 발견물.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
