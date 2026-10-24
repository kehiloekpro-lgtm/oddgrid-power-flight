import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
const cache = new Map();
export function moduleUrl(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const source = readFileSync(file, "utf8").replace(
    /from "(\.\.?\/[^"\n]+\.ts)"/g,
    (_, path) => `from ${JSON.stringify(moduleUrl(resolve(dirname(file), path)))}`,
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  cache.set(file, url);
  return url;
}
