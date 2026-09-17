import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
import {imageNodeInput,applyImageResult} from '../src/jobs/node-input.js';
const model={output_type:'image',scalar_params:[{name:'resolution',default:'1k',enum:['1k','2k']}],media_params:[]};
const doc={rev:2,cards:[{id:'p',kind:'prompt',prompt:'light'},{id:'g',kind:'generate',prompt:'bowl',genParams:{model:'gpt-image-2',count:1}}],connections:[{fromId:'p',toId:'g'}],view:{x:40}};
test('node inputs follow prompt/reference edges and exclude own generated result',()=>{
 const input=imageNodeInput({canvasId:'c',revision:2,nodes:[{id:'p',kind:'prompt',x:0,y:0,data:{prompt:'light'}},{id:'r',kind:'result',x:0,y:0,data:{url:'https://example.test/ref.png'}},{id:'g',kind:'generate',x:0,y:0,data:{prompt:'bowl',model:'image',url:'https://example.test/old.png',results:[{url:'https://example.test/old.png',itemStatus:'success'}]}}],edges:[{id:'a',from:'p',to:'g'},{id:'b',from:'r',to:'g'}]},'g',{edit:model},[{key:'image',t2:'image',i2:'edit',media:'image'}]);
 assert.equal(input.body.prompt,'light\nbowl');assert.equal(input.body.model,'edit');assert.deepEqual(input.body.imageUrls,['https://example.test/ref.png']);
});
test('result merge preserves concurrent manual edits, selection, edges and viewport',()=>{
 const edited={...doc,rev:9,cards:[{id:'g',kind:'generate',prompt:'edited',x:91,url:'manual',activeResultIndex:0,results:[{url:'manual',itemStatus:'success'}]}]};
 const merged=applyImageResult(edited,'g','op',{url:'/api/files/media_files/new.png'});
 assert.equal(merged.doc.rev,10);assert.equal(merged.doc.cards[0].prompt,'edited');assert.equal(merged.doc.cards[0].url,'manual');assert.equal(merged.doc.cards[0].results.length,2);assert.equal(merged.doc.view,edited.view);
 assert.equal(applyImageResult(merged.doc,'g','op',{url:'another'}).doc,merged.doc);
 assert.equal(applyImageResult(edited,'gone','op',{}).applyState,'target_missing');
});
const source=buildSync({entryPoints:['src/jobs/pocketbase.ts'],bundle:true,write:false,format:'cjs',platform:'neutral',target:'es2017'}).outputFiles[0]!.text;
function fixture(){
 let count=0,submits=0,unknown=false;const records=new Map<string,any>();
 class Rec{ id='job'+(++count);values:any={};constructor(_c?:unknown){}get(k:string){const v=this.values[k];return typeof v==='object'?JSON.stringify(v):v;}getBool(k:string){return !!this.values[k];}set(k:string,v:unknown){this.values[k]=v;}}
 const canvas=new Rec();canvas.id='c';canvas.values={rh_user_id:'alice',canvas_data:structuredClone(doc)};records.set('c',canvas);
 const app:any={findCollectionByNameOrId:()=> 'jobs',findRecordById:(_c:string,id:string)=>{if(!records.has(id))throw Error();return records.get(id);},save:(r:any)=>records.set(r.id,r),findRecordsByFilter:()=>[],runInTransaction:(fn:any)=>fn(app)};
 const module={exports:{} as any};
 vm.runInNewContext(source,{module,exports:module.exports,console,Record:Rec,$app:app,$os:{getenv:()=> 'http://127.0.0.1:8090'},$http:{send:(request:any)=>{
   const path=new URL(request.url).pathname;let result:any;
   if(path==='/api/aigc/models')result={models:[{model:'gpt-image-2',...model}]};
   else if(path==='/api/agent-bridge/v1/wallet-quote')result={ok:true,estimatedPrice:0.1,priceText:'¥0.10'};
   else if(path==='/api/aigc/submit'){submits++;if(unknown)throw Error('timeout');result={ok:true,taskId:'remote',chargeAmount:0.1};}
   else if(path.includes('/poll'))result={status:'SUCCESS',outputs:[{url:'https://runninghub.cn/result.png'}]};
   else if(path==='/api/media/save-remote')result={url:'/api/files/media_files/result.png'};
   else throw Error('unexpected '+path);
   return {statusCode:200,raw:JSON.stringify(result)};
 }}});
 const invoke=(action:string,body:any={},jobId='')=>module.exports.handle({get:()=> 'alice',request:{pathValue:(key:string)=>key==='id'?'c':jobId},requestInfo:()=>({body,headers:{authorization:'Bearer fixture'}}),json:(status:number,data:any)=>({status,data})},action);
 return {invoke,canvas,records,submits:()=>submits,unknown:()=>{unknown=true;}};
}
test('quote approval is persisted, version-bound, and duplicate node runs submit once',()=>{
 const f=fixture();const q=f.invoke('quote',{nodeId:'g',expectedRevision:2});assert.equal(q.status,200);
 const input={quoteId:q.data.id,nodeId:'g',expectedRevision:2,operationId:'operation'};
 assert.equal(f.invoke('run',input).data.error,'APPROVAL_REQUIRED');assert.equal(f.submits(),0);
 assert.equal(f.invoke('approve',{},q.data.id).status,200);
 assert.equal(f.invoke('run',input).data.state,'submitted');assert.equal(f.invoke('run',input).data.state,'submitted');assert.equal(f.submits(),1);
 f.canvas.values.canvas_data.rev=3;f.canvas.values.canvas_data.cards[1].prompt='manual edit';
 const finished=f.invoke('get',{},q.data.id);assert.equal(finished.data.state,'succeeded');assert.equal(finished.data.applyState,'applied');assert.equal(f.canvas.values.canvas_data.cards[1].prompt,'manual edit');
 assert.equal(f.invoke('get',{},q.data.id).data.applyState,'applied');assert.equal(f.canvas.values.canvas_data.cards[1].results.length,1);
});
test('uncertain submission stays durable and never automatically retries',()=>{
 const f=fixture();const q=f.invoke('quote',{nodeId:'g',expectedRevision:2});f.invoke('approve',{},q.data.id);f.unknown();
 const input={quoteId:q.data.id,nodeId:'g',expectedRevision:2,operationId:'operation'};
 assert.equal(f.invoke('run',input).data.state,'submission_unknown');assert.equal(f.invoke('run',input).data.state,'submission_unknown');assert.equal(f.invoke('get',{},q.data.id).data.state,'submission_unknown');assert.equal(f.submits(),1);
});
test('manual change invalidates unsubmitted approved quote',()=>{
 const f=fixture();const q=f.invoke('quote',{nodeId:'g',expectedRevision:2});f.invoke('approve',{},q.data.id);f.canvas.values.canvas_data.rev=3;
 assert.equal(f.invoke('run',{quoteId:q.data.id,nodeId:'g',expectedRevision:2,operationId:'operation'}).data.error,'REVISION_CONFLICT');assert.equal(f.submits(),0);
});
