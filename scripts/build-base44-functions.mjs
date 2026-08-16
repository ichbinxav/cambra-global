#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  BASE44_BUNDLE_HASH_ALGORITHM,
  BASE44_BUNDLE_SCHEMA_VERSION,
  computeBase44BundleTree,
  inspectBase44Bundle,
  sha256File,
} from './lib/base44Bundle.mjs';

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

// `.deploy` is an ignored, generated boundary. Remove it as a unit so stale or
// unbound files can never leak into a release artifact beside the verified
// manifest and functions tree.
fs.rmSync(deployRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const sourceDirectories = fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
for (const [logicalName, route] of Object.entries(logicalRoutes)) {
  const logicalDirectoryExists = sourceDirectories.includes(logicalName);
  const sourceModule = route.source_module ? path.join(repoRoot, route.source_module) : null;
  if (!logicalDirectoryExists && (!sourceModule || !fs.existsSync(sourceModule))) {
    throw new Error(`Topology logical source is missing: ${logicalName}`);
  }
  if (!sourceDirectories.includes(route.host)) throw new Error(`Topology physical host is missing: ${route.host}`);
  if (logicalNames.has(route.host) && sourceDirectories.includes(route.host)) throw new Error(`Logical route ${logicalName} cannot be hosted by logical route ${route.host}`);
}

const logicalDirectories = new Set([...logicalNames].filter((name) => sourceDirectories.includes(name)));
const physicalNames = sourceDirectories.filter((name) => !logicalDirectories.has(name));
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

const digest = computeBase44BundleTree(outputRoot);
const manifest = {
  schema_version: BASE44_BUNDLE_SCHEMA_VERSION,
  hash_algorithm: BASE44_BUNDLE_HASH_ALGORITHM,
  functions_dir: './.deploy/functions',
  topology_sha256: sha256File(topologyPath),
  config_sha256: sha256File(path.join(base44Root, 'config.jsonc')),
  physical_function_count: physicalNames.length,
  logical_route_count: logicalNames.size,
  copied_module_instances: copiedModuleCount,
  staged_file_count: digest.file_count,
  staged_tree_sha256: digest.sha256,
  physical_functions: physicalNames,
  logical_routes: logicalRoutes,
};
fs.writeFileSync(path.join(deployRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const verified = inspectBase44Bundle(repoRoot);
console.log(`base44:functions:bundle PASS — ${verified.physical_function_count} physical functions, ${verified.logical_route_count} logical routes, ${verified.staged_file_count} staged files, ${verified.staged_tree_sha256}`);
