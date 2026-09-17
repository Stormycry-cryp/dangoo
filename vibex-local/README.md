# VibeX Local Source Export

This zip contains the current development source captured from the running VibeX container.
It may be a half-finished project if you downloaded it while generation was still in progress.

## Run on macOS

```bash
chmod +x vibex-local/start-macos.sh
./vibex-local/start-macos.sh
```

## Run on Linux

```bash
chmod +x vibex-local/start-linux.sh
./vibex-local/start-linux.sh
```

## Run on Windows

Double-click `vibex-local/start-windows.bat`, or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\vibex-local\start-windows.ps1
```

The app opens at `http://127.0.0.1:8000` and PocketBase runs at `http://127.0.0.1:7000`; both ports must be free before starting.
The local Vite config proxies `/__pb` to PocketBase, matching the VibeX online runtime path.

### Agent development on Windows

Install dependencies on the Windows machine itself; do not copy `node_modules`
from macOS/Linux because `better-sqlite3` includes a native binary. From the
repository root in PowerShell:

```powershell
npm.cmd --prefix agent ci
npm.cmd --prefix agent test
npm.cmd --prefix agent run smoke:mock
```

For the isolated Agent preview, run `npm.cmd --prefix agent run dev:mock` and
`npm.cmd --prefix agent run dev:ui` in separate terminals. The UI is at
`http://127.0.0.1:5173`; these commands do not invoke paid generation.

The test suite keeps configuration persistence/redaction and resource traversal
checks enabled on Windows. Exact POSIX `0600` permissions are checked only on
POSIX systems: Windows uses inherited NTFS ACLs, and Node's `stat().mode` cannot
prove an owner-only ACL. Store real `AGENT_DATA_DIR` contents in a private user
directory with suitable ACLs, not a shared folder. File-symlink tests report a
specific skip only if Windows denies link creation; directory-junction containment
is tested separately. Administrator mode is not required for normal development.

Browser smoke scripts accept native paths (including spaces) in
`PLAYWRIGHT_MODULE`; failure screenshots use the operating system's temporary
directory. CI runs tests and the integrated build on Windows and Linux with Node 22.

## Requirements

- Node.js 20.19+ or 22.12+
- Internet access on first run for npm/pnpm dependencies and PocketBase
- macOS/Linux: `curl` and `unzip`

PocketBase is not bundled in this zip. The start script downloads the matching PocketBase release for your platform on first run and caches it under `vibex-local/bin/`.

## Data and secrets

This export intentionally does not include `pb_data`, `.env`, logs, Claude history, `node_modules`, PocketBase binaries, or build output.
If AI features need RunningHub credentials locally, edit `.env.local` and fill only your own local key values.
Third-party capability keys (maps, payments, and similar) are stored in `project/vibex-capability-keys.json` and travel with this export. Keep that file private; do not commit it to a public repository.

Exported app id: `app-ca81449e917d4660aa213c5c13d47008`
