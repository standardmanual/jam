// scripts/strip-code-comments.mjs 의 주석 지우기를 확인한다 (티켓 20261126_1310).
// 실행: node scripts/strip-code-comments.test.mjs

import assert from 'node:assert/strict'
import { stripComments } from './strip-code-comments.mjs'

const lines = (s) => s.split('\n').length

// 줄 끝 주석·줄 전체 주석
{
  const src = 'const a = 1 // max-w-[430px]\n// #171717\nconst b = 2'
  const out = stripComments(src, 'ts')
  assert.ok(!out.includes('430') && !out.includes('171717'), '주석 글자는 지운다')
  assert.ok(out.includes('const a = 1') && out.includes('const b = 2'), '코드는 남긴다')
}

// 여러 줄 JSDoc·블록 주석
{
  const src = '/**\n * <button> py-[13px]\n */\nconst a = 1\n/* x */ const b = 2'
  const out = stripComments(src, 'tsx')
  assert.ok(!out.includes('button') && !out.includes('13px'))
  assert.equal(lines(out), lines(src), '줄 수 유지')
  assert.ok(out.includes('const a = 1') && out.includes('const b = 2'))
}

// JSX 주석
{
  const out = stripComments('<div>{/* <button> */}<p/></div>', 'tsx')
  assert.ok(!out.includes('button') && out.includes('<p/>'))
}

// 문자열 안의 // 와 /* 는 주석이 아니다
{
  const src = `const u = 'https://x.com'; const v = "a/*b"; const c = "bg-[#fff]"`
  assert.equal(stripComments(src, 'ts'), src)
}

// 역슬래시 이스케이프
{
  const out = stripComments(`const a = 'it\\'s // not' // gone`, 'ts')
  assert.ok(out.includes("'it\\'s // not'") && !out.includes('gone'))
}

// 템플릿 문자열: 본문은 문자열, ${} 안은 코드
{
  const out = stripComments('const a = `x // y ${b /* c */ + `z`} // w` // tail', 'ts')
  assert.ok(out.includes('x // y') && out.includes('// w'), '템플릿 본문의 //는 남긴다')
  assert.ok(!out.includes('c */') && !out.includes('tail'), '${} 안 주석·뒤 줄 끝 주석은 지운다')
}

// ${} 안의 중괄호 짝
{
  const out = stripComments('const a = `${ {k: 1}.k } // keep` // drop', 'ts')
  assert.ok(out.includes('// keep') && !out.includes('drop'))
}

// CSS는 /* */ 만 주석
{
  const out = stripComments('a { background: url(//x.com/a.png); /* #171717 */ }', 'css')
  assert.ok(out.includes('//x.com') && !out.includes('171717'))
}

// 길이·줄 수 보존
{
  const src = '/* a\nb */\n// c\nconst x = `a\n${1}\nb`\n'
  const out = stripComments(src, 'ts')
  assert.equal(out.length, src.length)
  assert.equal(lines(out), lines(src))
}

console.log('strip-code-comments.test: 통과')
