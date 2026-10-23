import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=new URL('../src/',import.meta.url);
function files(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(directory,entry.name);
    return entry.isDirectory()?files(file):file.endsWith('.js')?[file]:[];
  });
}
test('Backend layers keep HTTP and database responsibilities separate',()=>{
  for(const file of files(fileURLToPath(root))){
    const code=fs.readFileSync(file,'utf8');
    const layer=path.basename(path.dirname(file));
    const imports=[...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(match=>match[1]);
    for(const dependency of imports.filter(value=>value.startsWith('.'))){
      assert(fs.existsSync(path.resolve(path.dirname(file),dependency)),`${file}: missing ${dependency}`);
    }
    if(layer==='routes')assert(!imports.some(value=>/repositories|\/config\/database/.test(value)),`${file}: routes must not access the database`);
    if(layer==='controllers')assert(!imports.some(value=>/repositories|\/config\/database/.test(value)),`${file}: controllers must call services`);
    if(layer==='services'){
      assert(!imports.some(value=>value==='express'||/\/routes\/|\/controllers\//.test(value)),`${file}: services must not depend on HTTP routes/controllers`);
      assert(!/\b(?:one|rows|insert)\s*\(/.test(code),`${file}: query execution belongs in repositories`);
    }
    if(layer==='repositories')assert(!imports.some(value=>value==='express'||/\/services\/|\/controllers\/|\/routes\/|\/middlewares\//.test(value)),`${file}: repositories must not depend on higher layers`);
  }
});
