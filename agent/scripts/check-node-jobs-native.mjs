import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const binary=process.argv[2];if(!binary)throw Error('PocketBase binary path required');
const dir=await mkdtemp(join(tmpdir(),'dangoo-jobs-'));
const hooks=join(dir,'pb_hooks');
execFileSync(process.execPath,['scripts/build-host-bridge.mjs',hooks],{stdio:'inherit'});
await writeFile(join(hooks,'00-fixture.pb.js'),`
routerUse(function(e){e.set('authEmail','fixture@example.test');if(e.request.url.path==='/api/agent-bridge/v1/wallet-quote')return e.json(200,{ok:true,estimatedPrice:0.1,currency:'CNY'});return e.next()})
onBootstrap(function(e){e.next();try{$app.findCollectionByNameOrId('canvases')}catch(_){$app.save(new Collection({name:'canvases',type:'base',fields:[{name:'rh_user_id',type:'text'},{name:'canvas_data',type:'json'},{name:'is_deleted',type:'bool'}]}))}})
routerAdd('POST','/fixture/canvas',function(e){var r=new Record($app.findCollectionByNameOrId('canvases'));r.set('rh_user_id','fixture@example.test');r.set('canvas_data',{rev:0,cards:[{id:'image',kind:'generate',x:0,y:0,prompt:'A bowl',genParams:{model:'gpt-image-2',count:1}}],connections:[]});$app.save(r);return e.json(200,{id:r.id})})
routerAdd('GET','/api/aigc/models',function(e){return e.json(200,{models:[{model:'gpt-image-2',output_type:'image',scalar_params:[],media_params:[]}]})})
routerAdd('POST','/api/aigc/submit',function(e){return e.json(200,{ok:true,taskId:'fixture-task',chargeAmount:0.1})})
routerAdd('POST','/api/aigc/jobs/{task}/poll',function(e){return e.json(200,{ok:true,status:'SUCCESS',outputs:[{url:'https://runninghub.cn/fixture.png'}]})})
routerAdd('POST','/api/media/save-remote',function(e){return e.json(200,{ok:true,url:'/api/files/media_files/fixture/test.png'})})
`);
const port=18107;
const child=spawn(resolve(binary),['serve','--http',`127.0.0.1:${port}`,'--dir',join(dir,'pb_data'),'--hooksDir',hooks],{env:{...process.env,AGENT_AIGC_INTERNAL_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
async function call(path,body){const r=await fetch(`http://127.0.0.1:${port}`+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});return {status:r.status,data:await r.json()};}
try{
 for(let i=0;i<50;i++){try{await call('/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const created=await call('/fixture/canvas',{});assert.equal(created.status,200,JSON.stringify(created));
 const base='/api/agent-bridge/v1/canvases/'+created.data.id;
 const quote=await call(base+'/quotes',{nodeId:'image',expectedRevision:0});assert.equal(quote.status,200,JSON.stringify(quote));
 const input={quoteId:quote.data.id,nodeId:'image',expectedRevision:0,operationId:'native-operation'};
 assert.equal((await call(base+'/jobs',input)).status,403);
 assert.equal((await call(base+'/quotes/'+quote.data.id+'/approve',{})).status,200);
 const submitted=await call(base+'/jobs',input);assert.equal(submitted.data.state,'submitted',JSON.stringify(submitted));
 const replay=await call(base+'/jobs',input);assert.equal(replay.data.remoteId,'fixture-task');
 const completed=await call(base+'/jobs/'+quote.data.id);assert.equal(completed.data.applyState,'applied',JSON.stringify(completed));assert.equal(completed.data.storageState,'stored');
 const read=await call(base);assert.equal(read.data.nodes[0].data.results.length,1);assert.equal(read.data.revision,1);
 await call(base+'/jobs/'+quote.data.id);const second=await call(base);assert.equal(second.data.revision,1);
 console.log('Native PocketBase node quote -> approve -> submit -> poll -> store -> canvas append PASS (fixture media API, no paid requests)');
}catch(error){console.error(logs);throw error;}finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true});}
