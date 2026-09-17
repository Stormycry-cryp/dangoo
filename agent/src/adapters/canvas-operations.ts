import type { CanvasSnapshot, CanvasOperation, NodeCapability } from '../contracts/index.js';
import { IntegrationError } from './assets.js';
function clone<T>(value:T):T { return JSON.parse(JSON.stringify(value)); }
const kinds=['prompt','generate','polish','result','video','layer','replicate','agent','loop','merge','tts','motion','vsr','camera'];
export const NODE_CATALOG:NodeCapability[]=kinds.map(kind=>({kind,name:kind,description:`Dangoo ${kind} 节点；执行能力以服务端握手为准`,runnable:false,parameters:{type:'object',properties:{title:{type:'string',maxLength:160},prompt:{type:'string',maxLength:24000},model:{type:'string',maxLength:120},width:{type:'number',minimum:64,maximum:4096},height:{type:'number',minimum:64,maximum:4096}},additionalProperties:false}}));
export const SUPPORTED_OPERATIONS:CanvasOperation['type'][]=['create','update','delete','duplicate','connect','disconnect','layout','group','ungroup'];
export const GENERATION_PARAMETERS={type:'object',properties:{model:{type:'string',maxLength:120},resolution:{enum:['1k','2k','4k']},aspectRatio:{type:'string',maxLength:16},quality:{enum:['low','medium','high']},count:{const:1}},additionalProperties:false};
for(const node of NODE_CATALOG)if(node.kind==='generate')(node.parameters.properties as Record<string,unknown>).genParams=GENERATION_PARAMETERS;
const writable=new Set(['title','prompt','model','width','height','genParams']);
const invalid=(message:string):never=>{throw new IntegrationError('INVALID_OPERATION',message);};
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1_000_000;
const id=(s:unknown)=>typeof s==='string'&&/^[\w.-]{1,128}$/.test(s);

/** Pure reducer shared by the fixture and a future transactional host bridge. */
export function applyCanvasOperations(source:CanvasSnapshot, changes:CanvasOperation[]):CanvasSnapshot {
  if(!Array.isArray(changes)||changes.length<1||changes.length>100) invalid('每次事务须包含 1–100 个操作；大任务可分批。');
  const doc=clone(source);
  const node=(nodeId:string)=>doc.nodes.find(n=>n.id===nodeId)??invalid(`节点不存在: ${nodeId}`);
  const patch=(value:Record<string,unknown>)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)) invalid('patch 必须为对象');
    for(const [key,v] of Object.entries(value)){
      if(!writable.has(key)) invalid(`不允许写入字段: ${key}`);
      if(['title','prompt','model'].includes(key)&&(typeof v!=='string'||v.length>(key==='prompt'?24000:160))) invalid('文本字段不合法');
      if(['width','height'].includes(key)&&(!finite(v)||Number(v)<64||Number(v)>4096)) invalid('尺寸不合法');
      if(key==='genParams'){
        if(!v||typeof v!=='object'||Array.isArray(v))invalid('生成参数必须为对象');
        for(const [name,value] of Object.entries(v as Record<string,unknown>)){
          if(!Object.prototype.hasOwnProperty.call(GENERATION_PARAMETERS.properties,name))invalid('不支持的生成参数');
          if(name==='count'){if(value!==1)invalid('当前只支持单张生成');}
          else if(typeof value!=='string'||value.length>120)invalid('生成参数格式错误');
          if(name==='resolution'&&!['1k','2k','4k'].includes(String(value)))invalid('分辨率不支持');
          if(name==='quality'&&!['low','medium','high'].includes(String(value)))invalid('质量不支持');
        }
      }
    }
    return clone(value);
  };
  for(const op of changes){
    if(!op||typeof op!=='object'||!SUPPORTED_OPERATIONS.includes(op.type)) invalid('当前桥接不支持该操作');
    switch(op.type){
      case 'create': {
        const n=op.node;
        if(!n||!id(n.id)||doc.nodes.some(x=>x.id===n.id)||!kinds.includes(n.kind)||!finite(n.x)||!finite(n.y)) invalid('新节点 ID、类型或位置不合法');
        doc.nodes.push({id:n.id,kind:n.kind,x:n.x,y:n.y,data:patch(n.data)});break;
      }
      case 'update': Object.assign(node(op.nodeId).data,patch(op.patch));break;
      case 'delete': node(op.nodeId);doc.nodes=doc.nodes.filter(n=>n.id!==op.nodeId);doc.edges=doc.edges.filter(e=>e.from!==op.nodeId&&e.to!==op.nodeId);break;
      case 'duplicate': {
        if(!id(op.newId)||doc.nodes.some(n=>n.id===op.newId)||!finite(op.x)||!finite(op.y)) invalid('副本 ID 或位置不合法');
        const n=clone(node(op.nodeId)); n.id=op.newId;n.x=op.x;n.y=op.y;
        // Runtime outputs and running task identifiers are intentionally not inherited.
        n.data=Object.fromEntries(Object.entries(n.data).filter(([k])=>writable.has(k)));
        doc.nodes.push(n);break;
      }
      case 'connect': {
        const e=op.edge; if(!e||!id(e.id)||doc.edges.some(x=>x.id===e.id)||e.from===e.to) invalid('连线不合法');
        node(e.from);node(e.to);
        if(doc.edges.some(x=>x.from===e.from&&x.to===e.to)) invalid('重复连线');
        const seen=new Set<string>(); const reaches=(a:string):boolean=>{if(a===e.from)return true;if(seen.has(a))return false;seen.add(a);return doc.edges.filter(x=>x.from===a).some(x=>reaches(x.to));};
        if(reaches(e.to))invalid('连线会形成环');doc.edges.push(clone(e));break;
      }
      case 'disconnect': if(!doc.edges.some(e=>e.id===op.edgeId))invalid('连线不存在');doc.edges=doc.edges.filter(e=>e.id!==op.edgeId);break;
      case 'layout': if(!Array.isArray(op.positions))invalid('缺少位置列表');for(const p of op.positions){if(!finite(p.x)||!finite(p.y))invalid('位置不合法');Object.assign(node(p.nodeId),{x:p.x,y:p.y});}break;
      case 'group': if(!id(op.id)||!Array.isArray(op.nodeIds)||!op.nodeIds.length)invalid('分组不合法');for(const n of op.nodeIds)node(n).data.groupId=op.id;break;
      case 'ungroup': for(const n of doc.nodes)if(n.data.groupId===op.id)delete n.data.groupId;break;
    }
  }
  doc.revision++;
  return doc;
}
