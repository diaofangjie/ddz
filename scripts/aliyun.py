#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
斗地主线上服务器 —— 盘点 / 部署 / 回滚

线上真实布局（2026-09-16 实测）：
    后端源码   /root/server/src/        （pm2 进程 ddz-server，cwd /root/server）
    前端产物   /var/www/ddz/            （nginx root，属主 www-data）
    nginx 配置 /etc/nginx/sites-available/default

用法：
    python aliyun.py check              只读盘点
    python aliyun.py deploy             备份 -> 上传 -> 覆盖 -> 校验 -> 重启 -> 健康检查
    python aliyun.py rollback <时间戳>   回滚
"""
import argparse
import hashlib
import json
import os
import posixpath
import re
import subprocess
import sys
import time

import paramiko

HOST = "8.137.195.155"
PORT = 22
USER = "root"
KEY_FILE = os.path.expanduser(r"C:\Users\DFJ\.ssh\ddz_aliyun")
LOCAL_ROOT = r"D:\dfj\dfj\ddz"
LOCAL_TGZ = os.path.join(LOCAL_ROOT, "ddz-release.tgz")
LOCAL_INDEX = os.path.join(LOCAL_ROOT, "client", "build", "index.html")

REMOTE_TGZ = "/tmp/ddz-release.tgz"
PM2_NAME = "ddz-server"

# 发布包里要带的东西（不含 node_modules：跨平台二进制不兼容，传上去也没用）
PACKAGE_MEMBERS = [
    "client/build",
    "server/src",
    "server/package.json",
    "server/package-lock.json",
]
# Windows 自带 bsdtar；Linux 下退回 PATH 里的 tar
TAR_EXE = r"C:\Windows\System32\tar.exe" if os.name == "nt" else "tar"

DEFAULT_BACKEND = "/root/server"
DEFAULT_WEB_ROOT = "/var/www/ddz"
NODE_WEB_DIR = "/root/client/build"
WEB_OWNER = "www-data:www-data"

C_OK, C_INFO, C_ERR, C_WARN, C_OFF = "\033[1;32m", "\033[1;36m", "\033[1;31m", "\033[1;33m", "\033[0m"


def log(m):
    print(f"{C_INFO}==> {m}{C_OFF}", flush=True)


def ok(m):
    print(f"{C_OK}  OK {m}{C_OFF}", flush=True)


def warn(m):
    print(f"{C_WARN}  !  {m}{C_OFF}", flush=True)


def die(m):
    print(f"\n{C_ERR}!! {m}{C_OFF}", file=sys.stderr, flush=True)
    sys.exit(1)


def connect():
    if not os.path.exists(KEY_FILE):
        die(f"私钥不存在: {KEY_FILE}")
    key = paramiko.PKey.from_path(KEY_FILE)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        c.connect(HOST, port=PORT, username=USER, pkey=key,
                  look_for_keys=False, allow_agent=False, timeout=15,
                  banner_timeout=20, auth_timeout=20)
    except paramiko.AuthenticationException:
        die("认证失败：密钥未被服务器接受。")
    except Exception as e:
        die(f"连接失败: {type(e).__name__}: {e}")
    return c


def run(c, cmd, check=True, quiet=False, timeout=120, show=True):
    _in, out, err = c.exec_command(cmd, timeout=timeout)
    o = out.read().decode("utf-8", "replace")
    e = err.read().decode("utf-8", "replace")
    rc = out.channel.recv_exit_status()
    if not quiet and show:
        if o.strip():
            print(o.rstrip())
        if e.strip():
            print(f"{C_WARN}{e.rstrip()}{C_OFF}")
    if check and rc != 0:
        die(f"命令失败 (exit={rc}): {cmd}\n{e.strip()}")
    return rc, o


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def local_bundle():
    """从本地 build/index.html 解析出引用的 bundle 文件名"""
    try:
        html = open(LOCAL_INDEX, encoding="utf-8").read()
        m = re.search(r"main\.[0-9a-f]+\.js", html)
        return m.group(0) if m else None
    except OSError:
        return None


def newest_source_mtime():
    """本地参与发布的文件里最新的一个修改时间"""
    latest = 0.0
    for member in PACKAGE_MEMBERS:
        path = os.path.join(LOCAL_ROOT, *member.split("/"))
        if os.path.isfile(path):
            latest = max(latest, os.path.getmtime(path))
        elif os.path.isdir(path):
            for root, _dirs, files in os.walk(path):
                for f in files:
                    latest = max(latest, os.path.getmtime(os.path.join(root, f)))
    return latest


def tar_members():
    """列出当前发布包里的成员路径（正斜杠）"""
    try:
        r = subprocess.run([TAR_EXE, "-tzf", LOCAL_TGZ], cwd=LOCAL_ROOT,
                           capture_output=True, text=True)
    except OSError as e:
        die(f"无法调用 {TAR_EXE}: {e}")
    if r.returncode != 0:
        return []
    return [n.strip().lstrip("./").replace("\\", "/")
            for n in r.stdout.splitlines() if n.strip()]


def ensure_package():
    """
    确保发布包是**当前代码**打出来的。

    踩过的坑：本脚本原先只负责上传已存在的 ddz-release.tgz，不负责打包。
    改了代码却没重新打包，就会拿着上一次的旧包去覆盖线上 —— 服务器上跑的还是旧版本，
    而"后端特征计数"这类校验因为旧版也含同样的函数名照样通过，只有 bundle 哈希对不上
    才暴露出来。所以这里做两件事：过期就自动重打；打完再核对 bundle 真的在包里。
    """
    bundle = local_bundle()
    if not bundle:
        die("无法从本地 client/build/index.html 解析出 bundle 文件名（先执行构建）")

    stale = True
    if os.path.exists(LOCAL_TGZ):
        age = os.path.getmtime(LOCAL_TGZ)
        src = newest_source_mtime()
        stale = age < src
        if not stale:
            ok("发布包是最新的，直接复用")
        else:
            log("发布包早于源码改动，重新打包")

    if stale:
        if not os.path.exists(TAR_EXE) and os.name == "nt":
            die(f"找不到 {TAR_EXE}，无法打包")
        r = subprocess.run([TAR_EXE, "-czf", os.path.basename(LOCAL_TGZ)] + PACKAGE_MEMBERS,
                           cwd=LOCAL_ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            die(f"打包失败: {(r.stderr or r.stdout).strip()}")
        ok(f"已重新打包 {LOCAL_TGZ} ({os.path.getsize(LOCAL_TGZ) / 1024:.1f} KB)")

    members = tar_members()
    want = f"client/build/static/js/{bundle}"
    if want not in members:
        die(f"发布包里找不到 {want} —— 包与当前构建不一致，拒绝部署（请先重新构建并打包）")
    ok(f"发布包内容与当前构建一致（{bundle}）")
    return bundle


def detect_paths(c):
    """探测后端目录与 nginx 前端根目录"""
    backend, web_root = DEFAULT_BACKEND, DEFAULT_WEB_ROOT

    _rc, out = run(c, "pm2 jlist 2>/dev/null", check=False, quiet=True)
    try:
        s, e = out.index("["), out.rindex("]") + 1
        for p in json.loads(out[s:e]):
            if p.get("name") == PM2_NAME:
                script = (p.get("pm2_env") or {}).get("pm_exec_path") or ""
                if script.endswith("/src/index.js"):
                    # script = /root/server/src/index.js  ->  /root/server
                    backend = posixpath.dirname(posixpath.dirname(script))
    except Exception:
        pass

    _rc, out = run(c, "nginx -T 2>/dev/null | grep -oP '^\\s*root\\s+\\K[^;]+'", check=False, quiet=True)
    for x in [i.strip() for i in out.splitlines() if i.strip()]:
        if "ddz" in x or x == DEFAULT_WEB_ROOT:
            web_root = x
            break

    return backend, web_root


# --------------------------------------------------------------------------
def cmd_check(c):
    log("只读盘点线上服务器（不做任何修改）")
    backend, web_root = detect_paths(c)

    groups = [
        ("身份与环境", "whoami; hostname; grep PRETTY /etc/os-release; uptime -p"),
        ("Node / pm2", "node -v; npm -v; pm2 -v"),
        ("pm2 进程", "pm2 list"),
        ("pm2 详情", f"pm2 describe {PM2_NAME} | grep -E 'status|restarts|script path|exec cwd|uptime'"),
        ("后端目录", f"ls -la {backend}"),
        ("后端源码", f"ls -la {backend}/src"),
        ("前端根目录", f"ls -la {web_root}"),
        ("前端 bundle", f"ls -l {web_root}/static/js/ 2>&1"),
        ("入口引用的 bundle", f"grep -o 'main\\.[0-9a-f]*\\.js' {web_root}/index.html"),
        ("nginx 站点", "cat /etc/nginx/sites-available/default"),
        ("端口监听", "ss -lntp 2>/dev/null | grep -E ':(80|3001)'"),
        ("代码指纹(旧版应为0)",
         f"echo -n 'projectGame|emitPerViewer: '; grep -c 'projectGame\\|emitPerViewer' {backend}/src/index.js; "
         f"echo -n 'pickBomb: '; grep -c pickBomb {backend}/src/GameLogic.js; "
         f"echo -n 'sessionToken: '; grep -c sessionToken {backend}/src/RoomManager.js"),
        ("后端本地健康", "curl -s -m 5 http://127.0.0.1:3001/health"),
        ("磁盘", "df -h / | tail -1"),
    ]
    for title, cmd in groups:
        print(f"\n{C_INFO}--- {title} ---{C_OFF}")
        run(c, cmd, check=False)

    print()
    log(f"后端目录  : {backend}")
    log(f"前端根目录: {web_root}")
    log(f"本地 bundle: {local_bundle()}")
    ok("盘点完成（未做任何修改）")


# --------------------------------------------------------------------------
def cmd_deploy(c):
    sftp = c.open_sftp()
    backend, web_root = detect_paths(c)

    print()
    log(f"后端目录  : {backend}")
    log(f"前端根目录: {web_root}")

    # 打包 + 内容一致性核对，任一不满足直接中止，绝不拿旧包去覆盖线上
    bundle = ensure_package()
    size = os.path.getsize(LOCAL_TGZ)
    log(f"发布包    : {LOCAL_TGZ}  ({size / 1024:.1f} KB)")
    log(f"待发布 bundle: {bundle}")

    # ---- 1 ----
    log("1/8 前置检查")
    run(c, f"test -f {backend}/src/index.js", quiet=True)
    run(c, f"test -d {web_root}", quiet=True)
    run(c, f"pm2 describe {PM2_NAME} >/dev/null 2>&1", quiet=True)
    ok("后端源码、前端根目录、pm2 进程均正常")

    # ---- 2 ----
    log("2/8 备份")
    _rc, out = run(c, "date +%Y%m%d-%H%M%S", quiet=True)
    stamp = out.strip()
    run(c, f"cp -a {backend}/src {backend}/src.bak.{stamp}")
    run(c, f"cp -a {web_root} /root/web.bak.{stamp}")
    ok(f"后端备份 {backend}/src.bak.{stamp}")
    ok(f"前端备份 /root/web.bak.{stamp}")
    rc_node, _ = run(c, f"test -d {NODE_WEB_DIR}", check=False, quiet=True)
    if rc_node == 0:
        run(c, f"cp -a {NODE_WEB_DIR} /root/nodeweb.bak.{stamp}")
        ok(f"Node 静态目录备份 /root/nodeweb.bak.{stamp}")

    # ---- 3 ----
    log("3/8 上传发布包")
    t0 = time.time()
    sftp.put(LOCAL_TGZ, REMOTE_TGZ)
    _rc, out = run(c, f"stat -c %s {REMOTE_TGZ}", quiet=True)
    if int(out.strip()) != size:
        die(f"上传不完整：本地 {size} / 远端 {out.strip()}")
    ok(f"上传完成，字节数校验一致，耗时 {time.time() - t0:.1f}s")

    # ---- 4 ----
    log("4/8 解包并覆盖")
    run(c, f"rm -rf /tmp/ddz-new && mkdir -p /tmp/ddz-new && tar -xzf {REMOTE_TGZ} -C /tmp/ddz-new")
    _rc, listing = run(c, "ls /tmp/ddz-new", quiet=True)
    src = "/tmp/ddz-new/ddz" if "ddz" in listing.split() else "/tmp/ddz-new"
    run(c, f"test -f {src}/server/src/index.js", quiet=True)
    run(c, f"test -f {src}/client/build/index.html", quiet=True)

    _rc, new_hash = run(c, f"sha256sum {src}/server/package.json | cut -d' ' -f1", quiet=True)
    _rc, old_hash = run(c, f"sha256sum {backend}/package.json | cut -d' ' -f1", quiet=True)
    deps_changed = new_hash.strip() != old_hash.strip()

    cp_cmd = (f"cp -a {src}/server/src/. {backend}/src/ "
              f"&& cp -a {src}/server/package.json {backend}/package.json")
    _rc, listing2 = run(c, f"ls {src}/server", quiet=True)
    if "package-lock.json" in listing2:
        cp_cmd += f" && cp -a {src}/server/package-lock.json {backend}/package-lock.json"
    run(c, cp_cmd)

    run(c, f"find {web_root} -mindepth 1 -delete")
    run(c, f"cp -a {src}/client/build/. {web_root}/")
    run(c, f"chown -R {WEB_OWNER} {web_root}")

    # Node 进程自己也会用 express.static 托管 ../../client/build（即 /root/client/build），
    # 两个入口必须同步，否则从 :3001 直连会拿到旧前端
    rc_node, _ = run(c, f"test -d {NODE_WEB_DIR}", check=False, quiet=True)
    if rc_node == 0:
        run(c, f"find {NODE_WEB_DIR} -mindepth 1 -delete && cp -a {src}/client/build/. {NODE_WEB_DIR}/")
        ok(f"Node 静态目录 {NODE_WEB_DIR} 也已同步")

    ok(f"后端 {backend}/src 与前端 {web_root} 已覆盖，属主设为 {WEB_OWNER}")

    # ---- 5 ----
    log("5/8 校验新代码落地")
    _rc, out = run(c,
        f"echo -n 'index.js projectGame|emitPerViewer='; grep -c 'projectGame\\|emitPerViewer' {backend}/src/index.js; "
        f"echo -n 'GameLogic pickBomb='; grep -c pickBomb {backend}/src/GameLogic.js; "
        f"echo -n 'RoomManager sessionToken='; grep -c sessionToken {backend}/src/RoomManager.js; "
        f"echo -n 'bundle on disk='; test -f {web_root}/static/js/{bundle} && echo yes || echo NO; "
        f"echo -n 'index.html ref='; grep -o 'main\\.[0-9a-f]*\\.js' {web_root}/index.html",
        quiet=True)
    print(out.rstrip())

    nums = []
    for line in out.strip().splitlines()[:3]:
        try:
            nums.append(int(line.split("=")[1]))
        except (IndexError, ValueError):
            nums.append(0)
    if len(nums) < 3 or min(nums) <= 0:
        die("后端特征校验失败（计数为 0），已停止。可用 rollback 回滚。")
    if "NO" in out or bundle not in out:
        die(f"前端 bundle 校验失败：{bundle} 未正确落地。可用 rollback 回滚。")
    ok("后端三处特征 + 前端 bundle 全部校验通过")

    # ---- 6 ----
    log("6/8 依赖")
    if deps_changed:
        run(c, f"cd {backend} && npm install --omit=dev --no-audit --no-fund", timeout=900)
        ok("package.json 有变化，已 npm install")
    else:
        ok("package.json 未变化，跳过 npm install")

    # ---- 7 ----
    log("7/8 重启后端")
    run(c, f"pm2 restart {PM2_NAME} --update-env")
    run(c, "pm2 save", check=False, quiet=True)
    ok("已重启")

    # ---- 8 ----
    log("8/8 健康检查")
    for i in range(12):
        time.sleep(2)
        _rc, out = run(c, "curl -s -m 5 http://127.0.0.1:3001/health", check=False, quiet=True)
        if '"ok"' in out:
            ok(f"后端存活: {out.strip()}")
            break
        print(f"  等待中 ({i + 1}/12)")
    else:
        run(c, f"pm2 logs {PM2_NAME} --lines 40 --nostream", check=False)
        die("部署后服务未起来，请 rollback")

    _rc, out = run(c, "curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1/", check=False, quiet=True)
    ok(f"nginx 前端首页 HTTP {out.strip()}")

    print(f"""
{C_OK}================ 部署完成 ================{C_OFF}
  备份时间戳 : {stamp}
  回滚命令   : python scripts/aliyun.py rollback {stamp}
  浏览器验证 : 强刷 Ctrl+F5 打开 http://{HOST}/
  F12 验证   : Network -> WS -> gameUpdated -> hands，他人应为 rank:"hidden"
""")


# --------------------------------------------------------------------------
def cmd_rollback(c, stamp):
    backend, web_root = detect_paths(c)
    log(f"回滚到 {stamp}")
    run(c, f"test -d {backend}/src.bak.{stamp}")
    run(c, f"test -d /root/web.bak.{stamp}")
    run(c, f"rm -rf {backend}/src && mv {backend}/src.bak.{stamp} {backend}/src")
    run(c, f"find {web_root} -mindepth 1 -delete && cp -a /root/web.bak.{stamp}/. {web_root}/")
    run(c, f"chown -R {WEB_OWNER} {web_root}")
    run(c, f"pm2 restart {PM2_NAME}")
    time.sleep(3)
    _rc, out = run(c, "curl -s -m 5 http://127.0.0.1:3001/health", check=False, quiet=True)
    ok(f"回滚完成，健康检查: {out.strip()}")


def main():
    ap = argparse.ArgumentParser(description="斗地主线上部署工具")
    ap.add_argument("action", choices=["check", "deploy", "rollback"])
    ap.add_argument("stamp", nargs="?", help="rollback 需要备份时间戳")
    a = ap.parse_args()

    print(f"{C_INFO}连接 {USER}@{HOST}:{PORT} ...{C_OFF}")
    c = connect()
    ok("SSH 连接成功")
    try:
        if a.action == "check":
            cmd_check(c)
        elif a.action == "deploy":
            cmd_deploy(c)
        else:
            if not a.stamp:
                die("rollback 需要备份时间戳，例如: rollback 20260916-111500")
            cmd_rollback(c, a.stamp)
    finally:
        c.close()


if __name__ == "__main__":
    main()
