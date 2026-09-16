import { cp, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../public/agent/', import.meta.url), { recursive: true });
await cp(new URL('../agent/dist/widget/', import.meta.url), new URL('../public/agent/', import.meta.url), { recursive: true });
execFileSync(process.execPath, ['scripts/build-host-bridge.mjs', '../pocketbase/pb_hooks'], { cwd: `${root}agent`, stdio: 'inherit' });
