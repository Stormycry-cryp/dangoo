declare module '*.css?inline' {
  const cssText: string;
  export default cssText;
}

interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
