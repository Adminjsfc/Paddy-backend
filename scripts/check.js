import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
function visit(dir){for(const f of fs.readdirSync(dir)){const p=path.join(dir,f);if(fs.statSync(p).isDirectory())visit(p);else if(p.endsWith('.js'))execFileSync(process.execPath,['--check',p],{stdio:'inherit'});}}
for(const d of ['src','scripts','test'])visit(d);
for(const f of fs.readdirSync('postman').filter(f=>f.endsWith('.json')))JSON.parse(fs.readFileSync(path.join('postman',f),'utf8'));
console.log('JavaScript syntax and Postman JSON valid');
