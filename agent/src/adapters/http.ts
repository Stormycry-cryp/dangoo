import type { AssetAccess, AssetGateway, AssetRecord, AssetRef, AssetSearch, CanvasGateway, CanvasOperation, CanvasSnapshot, JobRecord, Scope } from '../contracts/index.js';
import { CONTRACT_VERSION } from '../contracts/index.js';
import { IntegrationError } from './assets.js';

export interface BridgeCapabilities extends ReturnType<CanvasGateway['capabilities']> {assets:boolean;}
/** Versioned Dangoo bridge client. Credentials are injected by the server; never accepted from a model. */
export class HttpDangooGateway implements CanvasGateway, AssetGateway {
  private constructor(private base:URL,private tokenFor:(scope:Scope)=>Promise<string>,private caps:BridgeCapabilities,private fetcher:typeof fetch){}
  static async connect(options:{baseUrl:string;tokenFor:(scope:Scope)=>Promise<string>;scope:Scope;fetch?:typeof fetch}){
    const base=new URL(options.baseUrl.endsWith('/')?options.baseUrl:options.baseUrl+'/');
    if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)))throw new IntegrationError('INVALID_BRIDGE_URL','业务桥接须使用 HTTPS 或本机地址');
    if(base.username||base.password||base.search||base.hash)throw new IntegrationError('INVALID_BRIDGE_URL','业务桥接地址不得含认证信息、查询或片段');
    const instance=new HttpDangooGateway(base,options.tokenFor,{contractVersion:CONTRACT_VERSION,revision:'pending',nodes:[],operations:[],jobs:false,assets:false},options.fetch??fetch);
    const caps=await instance.request<BridgeCapabilities>(options.scope,'capabilities');
    if(caps.contractVersion?.split('.')[0]!==CONTRACT_VERSION.split('.')[0]||!caps.revision||!Array.isArray(caps.nodes)||!Array.isArray(caps.operations)||typeof caps.jobs!=='boolean'||typeof caps.assets!=='boolean')throw new IntegrationError('BRIDGE_VERSION_MISMATCH','画布桥接契约不兼容');
    instance.caps=structuredClone(caps);return instance;
  }
  get available(){return this.caps.assets;}
  capabilities(){return structuredClone(this.caps);}
  private async request<T>(scope:Scope,path:string,body?:unknown):Promise<T>{
    const token=await this.tokenFor(scope);if(!token)throw new IntegrationError('AUTH_REQUIRED','画布授权已失效');
    const response=await this.fetcher(new URL(path,this.base),{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Agent-Contract':CONTRACT_VERSION},body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok){let code='BRIDGE_ERROR';try{const info=await response.json() as {error?:string};if(typeof info.error==='string'&&/^[A-Z_]{1,64}$/.test(info.error))code=info.error;}catch{}throw new IntegrationError(code,`业务接口请求失败 (${response.status})`,[429,502,503,504].includes(response.status));}
    return await response.json() as T;
  }
  read(scope:Scope){return this.request<CanvasSnapshot>(scope,`canvases/${encodeURIComponent(scope.canvasId)}`);}
  apply(scope:Scope,input:{expectedRevision:number;operationId:string;operations:CanvasOperation[]}){return this.request<{revision:number;operationId:string}>(scope,`canvases/${encodeURIComponent(scope.canvasId)}/operations`,input);}
  async operation(scope:Scope,id:string){return (await this.request<{revision:number;operationId:string}|null>(scope,`canvases/${encodeURIComponent(scope.canvasId)}/operations/${encodeURIComponent(id)}`))??undefined;}
  run(scope:Scope,input:{nodeId:string;operationId:string;expectedRevision:number}){if(!this.caps.jobs)throw new IntegrationError('CAPABILITY_UNAVAILABLE','生成任务接口尚未接通');return this.request<JobRecord>(scope,`canvases/${encodeURIComponent(scope.canvasId)}/jobs`,input);}
  job(scope:Scope,id:string){return this.request<JobRecord>(scope,`canvases/${encodeURIComponent(scope.canvasId)}/jobs/${encodeURIComponent(id)}`);}
  cancel(scope:Scope,id:string){return this.request<JobRecord>(scope,`canvases/${encodeURIComponent(scope.canvasId)}/jobs/${encodeURIComponent(id)}/cancel`,{});}
  search(scope:Scope,query:AssetSearch){if(!this.available)throw new IntegrationError('ASSET_INTEGRATION_UNAVAILABLE','资产服务尚未接通');return this.request<{items:AssetRecord[];nextCursor?:string}>(scope,`canvases/${encodeURIComponent(scope.canvasId)}/assets/search`,query);}
  get(scope:Scope,ref:AssetRef){if(!this.available)throw new IntegrationError('ASSET_INTEGRATION_UNAVAILABLE','资产服务尚未接通');return this.request<AssetRecord>(scope,`canvases/${encodeURIComponent(scope.canvasId)}/assets/${encodeURIComponent(ref.assetId)}/versions/${ref.version}`);}
  view(scope:Scope,ref:AssetRef){if(!this.available)throw new IntegrationError('ASSET_INTEGRATION_UNAVAILABLE','资产服务尚未接通');return this.request<AssetAccess>(scope,`canvases/${encodeURIComponent(scope.canvasId)}/assets/${encodeURIComponent(ref.assetId)}/versions/${ref.version}/access`,{purpose:'vision'});}
}
