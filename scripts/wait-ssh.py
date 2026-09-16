"""等待实例重启完成并验证新密钥可用"""
import os
import socket
import time

import paramiko

HOST = "8.137.195.155"
PORT = 22
USER = "root"
KEY_FILE = os.path.expanduser(r"C:\Users\DFJ\.ssh\ddz_aliyun")

MAX_TRIES = 40
INTERVAL = 6

key = paramiko.PKey.from_path(KEY_FILE)
print(f"本地私钥指纹: {key.get_fingerprint().hex()}")
print(f"目标: {USER}@{HOST}:{PORT}，最多等 {MAX_TRIES * INTERVAL // 60} 分钟\n")

for i in range(1, MAX_TRIES + 1):
    ts = time.strftime("%H:%M:%S")
    sock = None
    try:
        sock = socket.create_connection((HOST, PORT), timeout=8)
    except Exception as e:
        print(f"[{i:>2}/{MAX_TRIES}] {ts} TCP 未就绪: {type(e).__name__}")
        time.sleep(INTERVAL)
        continue

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        c.connect(HOST, port=PORT, username=USER, pkey=key, sock=sock,
                  look_for_keys=False, allow_agent=False, timeout=12,
                  banner_timeout=20, auth_timeout=20)
    except paramiko.AuthenticationException:
        print(f"[{i:>2}/{MAX_TRIES}] {ts} 端口通了，但密钥被拒绝（可能还没重启完，或绑定未生效）")
        try:
            sock.close()
        except Exception:
            pass
        time.sleep(INTERVAL)
        continue
    except Exception as e:
        print(f"[{i:>2}/{MAX_TRIES}] {ts} 握手失败: {type(e).__name__}: {e}")
        try:
            sock.close()
        except Exception:
            pass
        time.sleep(INTERVAL)
        continue

    # 成功
    print(f"\n{'=' * 56}")
    print(f"[{i:>2}/{MAX_TRIES}] {ts}  *** 连接成功，密钥生效 ***")
    print(f"{'=' * 56}\n")

    def run(cmd):
        _in, out, err = c.exec_command(cmd, timeout=30)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        return o or e

    checks = [
        ("主机与运行时长", "hostname; uptime -p; whoami"),
        ("系统", "grep PRETTY /etc/os-release"),
        ("Node", "node -v 2>&1; npm -v 2>&1"),
        ("pm2 版本", "pm2 -v 2>&1"),
        ("pm2 进程列表", "pm2 list 2>&1 | head -20"),
        ("后端健康", "curl -s -m 5 http://127.0.0.1:3001/health || echo '(3001 无响应)'"),
        ("端口监听", "ss -lntp 2>/dev/null | grep -E ':(80|3001)' || echo '(无)'"),
        ("项目目录", "ls -d /root/ddz 2>&1; ls /root/ddz 2>&1 | head -15"),
    ]
    for title, cmd in checks:
        print(f"--- {title} ---")
        print(run(cmd))
        print()

    c.close()
    break
else:
    print("\n达到最大重试次数仍未连通。")
