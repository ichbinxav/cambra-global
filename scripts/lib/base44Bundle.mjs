import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const BASE44_BUNDLE_SCHEMA_VERSION = "cambra-base44-function-bundle-v2";
export const BASE44_BUNDLE_HASH_ALGORITHM = "sha256-path-bytes-tree-v1";
export const BASE44_PHYSICAL_FUNCTION_TARGET = 276;
// DPA-1 (2026-08-16) — deliberately raised 27 -> 28 for `recordLegalAcceptance`
// (host claimAnonPaymentsResult, source_module base44/shared/legalAcceptance.ts).
// This counter is a deliberateness gate, not a prohibition: a new logical route
// must be a conscious act recorded here, so an action surface can never appear
// on a physical function without the plan noticing. See src/docs/Decision_Log_DPA.md.
// COMMAND-C2 (2026-08-17): 29 -> 30 for commandConversationAdmin, the durable
// CAMBRA Command conversation layer hosted on the existing adminSummaries
// entry point. Physical function count is unchanged at 276.
// COMMAND-C6 (2026-08-17): 30 -> 31 for commandRunAdmin (durable run executor
// admin, also on adminSummaries). Physical stays 276.
// COMMAND-C7 (2026-08-17): 31 -> 32 for commandRunWorker (the scheduled sweep on
// maintenanceEngine). Physical stays 276.
// DASHBOARD-C3 (2026-08-17): 32 -> 33 for pipelineWorkspaceAdmin. Physical stays 276.
export const BASE44_LOGICAL_ROUTE_TARGET = 33;
export const BASE44_FUNCTIONS_DIR = "./.deploy/functions";

const lexical = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const posix = (value) => value.split(path.sep).join("/");

export function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

export function stripJsonComments(source) {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length - 1 && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    output += char;
  }
  return output.replace(/,\s*([}\]])/g, "$1");
}

export function readJsonc(file) {
  return JSON.parse(stripJsonComments(fs.readFileSync(file, "utf8")));
}

export function listTreeFiles(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`base44_bundle_tree_missing:${root}`);
  }
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => lexical(a.name, b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`base44_bundle_symlink_forbidden:${posix(path.relative(root, absolute))}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`base44_bundle_special_file_forbidden:${posix(path.relative(root, absolute))}`);
    }
  };
  walk(root);
  return files;
}

export function computeBase44BundleTree(root) {
  const files = listTreeFiles(root);
  const hash = crypto.createHash("sha256");
  const entries = [];
  for (const file of files) {
    const relativePath = posix(path.relative(root, file));
    const bytes = fs.readFileSync(file);
    entries.push({ path: relativePath, sha256: sha256Bytes(bytes), bytes: bytes.length });
    hash.update(relativePath);
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return {
    algorithm: BASE44_BUNDLE_HASH_ALGORITHM,
    sha256: hash.digest("hex"),
    file_count: files.length,
    entries,
  };
}

export function importSpecifiers(source) {
  const found = new Set();
  const fromPattern = /\b(?:import|export)[^;]*?\bfrom\s*["']([^"']+)["']/g;
  const barePattern = /\bimport\s*["']([^"']+)["']/g;
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const pattern of [fromPattern, barePattern, dynamicPattern]) {
    let match;
    while ((match = pattern.exec(source))) found.add(match[1]);
  }
  return [...found].sort(lexical);
}

function resolveBundledImport(importer, specifier) {
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    unresolved,
    ...[".ts", ".tsx", ".js", ".jsx", ".json"].map((extension) => `${unresolved}${extension}`),
    ...["index.ts", "index.tsx", "index.js", "index.jsx"].map((name) => path.join(unresolved, name)),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

export function inspectContainedBundleImports(functionsRoot) {
  const escaped = [];
  const unresolved = [];
  const physicalFunctions = fs.readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(lexical);
  for (const functionName of physicalFunctions) {
    const physicalRoot = path.join(functionsRoot, functionName);
    for (const file of listTreeFiles(physicalRoot).filter((candidate) => /\.(?:[cm]?[jt]sx?)$/.test(candidate))) {
      for (const specifier of importSpecifiers(fs.readFileSync(file, "utf8"))) {
        if (!specifier.startsWith(".")) continue;
        const resolved = resolveBundledImport(file, specifier);
        const record = {
          function: functionName,
          file: posix(path.relative(physicalRoot, file)),
          specifier,
        };
        if (!resolved) {
          unresolved.push(record);
          continue;
        }
        const relativeToPhysicalRoot = path.relative(physicalRoot, resolved);
        if (relativeToPhysicalRoot.startsWith("..") || path.isAbsolute(relativeToPhysicalRoot)) escaped.push(record);
      }
    }
  }
  return { physical_functions: physicalFunctions, escaped, unresolved };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function inspectBase44Bundle(repoRoot = ".", options = {}) {
  const expectedPhysical = options.expectedPhysical ?? BASE44_PHYSICAL_FUNCTION_TARGET;
  const expectedLogical = options.expectedLogical ?? BASE44_LOGICAL_ROUTE_TARGET;
  const base44Root = path.join(repoRoot, "base44");
  const configPath = path.join(base44Root, "config.jsonc");
  const topologyPath = path.join(base44Root, "deployment-topology.json");
  const deployRoot = path.join(base44Root, ".deploy");
  const manifestPath = path.join(deployRoot, "manifest.json");
  if (!fs.existsSync(configPath)) throw new Error("base44_config_missing");
  if (!fs.existsSync(topologyPath)) throw new Error("base44_deployment_topology_missing");
  if (!fs.existsSync(manifestPath)) throw new Error("base44_bundle_manifest_missing");
  const deployEntries = fs.readdirSync(deployRoot, { withFileTypes: true }).sort((a, b) => lexical(a.name, b.name));
  if (
    deployEntries.length !== 2
    || deployEntries[0].name !== "functions"
    || !deployEntries[0].isDirectory()
    || deployEntries[1].name !== "manifest.json"
    || !deployEntries[1].isFile()
  ) {
    throw new Error(`base44_bundle_unexpected_deploy_entries:${deployEntries.map((entry) => entry.name).join(",")}`);
  }
  const config = readJsonc(configPath);
  if (config.functionsDir !== BASE44_FUNCTIONS_DIR) {
    throw new Error(`base44_functions_dir_invalid:${String(config.functionsDir || "missing")}`);
  }
  const functionsRoot = path.resolve(base44Root, config.functionsDir);
  const expectedFunctionsRoot = path.join(base44Root, ".deploy", "functions");
  if (path.resolve(functionsRoot) !== path.resolve(expectedFunctionsRoot)) throw new Error("base44_functions_dir_resolution_invalid");
  const topology = readJsonc(topologyPath);
  const logicalRoutes = topology.logical_routes || {};
  const manifest = readJsonc(manifestPath);
  if (topology.physical_function_target !== expectedPhysical) throw new Error(`base44_topology_physical_target_invalid:${topology.physical_function_target}`);
  if (Object.keys(logicalRoutes).length !== expectedLogical) throw new Error(`base44_topology_logical_count_invalid:${Object.keys(logicalRoutes).length}`);
  if (manifest.schema_version !== BASE44_BUNDLE_SCHEMA_VERSION) throw new Error(`base44_bundle_schema_invalid:${manifest.schema_version}`);
  if (manifest.hash_algorithm !== BASE44_BUNDLE_HASH_ALGORITHM) throw new Error(`base44_bundle_hash_algorithm_invalid:${manifest.hash_algorithm}`);
  if (manifest.functions_dir !== BASE44_FUNCTIONS_DIR) throw new Error(`base44_bundle_functions_dir_invalid:${manifest.functions_dir}`);
  if (manifest.physical_function_count !== expectedPhysical) throw new Error(`base44_bundle_physical_count_invalid:${manifest.physical_function_count}`);
  if (manifest.logical_route_count !== expectedLogical) throw new Error(`base44_bundle_logical_count_invalid:${manifest.logical_route_count}`);
  if (manifest.topology_sha256 !== sha256File(topologyPath)) throw new Error("base44_bundle_topology_hash_mismatch");
  if (manifest.config_sha256 !== sha256File(configPath)) throw new Error("base44_bundle_config_hash_mismatch");
  if (!sameJson(manifest.logical_routes, logicalRoutes)) throw new Error("base44_bundle_logical_routes_mismatch");
  const imports = inspectContainedBundleImports(functionsRoot);
  if (imports.escaped.length) throw new Error(`base44_bundle_import_escape:${JSON.stringify(imports.escaped.slice(0, 20))}`);
  if (imports.unresolved.length) throw new Error(`base44_bundle_import_unresolved:${JSON.stringify(imports.unresolved.slice(0, 20))}`);
  if (imports.physical_functions.length !== expectedPhysical) throw new Error(`base44_bundle_directory_count_invalid:${imports.physical_functions.length}`);
  if (!sameJson(manifest.physical_functions, imports.physical_functions)) throw new Error("base44_bundle_physical_function_set_mismatch");
  const tree = computeBase44BundleTree(functionsRoot);
  if (manifest.staged_file_count !== tree.file_count) throw new Error(`base44_bundle_file_count_mismatch:${manifest.staged_file_count}:${tree.file_count}`);
  if (manifest.staged_tree_sha256 !== tree.sha256) throw new Error("base44_bundle_tree_hash_mismatch");
  return {
    schema_version: manifest.schema_version,
    functions_dir: config.functionsDir,
    physical_function_count: imports.physical_functions.length,
    logical_route_count: Object.keys(logicalRoutes).length,
    staged_file_count: tree.file_count,
    staged_tree_sha256: tree.sha256,
    hash_algorithm: tree.algorithm,
    topology_sha256: sha256File(topologyPath),
    config_sha256: sha256File(configPath),
    manifest_sha256: sha256File(manifestPath),
    escaped_relative_import_count: imports.escaped.length,
    unresolved_relative_import_count: imports.unresolved.length,
    physical_functions: imports.physical_functions,
  };
}

export function assertReleaseBundleIdentity(release, identity, label = "bundle") {
  if (!release || !identity) throw new Error(`${label}_identity_missing`);
  if (release.backendDeploymentTopologySha !== identity.topology_sha256) throw new Error(`${label}_topology_sha_mismatch`);
  if (release.backendBundleManifestSha !== identity.manifest_sha256) throw new Error(`${label}_manifest_sha_mismatch`);
  const expected = release.backendBundle || {};
  if (expected.physicalFunctionCount !== identity.physical_function_count) throw new Error(`${label}_physical_count_mismatch`);
  if (expected.logicalRouteCount !== identity.logical_route_count) throw new Error(`${label}_logical_count_mismatch`);
  if (expected.stagedFileCount !== identity.staged_file_count) throw new Error(`${label}_file_count_mismatch`);
  if (expected.stagedTreeSha256 !== identity.staged_tree_sha256) throw new Error(`${label}_tree_sha_mismatch`);
  if (expected.hashAlgorithm !== identity.hash_algorithm) throw new Error(`${label}_hash_algorithm_mismatch`);
  if (expected.functionsDir !== identity.functions_dir) throw new Error(`${label}_functions_dir_mismatch`);
  if (expected.configSha256 !== identity.config_sha256) throw new Error(`${label}_config_sha_mismatch`);
  return true;
}
