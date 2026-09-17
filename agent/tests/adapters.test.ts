import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalCanvasGateway,applyCanvasOperations,UnavailableAssetGateway,createCanvasTools,HttpDangooGateway} from '../src/adapters/index.js';
import type {CanvasSnapshot,ToolContext} from '../src/contracts/index.js';
import {ToolRegistry} from '../src/core/tool-registry.js';
const scope={ownerId:'alice',canvasId:'art'};
const node={id:'n1',kind:'prompt',x:1,y:2,data:{prompt:'blue'}};
test('hosted bridge forwards PB token only through the configured header',async()=>{
 const requests:Headers[]=[];
 const bridge=await HttpDangooGateway.connect({baseUrl:'https://example.com/__pb/api/agent-bridge/v1/',scope,tokenFor:async()=> 'test-token',authHeader:'X-Pb-Auth',fetch:async(_url,init)=>{
  requests.push(new Headers(init?.headers));
  return new Response(JSON.stringify({contractVersion:'1.0.0',revision:'1',nodes:[],operations:[],jobs:false,assets:false}));
 }});
 await bridge.read(scope);
 assert.equal(requests.length,2);
 for(const headers of requests){assert.equal(headers.get('X-Pb-Auth'),'test-token');assert.equal(headers.get('Authorization'),null);}
});
test('canvas transaction persists revisions and idempotency; different payload and tenant rejected',async()=>{
 const g=new LocalCanvasGateway(':memory:');g.seed(scope);
 const input={expectedRevision:0,operationId:'op1',operations:[{type:'create' as const,node}]};
 assert.equal((await g.apply(scope,input)).revision,1);assert.equal((await g.apply(scope,input)).revision,1);
 await assert.rejects(g.apply(scope,{...input,expectedRevision:1}),/不同请求/);
 await assert.rejects(g.apply(scope,{...input,operationId:'op2'}),/画布已更新/);
 await assert.rejects(g.read({...scope,ownerId:'bob'}),/无权/);
 assert.equal((await g.read(scope)).nodes.length,1);g.close();
});
test('invalid operation cannot partially mutate graph; no execution fields or graph cycles',()=>{
 const doc:CanvasSnapshot={canvasId:'art',revision:0,nodes:[node,{...node,id:'n2'}],edges:[{id:'e1',from:'n1',to:'n2'}]};
 assert.throws(()=>applyCanvasOperations(doc,[{type:'update',nodeId:'n1',patch:{prompt:'changed'}},{type:'connect',edge:{id:'e2',from:'n2',to:'n1'}}]),/环/);
 assert.equal(doc.nodes[0].data.prompt,'blue');
 assert.throws(()=>applyCanvasOperations(doc,[{type:'update',nodeId:'n1',patch:{taskId:'forged'}}]),/不允许/);
});
test('asset absence is explicit and no fake job tool is offered',async()=>{
 const g=new LocalCanvasGateway(':memory:');const a=new UnavailableAssetGateway();const tools=createCanvasTools(g,a);
 assert(!tools.some(t=>t.name==='node_run'));
 const ctx={session:{scope}} as ToolContext;
 const r=await tools.find(t=>t.name==='asset_search')!.execute({},ctx);
 assert.equal(r.error?.code,'ASSET_INTEGRATION_UNAVAILABLE');g.close();
});
test('bridge refuses incompatible contract and remote cleartext credentials',async()=>{
 await assert.rejects(HttpDangooGateway.connect({baseUrl:'http://example.com/api/',tokenFor:async()=> 'secret',scope}),/HTTPS/);
 await assert.rejects(HttpDangooGateway.connect({baseUrl:'https://example.com/api/',tokenFor:async()=> 'secret',scope,fetch:async()=>new Response(JSON.stringify({contractVersion:'2.0.0'}))}),/不兼容/);
});
test('canvas tool advertises the complete operation shape and rejects guessed flat create arguments',()=>{
 const canvas=new LocalCanvasGateway(':memory:');const registry=new ToolRegistry(createCanvasTools(canvas,new UnavailableAssetGateway()));
 registry.validate('canvas_apply',{expectedRevision:0,operations:[{type:'create',node}]});
 assert.throws(()=>registry.validate('canvas_apply',{expectedRevision:0,operations:[{type:'create',...node}]}),/invalid|validation|match|required/i);
 canvas.close();
});
