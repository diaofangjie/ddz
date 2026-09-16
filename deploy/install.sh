#!/usr/bin/env bash
# =============================================================
#  斗地主 一键部署脚本
#  用法（在服务器上执行）：
#      curl -fsSL <BASE_URL>/install.sh | bash
#  可选环境变量：
#      APP_DIR=/root/ddz       指定项目目录
#      BASE_URL=...            指定发布包下载地址前缀
# =============================================================
set -euo pipefail

BASE_URL="${BASE_URL:-__BASE_URL__}"
APP_DIR="${APP_DIR:-}"

C_OK='\033[1;32m'; C_INFO='\033[1;36m'; C_ERR='\033[1;31m'; C_OFF='\033[0m'
log()  { printf "\n${C_INFO}==> %s${C_OFF}\n" "$*"; }
ok()   { printf "${C_OK}  ✔ %s${C_OFF}\n" "$*"; }
die()  { printf "\n${C_ERR}!! %s${C_OFF}\n" "$*" >&2; exit 1; }

printf "${C_INFO}"
cat <<'BANNER'
  ______________________________________
 |   斗地主 一键部署 (视图裁剪+会话令牌) |
 |______________________________________|
BANNER
printf "${C_OFF}"

# ---------- 0. 前置检查 ----------
log "0/7 环境检查"
command -v curl >/dev/null 2>&1 || die "缺少 curl，请先执行: apt install -y curl"
command -v tar  >/dev/null 2>&1 || die "缺少 tar，请先执行: apt install -y tar"
ok "curl / tar 可用"

# ---------- 1. 定位项目目录 ----------
log "1/7 定位项目目录"
if [ -z "$APP_DIR" ]; then
  for d in /root/ddz /opt/ddz /srv/ddz /home/*/ddz; do
    if [ -f "$d/server/src/index.js" ]; then APP_DIR="$d"; break; fi
  done
fi
if [ -z "$APP_DIR" ] || [ ! -f "$APP_DIR/server/src/index.js" ]; then
  CAND=$(find / -maxdepth 5 -type f -path '*/server/src/index.js' 2>/dev/null | head -n 1 || true)
  [ -n "$CAND" ] && APP_DIR=$(dirname "$(dirname "$(dirname "$CAND")")")
fi
[ -n "$APP_DIR" ] && [ -f "$APP_DIR/server/src/index.js" ] \
  || die "找不到项目目录，请手动指定，例如: APP_DIR=/root/ddz bash install.sh"
ok "项目目录: $APP_DIR"

# ---------- 2. 备份 ----------
log "2/7 备份当前版本"
STAMP=$(date +%Y%m%d-%H%M%S)
cp -a "$APP_DIR/server/src" "$APP_DIR/server/src.bak.$STAMP"
[ -d "$APP_DIR/client/build" ] && cp -a "$APP_DIR/client/build" "$APP_DIR/client/build.bak.$STAMP"
ok "已备份到 src.bak.$STAMP / build.bak.$STAMP"

# ---------- 3. 下载发布包 ----------
log "3/7 下载发布包"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --retry 3 --connect-timeout 15 -o "$TMP/ddz-release.tgz" "$BASE_URL/ddz-release.tgz" \
  || die "下载失败，请检查网络或 BASE_URL: $BASE_URL"
ok "已下载 $(du -h "$TMP/ddz-release.tgz" | cut -f1)"

# ---------- 4. 解包覆盖 ----------
log "4/7 解包覆盖"
mkdir -p "$TMP/x" && tar -xzf "$TMP/ddz-release.tgz" -C "$TMP/x"
SRC="$TMP/x"; [ -d "$TMP/x/ddz" ] && SRC="$TMP/x/ddz"
[ -f "$SRC/server/src/index.js" ] || die "发布包结构异常，缺少 server/src/index.js"

cp -a "$SRC/server/src/." "$APP_DIR/server/src/"
[ -f "$SRC/server/package.json" ] && cp -a "$SRC/server/package.json" "$APP_DIR/server/"
[ -f "$SRC/server/package-lock.json" ] && cp -a "$SRC/server/package-lock.json" "$APP_DIR/server/"
if [ -d "$SRC/client/build" ]; then
  mkdir -p "$APP_DIR/client/build"
  cp -a "$SRC/client/build/." "$APP_DIR/client/build/"
fi
ok "已覆盖 server/src 与 client/build"

# ---------- 5. 校验新代码确实落地 ----------
log "5/7 校验代码版本"
G1=$(grep -c "projectGame\|emitPerViewer" "$APP_DIR/server/src/index.js" || true)
G2=$(grep -c "pickBomb"                "$APP_DIR/server/src/GameLogic.js" || true)
G3=$(grep -c "sessionToken"            "$APP_DIR/server/src/RoomManager.js" || true)
printf "  projectGame/emitPerViewer: %s\n  pickBomb: %s\n  sessionToken: %s\n" "$G1" "$G2" "$G3"
[ "$G1" -gt 0 ] && [ "$G2" -gt 0 ] && [ "$G3" -gt 0 ] || die "新代码未正确覆盖（有计数为 0）"
ok "三项特征全部命中，代码已更新"

# ---------- 6. 重启服务 ----------
log "6/7 重启后端"
if command -v pm2 >/dev/null 2>&1; then
  cd "$APP_DIR/server"
  if pm2 describe ddz-server >/dev/null 2>&1; then
    pm2 restart ddz-server >/dev/null && ok "pm2 restart ddz-server 完成"
  else
    pm2 start src/index.js --name ddz-server >/dev/null && ok "pm2 start ddz-server 完成"
  fi
  pm2 save >/dev/null 2>&1 || true
else
  printf "${C_ERR}  未检测到 pm2，请手动重启 node 进程${C_OFF}\n"
fi

# ---------- 7. 健康检查 ----------
log "7/7 健康检查"
sleep 3
HC=$(curl -fsS -m 10 http://127.0.0.1:3001/health 2>/dev/null || echo "FAILED")
echo "  /health -> $HC"
case "$HC" in
  *'"ok"'*) ok "后端存活，部署成功 🎉" ;;
  *) printf "${C_ERR}  健康检查未通过，请执行 pm2 logs ddz-server --lines 50 查看日志${C_OFF}\n" ;;
esac

cat <<ROLLBACK

${C_INFO}回滚方法（30 秒）${C_OFF}
  cd $APP_DIR
  rm -rf server/src client/build
  mv server/src.bak.$STAMP server/src
  [ -d client/build.bak.$STAMP ] && mv client/build.bak.$STAMP client/build
  pm2 restart ddz-server

${C_INFO}验收要点${C_OFF}
  1) 浏览器强刷 Ctrl+F5 打开 http://8.137.195.155/
  2) F12 → Network → WS → 看 gameUpdated 的 hands：别人应是 rank:"hidden"
  3) 刷新页面应能回到原座位（会话令牌生效）
ROLLBACK
