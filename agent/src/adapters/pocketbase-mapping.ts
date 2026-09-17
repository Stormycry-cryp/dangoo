import type { CanvasSnapshot, CanvasNode } from '../contracts/index.js';
export { applyCanvasOperations, NODE_CATALOG, SUPPORTED_OPERATIONS } from './canvas-operations.js';
/** Maps without discarding host-only fields (result history, camera configuration, crop state). */
export function fromDangoo(canvasId:string,doc:Record<string,unknown>):CanvasSnapshot {
  const cards=Array.isArray(doc.cards)?doc.cards:[];
  return {canvasId,revision:Number(doc.rev)||0,nodes:cards.map(raw=>{
    const {id,kind,x,y,...data}=raw as Record<string,unknown>;
    return {id:String(id),kind:String(kind),x:Number(x),y:Number(y),data};
  }),edges:(Array.isArray(doc.connections)?doc.connections:[]).map(raw=>{const e=raw as Record<string,unknown>;return {id:String(e.id),from:String(e.fromId),to:String(e.toId)};})};
}
export function toDangoo(current:Record<string,unknown>,snapshot:CanvasSnapshot):Record<string,unknown>{
  const priorEdges=(Array.isArray(current.connections)?current.connections:[]) as Record<string,unknown>[];
  return {...current,rev:snapshot.revision,cards:snapshot.nodes.map((node:CanvasNode)=>{
    const {width,height,...data}=node.data;
    return {...data,id:node.id,kind:node.kind,x:node.x,y:node.y,w:width??data.w??288,h:height??data.h??200};
  }),connections:snapshot.edges.map(e=>({...priorEdges.find(old=>old.id===e.id),id:e.id,fromId:e.from,toId:e.to}))};
}
