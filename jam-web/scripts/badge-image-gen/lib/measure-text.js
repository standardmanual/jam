/**
 * TTF 폰트의 실제 advance width로 텍스트 폭을 재는 경량 측정기.
 *
 * 왜 필요한가: 기본 근사치(모든 글자를 fontSize와 같은 정사각형으로 가정)는 한글 폰트에서
 * 실제보다 과대 계산된다 (Pretendard Bold의 한글 advance는 0.8643em). 그 결과 디자인이
 * 지정한 폰트 크기가 실제로는 여유 있게 들어가는데도 불필요하게 축소돼 Figma 디자인과
 * 어긋난다. cmap(format 4) + hmtx만 읽으면 외부 의존성 없이 정확히 잴 수 있다.
 *
 * 사용: const m = createMeasurer(ttfBuffer); m.widthEm('가나다') * fontSize  // → px 폭
 */
function createMeasurer(buf) {
  const numTables = buf.readUInt16BE(4)
  const tables = {}
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16
    tables[buf.toString('ascii', o, o + 4)] = { off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) }
  }
  if (!tables.head || !tables.hhea || !tables.hmtx || !tables.cmap) {
    throw new Error('폰트에 head/hhea/hmtx/cmap 테이블이 없습니다 — 실측 모드를 쓸 수 없습니다')
  }

  const unitsPerEm = buf.readUInt16BE(tables.head.off + 18)
  const numHMetrics = buf.readUInt16BE(tables.hhea.off + 34)
  const hmtxOff = tables.hmtx.off

  // cmap: 유니코드 BMP를 다루는 format 4 서브테이블을 고른다
  const cmapOff = tables.cmap.off
  const numSub = buf.readUInt16BE(cmapOff + 2)
  let subOff = null
  for (let i = 0; i < numSub; i++) {
    const o = cmapOff + 4 + i * 8
    const platformId = buf.readUInt16BE(o)
    const encodingId = buf.readUInt16BE(o + 2)
    const offset = buf.readUInt32BE(o + 4)
    const format = buf.readUInt16BE(cmapOff + offset)
    if (format === 4 && platformId === 3 && (encodingId === 1 || encodingId === 0)) {
      subOff = cmapOff + offset
      break
    }
  }
  if (subOff === null) throw new Error('cmap format 4 서브테이블을 찾지 못했습니다')

  const segCountX2 = buf.readUInt16BE(subOff + 6)
  const segCount = segCountX2 / 2
  const endOff = subOff + 14
  const startOff = endOff + segCountX2 + 2
  const deltaOff = startOff + segCountX2
  const rangeOff = deltaOff + segCountX2

  function glyphIdFor(codePoint) {
    for (let i = 0; i < segCount; i++) {
      const end = buf.readUInt16BE(endOff + i * 2)
      if (codePoint > end) continue
      const start = buf.readUInt16BE(startOff + i * 2)
      if (codePoint < start) return 0
      const delta = buf.readInt16BE(deltaOff + i * 2)
      const rangeVal = buf.readUInt16BE(rangeOff + i * 2)
      if (rangeVal === 0) return (codePoint + delta) & 0xffff
      const gidOff = rangeOff + i * 2 + rangeVal + (codePoint - start) * 2
      if (gidOff + 1 >= buf.length) return 0
      const gid = buf.readUInt16BE(gidOff)
      return gid === 0 ? 0 : (gid + delta) & 0xffff
    }
    return 0
  }

  const cache = new Map()
  function charWidthEm(ch) {
    if (cache.has(ch)) return cache.get(ch)
    const gid = glyphIdFor(ch.codePointAt(0))
    const idx = Math.min(gid, numHMetrics - 1)
    const em = buf.readUInt16BE(hmtxOff + idx * 4) / unitsPerEm
    cache.set(ch, em)
    return em
  }

  return {
    unitsPerEm,
    charWidthEm,
    /** 텍스트 전체 폭을 em 단위로 반환 (px 폭 = 반환값 × fontSize) */
    widthEm(text) {
      let sum = 0
      for (const ch of text) sum += charWidthEm(ch)
      return sum
    },
  }
}

module.exports = { createMeasurer }
