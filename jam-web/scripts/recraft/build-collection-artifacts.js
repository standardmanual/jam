#!/usr/bin/env node
/**
 * 컬렉션 스펙(JSON)을 읽어 /jam-img 파이프라인 ⑤⑦ 산출물을 한 번에 생성한다.
 *
 * 입력 스펙 형식:
 * {
 *   "tribe_dir": "<트라이브 폴더 절대경로>",
 *   "collection_id": "03-01", "collection_name": "그루터기 살롱의 장물들",
 *   "tribe_name": "숲속의 갱단",
 *   "style_id": "...", "model": "recraftv4_1", "size": "1024x1024",
 *   "items": [
 *     { "index": 1, "name": "...", "desc": "...", "filename": "03-01_1_....png",
 *       "slug": "03-01-1", "ids": ["...","...","...","..."], "prompt": "..." }
 *   ]
 * }
 *
 * 출력:
 * - {tribe_dir}/컨텐츠_브리프/{collectionId} {collectionName}_프롬프트/{collectionId}_{index}_{name무공백}_프롬프트.md
 * - {tribe_dir}/컨텐츠_브리프/{collectionId} {collectionName}/recraft_batch_config.json
 * - {tribe_dir}/컨텐츠_브리프/{collectionId} {collectionName}/recraft_badge_mapping.json
 *
 * 실행: node scripts/recraft/build-collection-artifacts.js <spec.json>
 */
const fs = require('fs')
const path = require('path')

function main() {
  const [specPath] = process.argv.slice(2)
  if (!specPath) {
    console.error('사용법: node build-collection-artifacts.js <spec.json>')
    process.exit(1)
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
  const { tribe_dir, collection_id, collection_name, tribe_name, style_id, model, size, items } = spec

  const briefRoot = path.join(tribe_dir, '컨텐츠_브리프')
  const collectionDir = path.join(briefRoot, `${collection_id} ${collection_name}`)
  const promptDir = path.join(briefRoot, `${collection_id} ${collection_name}_프롬프트`)
  fs.mkdirSync(collectionDir, { recursive: true })
  fs.mkdirSync(promptDir, { recursive: true })

  for (const item of items) {
    const nameNoSpace = item.name.replace(/\s+/g, '')
    const mdPath = path.join(promptDir, `${collection_id}_${item.index}_${nameNoSpace}_프롬프트.md`)
    const md = `# ${collection_id} ${collection_name} — ${item.index}. ${item.name}\n\n${item.desc}\n\n**생성 prompt** (recraftv4_1은 negative_prompt 미지원 — 금지 요소는 본문에 서술)\n\n${item.prompt}\n`
    fs.writeFileSync(mdPath, md)
  }

  const batchConfig = {
    style_id,
    model,
    size,
    items: items.map((it) => ({ filename: it.filename, prompt: it.prompt })),
  }
  fs.writeFileSync(path.join(collectionDir, 'recraft_batch_config.json'), JSON.stringify(batchConfig, null, 2))

  const mapping = {
    collection_id,
    items: items.map((it) => ({ filename: it.filename, slug: it.slug, name: it.name, ids: it.ids })),
  }
  fs.writeFileSync(path.join(collectionDir, 'recraft_badge_mapping.json'), JSON.stringify(mapping, null, 2))

  console.log(`완료: ${collection_id} — 프롬프트 문서 ${items.length}개, batch config, badge mapping 작성됨`)
  console.log(`  컬렉션 폴더: ${collectionDir}`)
}

main()
