import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Native paths (including Windows drive/UNC paths) need a file: ESM URL. */
export function moduleSpecifier(value = 'playwright') {
  return isAbsolute(value) || /^\.{1,2}[\\/]/.test(value)
    ? pathToFileURL(resolve(value)).href
    : value;
}
