# 阿里云部署指南

## 📦 项目打包文件

整个项目文件已经准备好，包含：
- `server/` - 后端服务
- `client/` - 前端代码
- `client/build/` - 前端构建产物（重要！）
- `package.json` - 项目总配置

## 🚀 阿里云部署步骤

### 方式一：普通云服务器（ECS）部署

#### 1. 上传文件到服务器

使用 SSH/SFTP 工具（如 FileZilla、WinSCP）将整个项目文件夹上传到服务器

#### 2. 服务器环境配置

确保服务器已安装 Node.js（推荐 v16 或更高版本）

```bash
# 检查 Node.js 版本
node -v
npm -v
```

#### 3. 安装依赖

```bash
cd /path/to/ddz
npm run install:all
```

#### 4. 启动服务

```bash
cd /path/to/ddz/server
npm start
# 或者
node src/index.js
```

#### 5. 配置防火墙（开放端口）

确保阿里云安全组开放 **3001** 端口

### 方式二：使用 PM2 守护进程（推荐生产环境）

#### 安装 PM2

```bash
npm install -g pm2
```

#### 启动服务

```bash
cd /path/to/ddz/server
pm2 start src/index.js --name ddz-server
```

#### 常用命令

```bash
pm2 logs ddz-server    # 查看日志
pm2 restart ddz-server # 重启服务
pm2 stop ddz-server    # 停止服务
pm2 delete ddz-server  # 删除服务
pm2 list               # 查看服务状态
```

### 方式三：Docker 部署（可选）

如果需要 Docker 部署，可以创建 Dockerfile

## 🌐 访问地址

部署成功后，在浏览器中访问：
```
http://你的服务器公网IP:3001
```

## ⚙️ 配置文件检查

请确认 `client/src/config.js` 中的生产环境服务器地址正确：

```javascript
production: {
  serverUrl: 'http://你的阿里云公网IP:3001'  // 改成你的实际地址
}
```

如果 IP 地址有变化，请修改后重新打包前端：

```bash
cd client
npm run build
```

## 📱 功能验证清单

- [ ] 打开首页正常显示
- [ ] 创建房间成功
- [ ] 加入房间成功
- [ ] 游戏流程正常（叫地主、出牌等）
- [ ] 聊天功能正常
- [ ] 断线重连正常
- [ ] 房间列表实时更新

## 💡 安全建议（生产环境）

1. 配置 Nginx 反向代理
2. 申请域名和 HTTPS 证书
3. 修改默认端口（可选）
4. 配置访问日志和错误日志
5. 设置定期备份数据策略
