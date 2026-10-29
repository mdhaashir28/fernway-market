// Lists English texts in the app that have no Tamil translation in src/i18n/ta.ts.
//
//   npm run check-translations          → report missing / unused texts
//   npm run check-translations -- --list → print every text the app translates
//
// It finds texts passed to t('…') (including t(cond ? '…' : '…')), plus the
// texts in a few lookup tables that are translated later (status labels,
// error messages, help questions, weekdays).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
// Tables of English texts that are passed to t() later on.
const TABLES = new Set(['STATUS_LABELS', 'CODE_MESSAGES', 'SUPPORT_TOPICS', 'FAQ', 'WEEKDAYS', 'statusMessage']);
const isIdentifierLike = (text) => /^[a-z0-9_.:/-]*$/.test(text);

function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(full);
    return /\.(tsx?)$/.test(entry.name) && !full.endsWith(`${path.sep}ta.ts`) ? [full] : [];
  });
}

function stringsIn(node, out) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  else if (ts.isConditionalExpression(node)) {
    stringsIn(node.whenTrue, out);
    stringsIn(node.whenFalse, out);
  } else if (ts.isParenthesizedExpression(node)) stringsIn(node.expression, out);
}

function tableStrings(node, out) {
  const visit = (n) => {
    if (ts.isPropertyAssignment(n)) {
      // { id: 'missing_item', label: '…' } — skip ids, keep texts
      return visit(n.initializer);
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !isIdentifierLike(n.text)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(node);
}

const used = new Map(); // text → first file
for (const file of walkFiles(root)) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const add = (text) => {
    if (text.trim() && !used.has(text)) used.set(text, path.relative(root, file));
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && node.arguments[0]) {
      const found = [];
      stringsIn(node.arguments[0], found);
      found.forEach(add);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && TABLES.has(node.name.text) && node.initializer) {
      const found = [];
      tableStrings(node.initializer, found);
      found.forEach(add);
    }
    if (ts.isFunctionDeclaration(node) && node.name && TABLES.has(node.name.text) && node.body) {
      const found = [];
      tableStrings(node.body, found);
      found.forEach(add);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (process.argv.includes('--list')) {
  for (const text of [...used.keys()].sort()) console.log(JSON.stringify(text));
  process.exit(0);
}

// Read the keys of ta.ts without running it.
const taSource = ts.createSourceFile('ta.ts', fs.readFileSync(path.join(root, 'i18n', 'ta.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const translated = new Set();
const collectKeys = (node) => {
  if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name) || ts.isIdentifier(node.name))) translated.add(node.name.text);
  ts.forEachChild(node, collectKeys);
};
collectKeys(taSource);

const missing = [...used.entries()].filter(([text]) => !translated.has(text));
const unused = [...translated].filter((text) => !used.has(text));

console.log(`${used.size} texts used in the app, ${translated.size} Tamil translations.`);
if (missing.length) {
  console.log(`\nMissing Tamil (${missing.length}):`);
  for (const [text, file] of missing) console.log(`  ${JSON.stringify(text)}  — ${file}`);
}
if (unused.length) {
  console.log(`\nIn ta.ts but not found in the app (${unused.length}) — server messages are fine here:`);
  for (const text of unused) console.log(`  ${JSON.stringify(text)}`);
}
process.exitCode = missing.length ? 1 : 0;
