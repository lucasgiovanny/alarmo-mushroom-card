import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..');
export const source = fs.readFileSync(
  path.join(root, 'dist', 'alarmo-mushroom-card.js'), 'utf8');

/* The packaged card is a DOM-dependent IIFE, so it cannot be imported. Values
   are sliced out of the source text by matching brackets and evaluated on
   their own — the same trick the Tesla card's tests use. */
export function sliceBalanced(marker, open, close) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `could not find "${marker}" in the bundle`);
  const from = source.indexOf(open, start);
  assert.notEqual(from, -1, `could not find "${open}" after "${marker}"`);
  let depth = 0;
  let inString = null;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  assert.fail(`unbalanced ${open}${close} after "${marker}"`);
}

export function evaluate(expression, scope = {}) {
  const names = Object.keys(scope);
  return new Function(...names, `return (${expression});`)(...names.map((n) => scope[n]));
}

export function flatten(obj, prefix = '', out = []) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, dotted, out);
    else out.push(dotted);
  }
  return out;
}

export function ok(name) {
  console.log(`  ok  ${name}`);
}

/* Slice a function by name, braces balanced. Handles both a top-level
   `function name(...)` declaration and a class method `name(...) {`. */
export function sliceFunction(name) {
  let start = source.indexOf(`function ${name}(`);
  if (start === -1) {
    const method = new RegExp(`\\n\\s*(?:async\\s+)?${name}\\(`);
    const match = method.exec(source);
    assert.ok(match, `could not find function or method ${name}`);
    start = match.index;
  }
  const body = sliceBalancedFrom(source.indexOf('{', source.indexOf(')', start)));
  return source.slice(start, body.end + 1);
}

function sliceBalancedFrom(from) {
  let depth = 0;
  let inString = null;
  let inComment = null;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (inComment === 'line') { if (ch === '\n') inComment = null; continue; }
    if (inComment === 'block') { if (ch === '*' && next === '/') { inComment = null; i += 1; } continue; }
    if (inString) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '/' && next === '/') { inComment = 'line'; i += 1; continue; }
    if (ch === '/' && next === '*') { inComment = 'block'; i += 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return { end: i }; }
  }
  assert.fail('unbalanced braces');
}

/* Build a sandbox containing the named declarations plus whatever preamble the
   caller needs, and return its exported names. */
export function sandbox(preamble, names) {
  const parts = [preamble];
  for (const name of names) parts.push(sliceFunction(name));
  parts.push(`return {${names.join(',')}};`);
  return new Function(parts.join('\n'))();
}
