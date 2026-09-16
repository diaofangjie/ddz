"""在常见位置定向搜索 SSH 私钥文件（只读，不修改任何文件）"""
import os
import re

ROOTS = [
    r"D:\dfj",
    r"C:\Users\DFJ\Documents",
    r"C:\Users\DFJ\Downloads",
    r"C:\Users\DFJ\Desktop",
    r"C:\Users\DFJ\.ssh",
    r"C:\Users\DFJ\.aliyun",
    r"C:\Users\DFJ\AppData\Roaming\FileZilla",
]
SKIP_DIRS = {
    "node_modules", ".git", "build", "dist", "venv", ".venv", "__pycache__",
    "AppData", ".cache", ".gradle", ".m2", "target", ".idea", ".vscode",
}
NAME_RE = re.compile(r"(id_(rsa|ed25519|ecdsa|dsa)|\.pem|\.ppk|\.key|aliyun|ecs|keypair)", re.I)
MAX_DEPTH = 6

found = []
for root in ROOTS:
    if not os.path.isdir(root):
        continue
    base_depth = root.rstrip("\\").count("\\")
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath.count("\\") - base_depth
        if depth > MAX_DEPTH:
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".git")]
        for fn in filenames:
            if NAME_RE.search(fn):
                p = os.path.join(dirpath, fn)
                try:
                    size = os.path.getsize(p)
                except OSError:
                    size = -1
                found.append((p, size))

if found:
    print(f"找到 {len(found)} 个疑似密钥/凭据文件：")
    for p, size in found:
        print(f"  [{size:>9}] {p}")
else:
    print("未找到任何 .pem/.ppk/id_rsa 类密钥文件")
