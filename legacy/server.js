import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname, normalize } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const root=join(dirname(fileURLToPath(import.meta.url)),'public');
const port=process.env.PORT||3000;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent(new URL(req.url,'http://x').pathname);
    if(p==='/') p='/index.html';
    const fp=normalize(join(root,p));
    if(!fp.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    const s=await stat(fp).catch(()=>null);
    const file=s&&s.isFile()?fp:join(root,'index.html');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(data);
  }catch(e){ res.writeHead(404); res.end('Not found'); }
}).listen(port,'0.0.0.0',()=>console.log(`SUPERLEAGUE running at http://0.0.0.0:${port}`));
