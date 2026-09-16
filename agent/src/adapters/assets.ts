import type { AssetGateway, AssetRef, AssetSearch, Scope } from '../contracts/index.js';

export class IntegrationError extends Error {
  constructor(public code:string, message:string, public retryable=false, public status?:number) { super(message); this.name='IntegrationError'; }
}
/** Explicitly unavailable: an empty inventory would incorrectly imply that no assets exist. */
export class UnavailableAssetGateway implements AssetGateway {
  readonly available=false;
  private unavailable():never { throw new IntegrationError('ASSET_INTEGRATION_UNAVAILABLE','资产服务尚未接通；请先配置资产接入，不能把 URL 或节点 ID 当作资产 ID。'); }
  async search(_scope:Scope,_query:AssetSearch):Promise<never> { return this.unavailable(); }
  async get(_scope:Scope,_ref:AssetRef):Promise<never> { return this.unavailable(); }
  async view(_scope:Scope,_ref:AssetRef):Promise<never> { return this.unavailable(); }
}
