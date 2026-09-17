import {OpenAICompatibleProvider} from '../src/providers/index.js';
const model=process.env.AGENT_MODEL||'glm-5.3-flash';
const provider=new OpenAICompatibleProvider({id:'glm',baseUrl:process.env.AGENT_PROVIDER_BASE_URL||'https://open.bigmodel.cn/api/paas/v4',model,credential:()=>process.env.GLM_API_KEY,capabilities:{contextWindow:128000,maxOutputTokens:512,tools:true,vision:true,parallelTools:false},extraBody:{thinking:{type:'disabled'}},maxRetries:0});
const events=[];
try {
  for await(const event of provider.stream({model,messages:[{id:'smoke',role:'user',content:[{type:'text',text:'调用 canvas_probe 工具，参数 value 为 ready。不要调用其他工具。'}],createdAt:Date.now()}],tools:[{name:'canvas_probe',description:'连通性测试，不修改数据。',revision:'1',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}],signal:AbortSignal.timeout(45000),maxOutputTokens:512}))events.push(event);
  const calls=events.filter(e=>e.type==='tool.call');
  console.log(JSON.stringify({model,ok:calls.some(e=>e.call.name==='canvas_probe'),events},null,2));
  if(!calls.length)process.exitCode=1;
} catch(error){
  const e=error as Error & {kind?:string;status?:number};
  console.error(JSON.stringify({model,ok:false,error:e.message,kind:e.kind,status:e.status}));process.exitCode=1;
}
