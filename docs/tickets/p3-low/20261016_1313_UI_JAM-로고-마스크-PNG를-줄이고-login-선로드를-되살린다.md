---
id: "20261016_1313"
category: UI
priority: P3
status: OPEN
created: 2026-10-16
parent: "20261015_2133"
---

# [UI] JAM 로고 마스크 PNG를 줄이고 login 선로드를 되살린다

## 핵심 요약

- 요구사항: 로고를 CSS 마스크(`.jam-logo-mark`, `jam-web/src/app/globals.css`)로 바꾸면서 `next/image` 최적화와 login의 `priority` 선로드가 없어졌다. `public/jam-logo-white.png`는 46,304바이트 원본이고 TopNav·login·voc 모두 이 파일을 그대로 내려받는다(표시 크기 26px·48px·16px).
- 구현 계획: 마스크용으로 크기를 줄인 PNG나 SVG를 두거나 login에 `link rel=preload`를 둔다. MODULAR에 `BrandMark`(높이만 받는 로고 마크)로 올릴지는 사용자 판단이다(같은 마스크 패턴이 3곳, `TopNav.prompt.md`에 규칙이 있다).
- 근거: 티켓 20261015_2133 2회 채원② 제안·승격 후보.

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
