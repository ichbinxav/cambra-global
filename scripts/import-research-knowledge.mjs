import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const RESEARCH_ROOT = path.join(ROOT, 'research', 'external');
const MANIFEST_PATH = path.join(
  ROOT,
  'config',
  'intelligence',
  'research-source-manifest.v1.json',
);
const GENERATED_PATH = path.join(
  ROOT,
  'base44',
  'shared',
  'generated',
  'researchKnowledgeDocuments.ts',
);
const SCHEMA_VERSION = '1.0.0';
const MAX_CHUNK_CHARACTERS = 6_000;
const MIN_SPLIT_TARGET = 1_500;

const TOPIC_PATTERNS = Object.freeze([
  ['deliverability', /deliverab|spf|dkim|dmarc|unsubscribe|complaint|sender|correo/i],
  ['go_to_market', /\bgtm\b|proof.of.demand|campaign|outbound|feria|evento/i],
  ['payments_pricing', /tarifa|pricing|rate card|merchant discount|interchange|scheme fee|mdr/i],
  ['provider_coverage', /provider|proveedor|psp|acquirer|stripe|adyen|mollie|sumup|worldline|paypal/i],
  ['country_economics', /country payments|economics|economía|mercado|country|pa[ií]s|moneda|currency/i],
  ['negotiation', /negotiat|negoci|retention|rfp|concession|concesi|migration credit/i],
  ['regulation', /regulat|reglamento|legal|ley|jurisdic|eidas|mandato|firma electr/i],
  ['document_intelligence', /extractor|extraction|document|documento|ocr|receipt|recibo|extracto|liquidaci/i],
  ['evaluation_corpus', /corpus|gold_real|gold official|benchmark|precision|recall|dataset/i],
  ['privacy_security', /rgpd|gdpr|privacy|privacidad|anonimi|pseudon|pci dss|pan|cvv/i],
  ['risk_operations', /chargeback|fraud|fraude|risk|riesgo|reserve|reconciliation/i],
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function canonicalizeText(text) {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function countLines(text) {
  if (text.length === 0) return 0;
  return text.split(/\r\n|\n|\r/).length;
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'research-document';
}

function cleanUrl(raw) {
  const candidate = raw
    .replace(/^[(<\[]+/, '')
    .replace(/[)>\]}.,;:'\"`]+$/g, '');
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === 'example.com'
      || hostname.endsWith('.example.com')
      || hostname.endsWith('.example')
      || hostname.includes('sandbox')
    ) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractSourceUrls(text) {
  const matches = text.match(/https?:\/\/[^\s<>"']+/giu) ?? [];
  return [...new Set(matches.map(cleanUrl).filter(Boolean))].sort();
}

function extractOpaqueCitations(text) {
  const citations = [];
  const citationBlocks = text.match(/cite[^]+/gu) ?? [];
  for (const block of citationBlocks) {
    citations.push(...(block.match(/turn\d+(?:search|view|open|fetch)\d+/giu) ?? []));
  }
  const standalone = text.match(/(?<![\w/])turn\d+(?:search|view|open|fetch)\d+(?![\w/])/giu) ?? [];
  citations.push(...standalone);
  return [...new Set(citations.map((value) => value.toLowerCase()))].sort();
}

function parseHeadings(text) {
  const headings = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (!match) continue;
    headings.push({
      level: match[1].length,
      text: match[2].replace(/\s+#+\s*$/, '').trim(),
      line: index + 1,
    });
  }
  return headings;
}

function inferTitle(filename, headings) {
  return headings.find((heading) => heading.level === 1)?.text
    ?? headings[0]?.text
    ?? path.basename(filename, path.extname(filename));
}

function inferTopics(text, title, headings) {
  const corpus = `${title}\n${headings.map((heading) => heading.text).join('\n')}\n${text}`;
  return TOPIC_PATTERNS
    .filter(([, pattern]) => pattern.test(corpus))
    .map(([topic]) => topic);
}

function parseArgs(argv) {
  const result = {
    check: false,
    captureDate: null,
    sources: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      result.check = true;
    } else if (argument === '--capture-date') {
      result.captureDate = argv[index + 1];
      index += 1;
    } else if (argument === '--source') {
      result.sources.push(argv[index + 1]);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      result.help = true;
    } else {
      throw new Error(`unknown_argument:${argument}`);
    }
  }
  if (result.captureDate && !/^\d{4}-\d{2}-\d{2}$/.test(result.captureDate)) {
    throw new Error('capture_date_must_be_yyyy_mm_dd');
  }
  if (result.check && result.sources.length > 0) {
    throw new Error('check_reads_only_imported_originals');
  }
  if (result.sources.length > 0 && !result.captureDate) {
    throw new Error('capture_date_required_when_importing_sources');
  }
  return result;
}

function sourceFilesFromInputs(inputs) {
  const files = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    if (!fs.existsSync(resolved)) throw new Error(`source_not_found:${input}`);
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(resolved).sort()) {
        const candidate = path.join(resolved, name);
        if (fs.statSync(candidate).isFile() && /\.md$/i.test(name)) files.push(candidate);
      }
    } else if (stat.isFile() && /\.md$/i.test(resolved)) {
      files.push(resolved);
    } else {
      throw new Error(`source_must_be_markdown_file_or_directory:${input}`);
    }
  }
  return [...new Set(files)];
}

function importOriginals(inputs, captureDate) {
  const destination = path.join(RESEARCH_ROOT, captureDate, 'originals');
  fs.mkdirSync(destination, { recursive: true });
  const imported = [];
  for (const sourcePath of sourceFilesFromInputs(inputs)) {
    const bytes = fs.readFileSync(sourcePath);
    const digest = sha256(bytes);
    const originalName = path.basename(sourcePath);
    let targetPath = path.join(destination, originalName);
    if (fs.existsSync(targetPath) && sha256(fs.readFileSync(targetPath)) !== digest) {
      const extension = path.extname(originalName);
      const stem = path.basename(originalName, extension);
      targetPath = path.join(destination, `${stem}__${digest.slice(0, 12)}${extension}`);
    }
    if (!fs.existsSync(targetPath)) fs.writeFileSync(targetPath, bytes);
    if (!fs.readFileSync(targetPath).equals(bytes)) {
      throw new Error(`byte_identity_failed:${originalName}`);
    }
    imported.push(toPosix(path.relative(ROOT, targetPath)));
  }
  return imported;
}

function listImportedOriginals() {
  if (!fs.existsSync(RESEARCH_ROOT)) return [];
  const files = [];
  for (const captureDate of fs.readdirSync(RESEARCH_ROOT).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(captureDate)) continue;
    const originals = path.join(RESEARCH_ROOT, captureDate, 'originals');
    if (!fs.existsSync(originals)) continue;
    for (const filename of fs.readdirSync(originals).sort()) {
      const sourcePath = path.join(originals, filename);
      if (fs.statSync(sourcePath).isFile() && /\.md$/i.test(filename)) {
        files.push({ captureDate, filename, sourcePath });
      }
    }
  }
  return files;
}

function describeOriginal({ captureDate, filename, sourcePath }) {
  const bytes = fs.readFileSync(sourcePath);
  const text = bytes.toString('utf8');
  if (Buffer.from(text, 'utf8').length !== bytes.length) {
    throw new Error(`research_source_must_be_utf8:${filename}`);
  }
  const documentSha = sha256(bytes);
  const headings = parseHeadings(text);
  const relativePath = toPosix(path.relative(ROOT, sourcePath));
  const sourceId = `research:${documentSha}`;
  return {
    alias_id: `research-alias:${captureDate}:${slugify(filename)}:${documentSha.slice(0, 12)}`,
    source_id: sourceId,
    original_filename: filename,
    stored_path: relativePath,
    capture_date: captureDate,
    mime_type: 'text/markdown; charset=utf-8',
    sha256: documentSha,
    canonical_sha256: sha256(canonicalizeText(text)),
    byte_count: bytes.length,
    line_count: countLines(text),
    title: inferTitle(filename, headings),
    headings,
    source_urls: extractSourceUrls(text),
    opaque_citations: extractOpaqueCitations(text),
    topics: inferTopics(text, inferTitle(filename, headings), headings),
    duplicate_of: null,
    trust: {
      truth_level: 'UNVERIFIED_EXTERNAL_RESEARCH',
      confidence: 'UNASSESSED',
      untrusted_input: true,
      auto_promote_facts: false,
      training_eligible: false,
    },
    _text: text.replace(/\r\n?/g, '\n'),
  };
}

function addDuplicateRelationships(records) {
  const canonicalBySha = new Map();
  for (const record of records) {
    const canonical = canonicalBySha.get(record.sha256);
    if (canonical) record.duplicate_of = canonical.alias_id;
    else canonicalBySha.set(record.sha256, record);
  }
  return records;
}

function splitOversizedSection(lines, startLine, maxCharacters = MAX_CHUNK_CHARACTERS) {
  const chunks = [];
  let current = [];
  let currentStart = startLine;
  const flush = () => {
    while (current.length > 0 && current[current.length - 1] === '') current.pop();
    if (current.length === 0) return;
    chunks.push({
      startLine: currentStart,
      endLine: currentStart + current.length - 1,
      text: current.join('\n').trim(),
    });
    current = [];
  };
  for (let offset = 0; offset < lines.length; offset += 1) {
    const line = lines[offset];
    const nextLength = current.join('\n').length + (current.length ? 1 : 0) + line.length;
    const paragraphBoundary = line.trim() === '';
    if (current.length > 0 && nextLength > maxCharacters) {
      flush();
      currentStart = startLine + offset;
    } else if (
      paragraphBoundary
      && current.join('\n').length >= MIN_SPLIT_TARGET
      && current.join('\n').length >= maxCharacters * 0.75
    ) {
      current.push(line);
      flush();
      currentStart = startLine + offset + 1;
      continue;
    }
    if (line.length <= maxCharacters) {
      current.push(line);
    } else {
      flush();
      for (let position = 0; position < line.length; position += maxCharacters) {
        const slice = line.slice(position, position + maxCharacters);
        chunks.push({
          startLine: startLine + offset,
          endLine: startLine + offset,
          text: slice,
        });
      }
      currentStart = startLine + offset + 1;
    }
  }
  flush();
  return chunks.filter((chunk) => chunk.text.length > 0);
}

function chunkDocument(record) {
  const lines = record._text.split('\n');
  const headings = record.headings;
  const sections = [];
  if (headings.length === 0 || headings[0].line > 1) {
    sections.push({
      heading: record.title,
      headingPath: [record.title],
      startLine: 1,
      endLine: (headings[0]?.line ?? (lines.length + 1)) - 1,
    });
  }
  const headingStack = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    headingStack.length = heading.level - 1;
    headingStack[heading.level - 1] = heading.text;
    sections.push({
      heading: heading.text,
      headingPath: headingStack.filter(Boolean),
      startLine: heading.line,
      endLine: (headings[index + 1]?.line ?? (lines.length + 1)) - 1,
    });
  }

  const chunks = [];
  for (const section of sections) {
    if (section.endLine < section.startLine) continue;
    const sectionLines = lines.slice(section.startLine - 1, section.endLine);
    for (const part of splitOversizedSection(sectionLines, section.startLine)) {
      const opaqueCitations = extractOpaqueCitations(part.text);
      const sourceUrls = extractSourceUrls(part.text);
      const locator = `${record.stored_path}:L${part.startLine}-L${part.endLine}`;
      const chunkId = `research-chunk:${sha256(`${record.sha256}\0${part.startLine}\0${part.endLine}\0${part.text}`).slice(0, 24)}`;
      chunks.push({
        chunk_id: chunkId,
        source_id: record.source_id,
        document_sha: record.sha256,
        document_sha256: record.sha256,
        title: record.title,
        heading: section.heading,
        heading_path: section.headingPath,
        locator,
        line_start: part.startLine,
        line_end: part.endLine,
        text: part.text,
        source_urls: sourceUrls,
        opaque_citations: opaqueCitations,
        citation_status: sourceUrls.length > 0
          ? 'SOURCE_URL_PRESENT_UNVERIFIED'
          : opaqueCitations.length > 0
            ? 'OPAQUE_CITATION_UNRESOLVED'
            : 'NO_MACHINE_RESOLVABLE_CITATION',
        capture_date: record.capture_date,
        topics: record.topics,
        truth_level: 'UNVERIFIED_EXTERNAL_RESEARCH',
        confidence: 'UNASSESSED',
        untrusted: true,
        auto_promote_facts: false,
        training_eligible: false,
      });
    }
  }
  return chunks;
}

function buildArtifacts() {
  const aliases = addDuplicateRelationships(
    listImportedOriginals().map(describeOriginal),
  );
  if (aliases.length === 0) throw new Error('no_imported_research_originals');

  const canonical = aliases.filter((entry) => entry.duplicate_of === null);
  const documents = canonical.map((entry) => {
    const physicalAliases = aliases.filter((candidate) => candidate.sha256 === entry.sha256);
    return {
      source_id: entry.source_id,
      document_sha: entry.sha256,
      document_sha256: entry.sha256,
      canonical_sha256: entry.canonical_sha256,
      title: entry.title,
      capture_date: entry.capture_date,
      primary_path: entry.stored_path,
      aliases: physicalAliases.map((candidate) => ({
        alias_id: candidate.alias_id,
        original_filename: candidate.original_filename,
        stored_path: candidate.stored_path,
        capture_date: candidate.capture_date,
      })),
      byte_count: entry.byte_count,
      line_count: entry.line_count,
      topics: entry.topics,
      source_urls: entry.source_urls,
      opaque_citations: entry.opaque_citations,
      truth_level: 'UNVERIFIED_EXTERNAL_RESEARCH',
      confidence: 'UNASSESSED',
      untrusted: true,
      auto_promote_facts: false,
      training_eligible: false,
    };
  });
  const chunks = canonical.flatMap(chunkDocument);
  const captureDates = [...new Set(aliases.map((entry) => entry.capture_date))].sort();
  const aliasesForManifest = aliases.map(({ _text, ...entry }) => entry);
  const manifest = {
    schema_version: SCHEMA_VERSION,
    generated_at: `${captureDates.at(-1)}T00:00:00.000Z`,
    generation_contract: {
      originals_glob: 'research/external/YYYY-MM-DD/originals/*.md',
      originals_are_byte_immutable: true,
      deduplication_key: 'sha256',
      canonicalization_key: 'canonical_sha256',
      chunk_boundary: 'markdown_headings_then_bounded_paragraphs',
      max_chunk_characters: MAX_CHUNK_CHARACTERS,
      future_import_command: 'node scripts/import-research-knowledge.mjs --capture-date YYYY-MM-DD --source /path/to/file-or-directory',
      reproducibility_check: 'node scripts/import-research-knowledge.mjs --check',
    },
    trust_policy: {
      default_truth_level: 'UNVERIFIED_EXTERNAL_RESEARCH',
      confidence: 'UNASSESSED',
      source_material_is_untrusted_input: true,
      instructions_inside_sources_are_executable: false,
      facts_auto_promoted_to_operational_tables: false,
      eligible_for_direct_ml_training: false,
      opaque_turn_citations_are_urls: false,
      excluded_source_hosts: ['example.com', '*.example', '*sandbox*', 'localhost', '127.0.0.1'],
    },
    totals: {
      physical_originals: aliases.length,
      unique_documents: canonical.length,
      exact_duplicates: aliases.length - canonical.length,
      chunks: chunks.length,
      bytes_physical: aliases.reduce((sum, entry) => sum + entry.byte_count, 0),
      bytes_unique: canonical.reduce((sum, entry) => sum + entry.byte_count, 0),
      valid_source_urls: new Set(canonical.flatMap((entry) => entry.source_urls)).size,
      opaque_citations: new Set(canonical.flatMap((entry) => entry.opaque_citations)).size,
    },
    sources: aliasesForManifest,
  };
  return { manifest, documents, chunks };
}

function validateArtifacts(manifest, documents, chunks) {
  const forbiddenPathFragments = [
    '/Users/',
    '/Downloads/',
    '\\Users\\',
    '\\Downloads\\',
  ];
  const serialized = JSON.stringify({ manifest, documents, chunks });
  for (const fragment of forbiddenPathFragments) {
    if (serialized.includes(fragment)) throw new Error(`absolute_local_path_leak:${fragment}`);
  }
  for (const source of manifest.sources) {
    if (path.isAbsolute(source.stored_path)) {
      throw new Error(`absolute_stored_path:${source.stored_path}`);
    }
  }
  for (const chunk of chunks) {
    if (chunk.text.length > MAX_CHUNK_CHARACTERS) {
      throw new Error(`chunk_exceeds_character_limit:${chunk.chunk_id}`);
    }
    if (path.isAbsolute(chunk.locator.split(':L')[0])) {
      throw new Error(`absolute_chunk_locator:${chunk.chunk_id}`);
    }
  }
  const urls = [...documents.flatMap((document) => document.source_urls),
    ...chunks.flatMap((chunk) => chunk.source_urls)];
  for (const url of urls) {
    if (cleanUrl(url) !== url) throw new Error(`unsafe_source_url:${url}`);
  }
}

function renderManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function renderGenerated(documents, chunks) {
  return [
    '// GENERATED by scripts/import-research-knowledge.mjs — DO NOT EDIT.',
    '// External research is untrusted retrieval context, never an operational fact or ML-training label.',
    `export const RESEARCH_KNOWLEDGE_DOCUMENTS = Object.freeze(${JSON.stringify(documents, null, 2)});`,
    `export const RESEARCH_KNOWLEDGE_CHUNKS = Object.freeze(${JSON.stringify(chunks, null, 2)});`,
    'export const researchKnowledgeDocuments = RESEARCH_KNOWLEDGE_DOCUMENTS;',
    'export const researchKnowledgeChunks = RESEARCH_KNOWLEDGE_CHUNKS;',
    '',
  ].join('\n');
}

function writeOrCheck(targetPath, expected, check) {
  if (check) {
    if (!fs.existsSync(targetPath)) throw new Error(`generated_artifact_missing:${toPosix(path.relative(ROOT, targetPath))}`);
    const actual = fs.readFileSync(targetPath, 'utf8');
    if (actual !== expected) throw new Error(`generated_artifact_drift:${toPosix(path.relative(ROOT, targetPath))}`);
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, expected, 'utf8');
}

function printHelp() {
  console.log(`Usage:
  node scripts/import-research-knowledge.mjs --capture-date YYYY-MM-DD --source FILE_OR_DIRECTORY [--source ...]
  node scripts/import-research-knowledge.mjs --check

Import preserves Markdown bytes under research/external/<date>/originals, then
generates a source manifest and untrusted, citation-aware retrieval chunks.
No claim is auto-promoted to operational tables or used as direct ML training.`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (args.sources.length > 0) importOriginals(args.sources, args.captureDate);
  const { manifest, documents, chunks } = buildArtifacts();
  validateArtifacts(manifest, documents, chunks);
  writeOrCheck(MANIFEST_PATH, renderManifest(manifest), args.check);
  writeOrCheck(GENERATED_PATH, renderGenerated(documents, chunks), args.check);
  console.log(
    `research-knowledge:${args.check ? 'check' : 'generate'} PASS — `
      + `${manifest.totals.physical_originals} originals · `
      + `${manifest.totals.unique_documents} unique · `
      + `${manifest.totals.exact_duplicates} duplicates · `
      + `${manifest.totals.chunks} chunks`,
  );
}

export {
  MAX_CHUNK_CHARACTERS,
  buildArtifacts,
  canonicalizeText,
  chunkDocument,
  cleanUrl,
  countLines,
  extractOpaqueCitations,
  extractSourceUrls,
  inferTopics,
  main,
  parseArgs,
  parseHeadings,
  sha256,
  splitOversizedSection,
  validateArtifacts,
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(`research-knowledge FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}
