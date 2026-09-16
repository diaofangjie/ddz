#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""远程执行命令小工具

用法:
    python rsh.py "ls -la /root"
    python rsh.py "cmd1" "cmd2" ...
"""
import os
import sys

import paramiko

HOST = "8.137.195.155"
PORT = 22
USER = "root"
KEY_FILE = os.path.expanduser(r"C:\Users\DFJ\.ssh\ddz_aliyun")


def main():
    cmds = sys.argv[1:]
    if not cmds:
        print(__doc__)
        return

    key = paramiko.PKey.from_path(KEY_FILE)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=PORT, username=USER, pkey=key,
              look_for_keys=False, allow_agent=False, timeout=15,
              banner_timeout=20, auth_timeout=20)

    for cmd in cmds:
        print(f"\n\033[1;36m$ {cmd}\033[0m")
        _in, out, err = c.exec_command(cmd, timeout=120)
        o = out.read().decode("utf-8", "replace")
        e = err.read().decode("utf-8", "replace")
        rc = out.channel.recv_exit_status()
        if o:
            print(o.rstrip())
        if e.strip():
            print(f"\033[1;33m{e.rstrip()}\033[0m")
        if rc != 0:
            print(f"\033[1;31m(exit={rc})\033[0m")

    c.close()


if __name__ == "__main__":
    main()
