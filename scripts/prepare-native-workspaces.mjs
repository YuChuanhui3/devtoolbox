import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const require=createRequire(import.meta.url);
const root=resolve(import.meta.dirname,'..');
const copy=(from,to)=>{mkdirSync(dirname(to),{recursive:true});cpSync(from,to,{recursive:true});};
const moduleRoot=name=>dirname(require.resolve(`${name}/package.json`));
const pdf=moduleRoot('pdfjs-dist');
for(const dir of ['cmaps','standard_fonts','wasm','iccs'])copy(`${pdf}/${dir}`,`${root}/public/native/pdf/pdfjs/${dir}`);
const version=JSON.parse(readFileSync(`${pdf}/package.json`,'utf8')).version;
copy(`${pdf}/wasm`,`${root}/public/assets/pdfjs-${version}`);
for(const [to,from] of Object.entries({
 'worker.min.js':`${moduleRoot('tesseract.js')}/dist/worker.min.js`,
 'core':moduleRoot('tesseract.js-core'),
 'lang/eng.traineddata.gz':`${moduleRoot('@tesseract.js-data/eng')}/4.0.0_best_int/eng.traineddata.gz`,
 'LICENSE-tesseract.js.md':`${moduleRoot('tesseract.js')}/LICENSE.md`,
}))copy(from,`${root}/public/native/pdf/ocr/${to}`);
console.log('Native PDF / whiteboard decoder and OCR resources prepared.');

await build({ entryPoints: [resolve(root,'src/native-workspaces/pdf/pdf-worker.js')], outfile: resolve(root,'public/native/pdf/pdf-worker.mjs'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true });

const worker = await build({ entryPoints: [resolve(root,'src/native-workspaces/whiteboard/worker/index.js')], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, write: false, define: { __WORKER_BUILD__: '"__WHITEBOARD_WORKER_BUILD__"', __WORKER_BUILT_AT__: '"__WHITEBOARD_WORKER_BUILT_AT__"' } });
const code=worker.outputFiles[0].text;
const buildId=createHash('sha256').update(code).digest('hex').slice(0,16);
const builtAt=Date.now();
const output=code.replaceAll('__WHITEBOARD_WORKER_BUILD__',buildId).replaceAll('"__WHITEBOARD_WORKER_BUILT_AT__"',String(builtAt));
mkdirSync(resolve(root,'public/native/whiteboard/worker'),{recursive:true});
writeFileSync(resolve(root,'public/native/whiteboard/worker/whiteboard-worker.js'),`/* whiteboard-worker build=${buildId} at=${builtAt} */\n${output}`);
