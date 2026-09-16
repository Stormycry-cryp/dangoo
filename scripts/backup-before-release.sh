#!/usr/bin/env bash
# 发布/升级前数据安全备份: 热备份 PocketBase 数据库(在线安全, 自动处理 WAL),
# 并把用户上传的文件目录一并打包, 输出到持久卷 project/backups/。
# 用法: bash scripts/backup-before-release.sh [备注]
# 回滚: 停服后用 backups 里的 data-<ts>.db 覆盖 pb_data/data.db(同目录 -wal/-shm 一并清掉),
#       再用 storage-<ts>.tar.gz 解回 pb_data/storage, 然后启动。
set -euo pipefail

PB_DIR="${PB_INSTALL_DIR:-/workspace/pocketbase-bin}"
DATA_DB="$PB_DIR/pb_data/data.db"
STORAGE_DIR="$PB_DIR/pb_data/storage"
# project/ 是独立持久卷, 容器/发布重置也不丢; 不要备份到会被重置的目录
OUT_DIR="/workspace/app/project/backups"

mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
NOTE="${1:-}"
[ -n "$NOTE" ] && NOTE="-$(echo "$NOTE" | tr -c 'A-Za-z0-9._-' '_')"
DB_DST="$OUT_DIR/data-$TS$NOTE.db"
ST_DST="$OUT_DIR/storage-$TS$NOTE.tar.gz"

if [ ! -f "$DATA_DB" ]; then
  echo "ERROR: 找不到数据库 $DATA_DB" >&2
  exit 1
fi

echo ">> 热备份数据库..."
python3 - "$DATA_DB" "$DB_DST" <<'PY'
import sqlite3, sys, os
src, dst = sys.argv[1], sys.argv[2]
s = sqlite3.connect(src)
d = sqlite3.connect(dst)
with d:
    s.backup(d)
d.close(); s.close()
print("   db:", dst, os.path.getsize(dst), "bytes")
PY

if [ -d "$STORAGE_DIR" ]; then
  echo ">> 打包用户文件 storage/ ..."
  tar -czf "$ST_DST" -C "$PB_DIR/pb_data" storage
  echo "   storage: $ST_DST ($(du -h "$ST_DST" | cut -f1))"
else
  echo ">> 无 storage 目录, 跳过文件备份"
fi

# 只保留最近 10 份, 防止长期堆积占满磁盘
ls -1t "$OUT_DIR"/data-*.db 2>/dev/null | tail -n +11 | while read -r old; do rm -f "$old"; done
ls -1t "$OUT_DIR"/storage-*.tar.gz 2>/dev/null | tail -n +11 | while read -r old; do rm -f "$old"; done

echo ">> 备份完成: $OUT_DIR"
ls -lh "$OUT_DIR" | tail -n +2
