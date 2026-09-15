# 快速启动指南

## 问题修复说明

### 1. 已修复的问题：
- **HomeScreen 横屏适配**：现在在横屏时可以正常显示创建和加入房间的按钮
- **WebSocket 连接优化**：改进了 socket 连接处理和错误提示

### 2. 启动服务器：

#### 方式一：分别启动服务器和客户端
```bash
# 终端 1 - 启动服务器
cd server
npm install
node src/index.js

# 终端 2 - 启动客户端
cd client
npm install
npm start
```

#### 方式二：使用根目录的启动脚本 (Windows)
```bash
# 启动服务器
npm run start:server

# 新开一个终端启动客户端
npm run start:client
```

### 3. 访问应用：
- 客户端会自动打开在 http://localhost:8080
- 服务器运行在 http://localhost:3001

### 4. 注意事项：
- 确保服务器先启动，然后再启动客户端
- 如果提示连接失败，请检查服务器是否正常运行
