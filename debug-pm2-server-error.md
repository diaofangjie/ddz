[OPEN] pm2-server-error

# 问题现象

- 阿里云服务器上手动执行 `node src/index.js` 可以启动后端。
- `http://8.137.195.155:3001/health` 可以返回 `{"status":"ok"}`。
- 使用 `pm2 start src/index.js --name ddz-server` 后，短暂 `online`，随后变成 `errored`。

# 当前证据

- `ss -ltnp | grep 3001` 显示 `node` 进程仍在监听 `3001`。
- `ps -ef | grep node` 显示手动启动的 `node src/index.js` 进程 PID 为 `23874`。
- `kill 23874` 后，端口仍被该 PID 占用。

# 假设

1. 旧的手动启动进程 `23874` 没有真正退出，导致 `pm2` 启动时报 `EADDRINUSE`。
2. `pm2` 启动的进程立即崩溃，具体错误需要通过 `pm2 logs` 获取。
3. 服务器上可能存在多个终端/父进程关系，普通 `kill` 未能终止旧进程，需要强制结束。
4. `pm2` 可能拉起了新进程，但旧进程仍占端口，导致反复重启直至 `errored`。

# 下一步

- 强制结束 PID `23874`。
- 再次检查 `3001` 端口是否已释放。
- 若端口释放，再重新用 `pm2` 启动并检查状态。
- 若仍失败，抓取 `pm2 logs` 进行下一步判断。
