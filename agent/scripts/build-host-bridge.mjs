import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve(process.argv[2] || 'dist/host/pocketbase/pb_hooks');
await mkdir(resolve(output, 'lib'), {recursive:true});
await build({entryPoints:['src/adapters/pocketbase-mapping.ts'],bundle:true,platform:'neutral',format:'cjs',target:'es2017',outfile:resolve(output,'lib/agent-canvas.cjs')});
await copyFile('integrations/pocketbase/agent-bridge.pb.js',resolve(output,'agent-bridge.pb.js'));
console.log(`Host bridge written to ${output}`);
