import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const root=dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root,'public'),{recursive:true});

await build({
  entryPoints:[join(root,'src/main.js')],
  bundle:true, minify:true, format:'esm', target:'es2020',
  outfile:join(root,'public/game.js'),
  logLevel:'info',
});

const fonts=[
  ['Barlow Condensed',700,'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2'],
  ['Barlow Condensed',800,'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2'],
  ['Inter',400,'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2'],
  ['Inter',600,'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2'],
  ['Inter',700,'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2'],
];
let fontCss='';
for(const [fam,weight,path] of fonts){
  const b64=readFileSync(join(root,path)).toString('base64');
  fontCss+=`@font-face{font-family:'${fam}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}\n`;
}
const css=fontCss+readFileSync(join(root,'src/style.css'),'utf8');
writeFileSync(join(root,'public/style.css'),css);

const html=readFileSync(join(root,'public/index.html'),'utf8');
const js=readFileSync(join(root,'public/game.js'),'utf8').replace(/<\/script/g,'<\\/script');
const standalone=html
  .replace('<link rel="stylesheet" href="style.css"/>',`<style>${css}</style>`)
  .replace('<script type="module" src="game.js"></script>',`<script type="module">${js}</script>`);
writeFileSync(join(root,'game.html'),standalone);
writeFileSync(join(root,'public/game.html'),standalone);
console.log('Built public/ and standalone game.html');
