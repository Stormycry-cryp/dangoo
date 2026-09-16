import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as mapping from '../src/adapters/pocketbase-mapping.js';

class FakeRecord {
  id='canvas1'; values:Record<string,unknown>={};
  constructor(collection?:unknown){if(collection==='ops')this.id='op-record';}
  get(k:string){const v=this.values[k];return v&&typeof v==='object'?JSON.stringify(v):v;}
  getBool(k:string){return Boolean(this.values[k]);}
  set(k:string,v:unknown){this.values[k]=v;}
}
function fixture(){
 const routes=new Map<string,(e:any)=>any>();
 const record=new FakeRecord();record.values={rh_user_id:'alice',canvas_data:{version:1,rev:2,cards:[{id:'node1',kind:'prompt',x:0,y:0,w:200,h:150,prompt:'old',cameraSnapshot:{name:'keep'}}],connections:[],view:{x:9,y:8,scale:1},pendingJobs:[{remoteTaskId:'keep'}]}};
 let receipts:FakeRecord[]=[];let failReceipt=false;let txCount=0;
 const app:any={findRecordById:()=>record,findCollectionByNameOrId:()=> 'ops',findRecordsByFilter:(_c:any,_f:any,_s:any,_l:any,_o:any,p:any)=>receipts.filter(r=>r.values.owner===p.o&&r.values.canvas===p.c&&r.values.operation_id===p.i),save:(r:FakeRecord)=>{if(r!==record){if(failReceipt)throw Error('disk');receipts.push(r);}},runInTransaction:(fn:(x:any)=>void)=>{txCount++;const old=structuredClone(record.values),oldReceipts=[...receipts];try{fn(app);}catch(e){record.values=old;receipts=oldReceipts;throw e;}}};
 const context={onBootstrap:()=>{},routerAdd:(method:string,path:string,handler:(e:any)=>any)=>routes.set(method+' '+path,handler),$app:app,$security:{sha256:(s:string)=>createHash('sha256').update(s).digest('hex')},require:()=>mapping,__hooks:'/test',Record:FakeRecord,Collection:class{}};
 vm.runInNewContext(fs.readFileSync(new URL('../integrations/pocketbase/agent-bridge.pb.js',import.meta.url),'utf8'),context);
 const event=(owner:string,body:any={})=>({get:()=>owner,request:{pathValue:()=> 'canvas1'},requestInfo:()=>({body}),json:(status:number,data:any)=>({status,data})});
 const invoke=(owner:string,body:any)=>routes.get('POST /api/agent-bridge/v1/canvases/{id}/operations')!(event(owner,body));
 return {invoke,record,routes,event,fail:()=>{failReceipt=true;},txCount:()=>txCount};
}
const input={operationId:'change-1',expectedRevision:2,operations:[{type:'update',nodeId:'node1',patch:{prompt:'new'}}]};
test('PB bridge owner check, immutable idempotency receipts and host field preservation',()=>{
 const f=fixture();assert.equal(f.invoke('',input).status,401);assert.equal(f.invoke('bob',input).status,404);
 const success=f.invoke('alice',input);assert.equal(success.status,200);assert.equal(success.data.revision,3);
 assert.equal(f.invoke('alice',input).data.revision,3);
 assert.equal(f.invoke('alice',{operations:[{patch:{prompt:'new'},nodeId:'node1',type:'update'}],expectedRevision:2,operationId:'change-1'}).status,200);
 assert.equal(f.invoke('alice',{...input,expectedRevision:3}).status,409);
 const doc=JSON.parse(f.record.get('canvas_data') as string);assert.equal(doc.cards[0].prompt,'new');assert.equal(doc.cards[0].cameraSnapshot.name,'keep');assert.equal(doc.view.x,9);assert.equal(doc.pendingJobs[0].remoteTaskId,'keep');
});
test('PB bridge receipt failure rolls back canvas mutation',()=>{
 const f=fixture();f.fail();assert.equal(f.invoke('alice',input).status,500);
 assert.equal(JSON.parse(f.record.get('canvas_data') as string).rev,2);
});
test('PB bridge revision conflict cannot overwrite a newer manual document',()=>{
 const f=fixture();assert.equal(f.invoke('alice',{...input,expectedRevision:1}).status,409);
 assert.equal(JSON.parse(f.record.get('canvas_data') as string).cards[0].prompt,'old');
});
test('host mapping preserves connection slots and unrelated document content',()=>{
 const doc={rev:1,cards:[{id:'a',kind:'prompt',x:0,y:0,w:200,h:100}],connections:[{id:'e',fromId:'a',toId:'b',toSlot:'front'}],projectAssets:{entries:['keep']}};
 const result=mapping.toDangoo(doc,mapping.fromDangoo('canvas',doc));
 assert.deepEqual(result,doc);
});
