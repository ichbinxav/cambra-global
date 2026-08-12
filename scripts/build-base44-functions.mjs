#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const base44Root = path.join(repoRoot, 'base44');
const sourceRoot = path.join(base44Root, 'functions');
const deployRoot = path.join(base44Root, '.deploy');
const outputRoot = path.join(deployRoot, 'functions');
const topologyPath = path.join(base44Root, 'deployment-topology.json');
const topology = JSON.parse(fs.readFileSync(topologyPath, 'utf8'));
const logicalRoutes = topology.logical_routes || {};
const logicalNames = new Set(Object.keys(logicalRoutes));

function stripJsonComments(source) {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      output += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length - 1 && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 1;
      continue;
    }
    output += char;
  }
  return output.replace(/,\s*([}\]])/g, '$1');
}

function readConfig(functionName) {
  const configPath = path.join(sourceRoot, functionName, 'function.jsonc');
  if (!fs.existsSync(configPath)) return { name: functionName, entry: 'entry.ts' };
  const parsed = JSON.parse(stripJsonComments(fs.readFileSync(configPath, 'utf8')));
  if (parsed.name && parsed.name !== functionName) throw new Error(`${configPath}: name must match its directory`);
  return { ...parsed, name: functionName, entry: parsed.entry || 'entry.ts' };
}

function resolveRelativeImport(importer, specifier) {
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [unresolved, ...['.ts', '.tsx', '.js', '.jsx', '.json'].map((extension) => `${unresolved}${extension}`), ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map((name) => path.join(unresolved, name))];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) throw new Error(`Unresolved relative import ${specifier} from ${path.relative(repoRoot, importer)}`);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Import escapes repository: ${specifier} from ${path.relative(repoRoot, importer)}`);
  return resolved;
}

function importSpecifiers(source) {
  const found = new Set();
  const fromPattern = /\b(?:import|export)[^;]*?\bfrom\s*[\"']([^\"']+)[\"']/g;
  const barePattern = /\bimport\s*[\"']([^\"']+)[\"']/g;
  const dynamicPattern = /\bimport\s*\(\s*[\"']([^\"']+)[\"']\s*\)/g;
  for (const pattern of [fromPattern, barePattern, dynamicPattern]) {
    let match;
    while ((match = pattern.exec(source))) found.add(match[1]);
  }
  return [...found];
}

function bundledRelativePath(sourcePath) {
  const relative = path.relative(repoRoot, sourcePath);
  const digest = crypto.createHash('sha256').update(relative.replaceAll(path.sep, '/')).digest('hex').slice(0, 12);
  const basename = path.basename(relative) === 'entry.ts' ? 'entry.module.ts' : path.basename(relative);
  return path.join('_deps', `${digest}-${basename}`);
}

function copyDependencyClosure(entryPath, destinationRoot) {
  const queue = [entryPath];
  const copied = new Set();
  while (queue.length) {
    const sourcePath = queue.pop();
    if (copied.has(sourcePath)) continue;
    copied.add(sourcePath);
    const destination = path.join(destinationRoot, bundledRelativePath(sourcePath));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    let source = fs.readFileSync(sourcePath, 'utf8');
    if (!/\.(?:[cm]?[jt]sx?)$/.test(sourcePath)) {
      fs.writeFileSync(destination, source);
      continue;
    }
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveRelativeImport(sourcePath, specifier);
      queue.push(resolved);
      let rewritten = path.relative(path.dirname(bundledRelativePath(sourcePath)), bundledRelativePath(resolved)).replaceAll(path.sep, '/');
      if (!rewritten.startsWith('.')) rewritten = `./${rewritten}`;
      source = source.replaceAll(`'${specifier}'`, `'${rewritten}'`).replaceAll(`"${specifier}"`, `"${rewritten}"`);
    }
    fs.writeFileSync(destination, source);
  }
  return copied;
}

function treeHash(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push(absolute);
    }
  }
  walk(root);
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(root, file).replaceAll(path.sep, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return { sha256: hash.digest('hex'), file_count: files.length };
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const sourceDirectories = fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
for (const [logicalName, route] of Object.entries(logicalRoutes)) {
  if (!sourceDirectories.includes(logicalName)) throw new Error(`Topology logical source is missing: ${logicalName}`);
  if (!sourceDirectories.includes(route.host)) throw new Error(`Topology physical host is missing: ${route.host}`);
  if (logicalNames.has(route.host)) throw new Error(`Logical route ${logicalName} cannot be hosted by logical route ${route.host}`);
}

const physicalNames = sourceDirectories.filter((name) => !logicalNames.has(name));
if (physicalNames.length !== topology.physical_function_target) throw new Error(`Physical function count ${physicalNames.length} != topology target ${topology.physical_function_target}`);

let copiedModuleCount = 0;
for (const functionName of physicalNames) {
  const sourceConfig = readConfig(functionName);
  const sourceEntry = path.join(sourceRoot, functionName, sourceConfig.entry);
  if (!fs.existsSync(sourceEntry)) throw new Error(`${functionName}: entry not found: ${sourceConfig.entry}`);
  const destination = path.join(outputRoot, functionName);
  fs.mkdirSync(destination, { recursive: true });
  const bundledEntry = `./${bundledRelativePath(sourceEntry).replaceAll(path.sep, '/')}`;
  const sourceEntryText = fs.readFileSync(sourceEntry, 'utf8');
  const rootEntry = /\bexport\s+default\b/.test(sourceEntryText)
    ? `export { default } from '${bundledEntry}';\n`
    : `import '${bundledEntry}';\n`;
  fs.writeFileSync(path.join(destination, 'entry.ts'), rootEntry);
  fs.writeFileSync(path.join(destination, 'function.jsonc'), `${JSON.stringify({ ...sourceConfig, entry: 'entry.ts' }, null, 2)}\n`);
  copiedModuleCount += copyDependencyClosure(sourceEntry, destination).size;
}

const escapedImports = [];
for (const functionName of physicalNames) {
  const root = path.join(outputRoot, functionName);
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) files.push(absolute);
    }
  };
  walk(root);
  for (const file of files) {
    for (const specifier of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), specifier);
      if (!resolved.startsWith(`${root}${path.sep}`)) escapedImports.push({ function: functionName, file: path.relative(root, file), specifier });
    }
  }
}
if (escapedImports.length) throw new Error(`Bundled relative imports escape physical function roots: ${JSON.stringify(escapedImports.slice(0, 20))}`);

const digest = treeHash(outputRoot);
const manifest = {
  schema_version: 'cambra-base44-function-bundle-v1',
  physical_function_count: physicalNames.length,
  logical_route_count: logicalNames.size,
  copied_module_instances: copiedModuleCount,
  staged_file_count: digest.file_count,
  staged_tree_sha256: digest.sha256,
  physical_functions: physicalNames,
  logical_routes: logicalRoutes,
};
fs.writeFileSync(path.join(deployRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`base44:functions:bundle PASS — ${physicalNames.length} physical functions, ${logicalNames.size} logical routes, ${digest.file_count} staged files, ${digest.sha256}`);
