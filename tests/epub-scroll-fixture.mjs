// Prepare an isolated browser fixture without starting Papery or a device.
// node tests/epub-scroll-fixture.mjs
// python -m http.server 3187 --bind 127.0.0.1 --directory output/diagnostics/epub-scroll
// playwright-cli run-code --filename tests/epub-scroll-regression.template.js --raw
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'output/diagnostics/epub-scroll');
fs.mkdirSync(output, { recursive: true });
for (const name of ['epub-continuous', 'epub-scroll-layout', 'reading-progress', 'reading-scheduler']) {
  const filename = path.join(root, 'app/lib', name + '.ts');
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  const compiled = outputText.replace(/from "(\.\/[^\"]+)"/g, (_, relative) => 'from "' + relative + '.js"');
  fs.writeFileSync(path.join(output, name + '.js'), compiled);
}
fs.copyFileSync(path.join(root, 'tests/fixtures/epub-scroll.html'), path.join(output, 'cycles.html'));
console.log('Isolated EPUB fixture prepared: ' + output);
