// strip-code-comments — 소스 텍스트에서 주석 안의 글자를 공백으로 바꾼다 (티켓 20261126_1310, UI 소스 정리 7-1회차, 상위 20261125_1923).
// check-ui-rules.mjs·check-spacing.mjs가 «주석 속 설명 글자»(`max-w-[430px]`·`#171717` 등)를 위반으로 세지 않게 쓴다.
//
// stripComments(text, ext): 같은 길이·같은 줄 수의 문자열을 돌려준다. 주석 글자는 공백이 되고 줄바꿈은 그대로라
//   줄 번호와 열이 바뀌지 않는다.
//   .ts·.tsx  `//`부터 줄 끝, `/* … */`(여러 줄·JSX `{/* */}` 포함). 문자열 '…'·"…"·백틱 안의 `//`·`/*`는 주석이 아니다.
//             템플릿 문자열의 `${…}` 안은 코드로 본다. 역슬래시 이스케이프를 처리한다.
//   .css      `/* … */`만 주석이다. 문자열 안은 그대로 둔다.
// 한계: 정규식 리터럴(`/\/\//` 등)은 다루지 않는다. JSX 본문 글자 속의 `//`·아포스트로피는 코드로 읽는다
//   (따옴표 문자열은 줄 끝에서 닫히므로 어긋남이 다음 줄로 번지지 않는다).

function blank(ch) {
  return ch === '\n' || ch === '\r' ? ch : ' '
}

export function stripComments(text, ext) {
  const isCss = ext === 'css' || ext === '.css'
  const out = text.split('')
  const n = text.length
  // 템플릿 문자열의 `${` 안으로 들어갈 때 중괄호 깊이를 쌓는다.
  const stack = []
  let i = 0

  const blankRange = (from, to) => {
    for (let k = from; k < to; k++) out[k] = blank(text[k])
  }
  // 따옴표 문자열을 끝까지 건너뛴다(줄 끝에서 닫힌 것으로 본다). 끝 다음 위치를 돌려준다.
  const skipQuoted = (start, q) => {
    let k = start + 1
    while (k < n && text[k] !== '\n') {
      if (!isCss && text[k] === '\\') k += 2
      else if (text[k] === q) return k + 1
      else k++
    }
    return k
  }
  // 템플릿 문자열 본문을 건너뛴다. `${`를 만나면 거기서 멈추고 그 다음 위치를 돌려준다(코드 모드로 전환).
  const skipTemplate = (start) => {
    let k = start
    while (k < n) {
      if (text[k] === '\\') k += 2
      else if (text[k] === '`') return { next: k + 1, closed: true }
      else if (text[k] === '$' && text[k + 1] === '{') return { next: k + 2, closed: false }
      else k++
    }
    return { next: n, closed: true }
  }

  while (i < n) {
    const c = text[i]
    const d = text[i + 1]
    if (c === '/' && d === '*') {
      const end = text.indexOf('*/', i + 2)
      const to = end < 0 ? n : end + 2
      blankRange(i, to)
      i = to
    } else if (!isCss && c === '/' && d === '/') {
      let to = text.indexOf('\n', i)
      if (to < 0) to = n
      blankRange(i, to)
      i = to
    } else if (c === '"' || c === "'") {
      i = skipQuoted(i, c)
    } else if (!isCss && c === '`') {
      const r = skipTemplate(i + 1)
      i = r.next
      if (!r.closed) stack.push(0)
    } else if (!isCss && stack.length > 0 && c === '{') {
      stack[stack.length - 1]++
      i++
    } else if (!isCss && stack.length > 0 && c === '}') {
      if (stack[stack.length - 1] === 0) {
        stack.pop()
        // `}`로 `${…}`가 끝났다. 템플릿 본문으로 돌아간다.
        const r = skipTemplate(i + 1)
        i = r.next
        if (!r.closed) stack.push(0)
      } else {
        stack[stack.length - 1]--
        i++
      }
    } else {
      i++
    }
  }
  return out.join('')
}
