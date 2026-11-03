'use strict';

// Edit game-source.html for the game, or the original JS/CSS files for modules.
// This builder changes packaging only; it never rewrites glyphs or grading code.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createGlyphFiles, writeGlyphFiles } = require('./build-glyph-files.cjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = 'game-source.html';
const OUTPUT_FILES = ['index.html', '汉字魔法门_4.html'];
const SCRIPT_FILES = [
  'curriculum-data.js', 'practice-selector.js', 'sentence-hints.js',
  'game-feedback.js', 'glyph-catalog.js', 'glyph-loader.js',
];
const CSS_FILE = 'game-feedback.css';
const GLYPH_FILES = ['hanzi-data.js', 'curriculum-hanzi-data.js'];
const NOTICE = '<!-- 由 tools/build-page.cjs 生成。游戏逻辑请改 game-source.html；模块请改各 JS/CSS 原文件，再重新构建。 -->';
const SCRIPT_TAG = /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;
const STYLE_TAG = /<style\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/style\s*>/gi;
const LINK_TAG = /<link\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
const RESOURCE_TAG = new RegExp(SCRIPT_TAG.source + '|' + LINK_TAG.source, 'gi');
const HTML_TAG = /<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;

function attributes(raw) {
  const out = Object.create(null);
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of raw.matchAll(pattern)) {
    const key = match[1].toLowerCase();
    if (Object.hasOwn(out, key)) throw new Error('Duplicate HTML attribute: ' + key);
    out[key] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return out;
}

function decoded(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
    if (entity.startsWith('&#')) {
      const code = /^&#x/i.test(entity) ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }[entity.toLowerCase()];
  });
}

function isRemote(value) {
  return /^(?:https?:|\/\/)/i.test(decoded(value).trim());
}

function localFile(url) {
  const raw = decoded(url).trim();
  if (/^(?:[a-z][\w+.-]*:|\/)/i.test(raw)) throw new Error('Startup resource must be local: ' + raw);
  let file;
  try { file = decodeURIComponent(raw.split(/[?#]/)[0]); }
  catch (_) { throw new Error('Invalid resource URL: ' + raw); }
  file = file.replace(/^\.\//, '');
  if (!file || file.includes('\\') || file.split('/').includes('..')) throw new Error('Invalid local resource: ' + raw);
  return file;
}

function escapeClosingTag(source, tag) {
  return source.replace(new RegExp('</' + tag, 'gi'), match => '<\\/' + match.slice(2));
}

function validateCss(css, label) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@import\b/i.test(withoutComments)) throw new Error(label + ': CSS @import would add another startup request');
  for (const match of withoutComments.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    if (isRemote(match[1] ?? match[2] ?? match[3] ?? '')) throw new Error(label + ': external CSS URL');
  }
}

function assertNoStartupLinks(html) {
  // Only inspect actual markup, not provenance URLs or on-demand fetch URLs
  // inside JavaScript. XML namespace declarations are also not network loads.
  for (const match of html.matchAll(SCRIPT_TAG)) {
    if (Object.hasOwn(attributes(match[1]), 'src')) throw new Error('Unbundled startup script');
  }
  const markup = html.replace(SCRIPT_TAG, '').replace(STYLE_TAG, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const match of markup.matchAll(HTML_TAG)) {
    const tag = match[1].toLowerCase(), attrs = attributes(match[2]);
    if (tag === 'script' && Object.hasOwn(attrs, 'src')) throw new Error('Unbundled startup script');
    for (const name of ['src', 'href', 'poster', 'data', 'srcset']) {
      if (Object.hasOwn(attrs, name) && (isRemote(attrs[name]) ||
        (name === 'srcset' && /(?:^|,)\s*(?:https?:|\/\/)/i.test(decoded(attrs[name]))))) {
        throw new Error('External HTML resource remains: <' + tag + '> ' + name + '=' + attrs[name]);
      }
    }
    if (tag === 'link' && (attrs.rel || '').toLowerCase().split(/\s+/).includes('stylesheet')) {
      throw new Error('Unbundled stylesheet remains: ' + attrs.href);
    }
    if (attrs.style) validateCss(attrs.style, '<' + tag + '> style');
  }
  for (const match of html.matchAll(STYLE_TAG)) validateCss(match[2], 'Inline stylesheet');
}

function inlinePage(source, readAsset) {
  const assets = [], scripts = [], styles = [];
  function inlineScript(tag, raw, body) {
    const attrs = attributes(raw);
    if (!Object.hasOwn(attrs, 'src')) return tag;
    if (body.trim()) throw new Error('External script must not also contain inline code');
    if (Object.keys(attrs).some(key => key !== 'src')) {
      throw new Error('External scripts must be ordered classic scripts with only src: ' + attrs.src);
    }
    const file = localFile(attrs.src);
    if (!SCRIPT_FILES.includes(file)) throw new Error('Unexpected startup script: ' + file);
    if (scripts.some(entry => entry.file === file)) throw new Error('Duplicate startup script: ' + file);
    const original = readAsset(file), code = escapeClosingTag(original, 'script');
    new vm.Script(code, { filename: file });
    assets.push({ file, source: original });
    scripts.push({ file, code });
    return '<script data-source="' + file + '">\n' + code + '\n</script>';
  }
  function inlineStylesheet(tag, raw) {
    const attrs = attributes(raw);
    if (!(attrs.rel || '').toLowerCase().split(/\s+/).includes('stylesheet')) return tag;
    const file = localFile(attrs.href || '');
    if (file !== CSS_FILE) throw new Error('Unexpected startup stylesheet: ' + file);
    if (Object.keys(attrs).some(key => key !== 'href' && key !== 'rel')) {
      throw new Error('Stylesheet has attributes that cannot be silently removed: ' + file);
    }
    if (styles.length) throw new Error('Duplicate startup stylesheet: ' + file);
    const original = readAsset(file);
    validateCss(original, file);
    assets.push({ file, source: original });
    styles.push(file);
    return '<style data-source="' + file + '">\n' + escapeClosingTag(original, 'style') + '\n</style>';
  }
  // Match the original document once. Markup-like strings inside newly embedded
  // JavaScript must remain raw source and must not be processed as HTML links.
  let html = source.replace(RESOURCE_TAG, (tag, raw, body, linkRaw) =>
    raw === undefined ? inlineStylesheet(tag, linkRaw) : inlineScript(tag, raw, body));
  if (scripts.length !== SCRIPT_FILES.length || SCRIPT_FILES.some(file => !scripts.some(entry => entry.file === file))) {
    throw new Error('Expected all six local startup scripts exactly once');
  }
  if (styles.length !== 1) throw new Error('Expected game-feedback.css exactly once');
  if (!/^\s*<!doctype html>/i.test(html)) throw new Error('Source must begin with the HTML doctype');
  html = html.replace(/^(\s*<!doctype html>)[\t ]*(?:\r?\n)?/i, '$1\n' + NOTICE + '\n');
  assertNoStartupLinks(html);
  return { html, assets, scripts, styles };
}

function glyphSnapshot(entries) {
  const context = vm.createContext({ window: {} });
  for (const file of GLYPH_FILES) {
    const entry = entries.find(candidate => candidate.file === file);
    if (!entry) throw new Error('Missing glyph source: ' + file);
    vm.runInContext(entry.source ?? entry.code, context, { filename: file, timeout: 5000 });
  }
  const glyphs = context.window.HANZI_LOCAL_DATA;
  if (!glyphs || typeof glyphs !== 'object') throw new Error('Glyph data did not load');
  const chars = Object.keys(glyphs).sort();
  for (const char of chars) {
    const glyph = glyphs[char];
    if (!Array.isArray(glyph.strokes) || !Array.isArray(glyph.medians) || !glyph.strokes.length ||
      glyph.strokes.length !== glyph.medians.length) throw new Error('Invalid glyph geometry: ' + char);
  }
  return { count: chars.length, json: JSON.stringify(chars.map(char => [char, glyphs[char]])) };
}

function verifyGlyphGeometry(assets, scripts, expectedCount = 167) {
  const original = glyphSnapshot(assets), bundled = glyphSnapshot(scripts);
  if (original.count !== expectedCount) throw new Error('Expected ' + expectedCount + ' original glyphs, got ' + original.count);
  if (original.json !== bundled.json) throw new Error('Bundling changed the original glyph geometry');
  return { count: original.count, sha256: crypto.createHash('sha256').update(original.json).digest('hex') };
}

function bytes(text) { return Buffer.byteLength(text, 'utf8'); }
function gzipBytes(text) { return zlib.gzipSync(Buffer.from(text), { level: 9 }).length; }

function buildPage(projectRoot = ROOT) {
  const source = fs.readFileSync(path.join(projectRoot, SOURCE_FILE), 'utf8');
  const result = inlinePage(source, file => fs.readFileSync(path.join(projectRoot, file), 'utf8'));
  // The large frozen bundles are the authoritative build inputs, not startup
  // scripts. Check the actual on-demand files/catalog against all 167 objects.
  const frozen = createGlyphFiles(projectRoot);
  writeGlyphFiles(frozen, projectRoot, true);
  const glyphs = { count: frozen.summary.glyphCount, sha256: frozen.summary.geometrySha256 };
  const multiFileBytes = bytes(source) + result.assets.reduce((sum, asset) => sum + bytes(asset.source), 0);
  const multiFileGzip = gzipBytes(source) + result.assets.reduce((sum, asset) => sum + gzipBytes(asset.source), 0);
  const singlePageGzip = gzipBytes(result.html);
  return { ...result, summary: {
    source: SOURCE_FILE, outputs: OUTPUT_FILES, scripts: result.scripts.map(entry => entry.file), styles: result.styles,
    glyphs, startupAssetRequestsRemoved: result.assets.length,
    bytes: { multiFile: multiFileBytes, singlePage: bytes(result.html) },
    gzipBytes: { multiFile: multiFileGzip, singlePage: singlePageGzip, saved: multiFileGzip - singlePageGzip },
    compressionComparison: 'gzip level 9; source HTML and critical JS/CSS compressed separately versus the combined HTML; excludes HTTP headers, scene images, and lazy glyph/pinyin data',
  } };
}

function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--check')) throw new Error('Usage: node tools/build-page.cjs [--check]');
  const result = buildPage();
  for (const file of OUTPUT_FILES) {
    const target = path.join(ROOT, file);
    if (args.includes('--check')) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== result.html) {
        throw new Error(file + ' differs from the source; run node tools/build-page.cjs');
      }
    } else fs.writeFileSync(target, result.html);
  }
  console.log(JSON.stringify({ mode: args.includes('--check') ? 'check' : 'build', ...result.summary }, null, 2));
}

module.exports = { inlinePage, buildPage, verifyGlyphGeometry, assertNoStartupLinks, SCRIPT_FILES, CSS_FILE, OUTPUT_FILES };
if (require.main === module) {
  try { main(); }
  catch (error) { console.error('Page build failed: ' + error.message); process.exitCode = 1; }
}
