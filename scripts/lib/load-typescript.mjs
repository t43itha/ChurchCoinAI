import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import ts from "typescript";

// Execute the production decision helpers in offline/API evaluations without
// maintaining a second implementation or adding an SDK/runtime dependency.
const urls = new Map();
function moduleUrl(filename) {
  filename = path.resolve(filename);
  if (urls.has(filename)) return urls.get(filename);
  let code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  code = code.replace(/\bfrom\s+(["'])([^"']+)\1/g, (_match, _quote, specifier) => {
    if (!specifier.startsWith(".")) return `from ${JSON.stringify(import.meta.resolve(specifier))}`;
    const base = path.resolve(path.dirname(filename), specifier);
    const resolved = [base, `${base}.ts`, `${base}.js`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${filename}`);
    return `from ${JSON.stringify(moduleUrl(resolved))}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  urls.set(filename, url);
  return url;
}

export const loadTypeScript = (filename) => import(moduleUrl(filename));
