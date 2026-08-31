import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourceRoot = path.resolve("src");
const allowedTenantSeedFiles = new Set([
  path.normalize("src/lib/data/organization-profile.ts"),
]);
const forbiddenIdentity = /Triangle Services|Nikola Kralj|\bNikola\b|\bRalph\b/g;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(fullPath);
      return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

const violations = [];
for (const file of await sourceFiles(sourceRoot)) {
  const relative = path.normalize(path.relative(process.cwd(), file));
  if (allowedTenantSeedFiles.has(relative)) continue;
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(forbiddenIdentity)) {
    const line = content.slice(0, match.index).split("\n").length;
    violations.push(`${relative}:${line}: ${match[0]}`);
  }
}

if (violations.length > 0) {
  console.error(
    "Tenant identity regression: hardcoded operator identity found outside the approved tenant-zero profile:\n" +
      violations.join("\n"),
  );
  process.exit(1);
}

console.log("Tenant identity check passed.");
