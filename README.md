# 🃏 斗地主 - 好友开房间

一个支持3人/4人斗地主游戏，参考欢乐斗地主规则。

## 📋 功能特性

- ✅ 支持3人斗地主（经典模式）
- ✅ 支持4人斗地主（2v2模式）
- ✅ 创建/加入房间
- ✅ 房间号邀请好友
- ✅ 癞子玩法（可选）
- ✅ 封顶倍数设置
- ✅ 局数选择（4/8/16局）
- ✅ 文字聊天
- ✅ 精美UI设计
- 📱 支持打包成手机APP

## 🚀 快速开始

### 前置要求

- Node.js 16+ 
- npm 或 yarn

### 安装依赖

#### 后端
```bash
cd server
npm install
```

#### 前端
```bash
cd client
npm install
```

### 本地运行

#### 启动后端服务器
```bash
cd server
npm run dev
```
服务器将在 http://localhost:3001 启动

#### 启动前端开发服务器
```bash
cd client
npm start
```
前端将在 http://localhost:3000 启动

## 📱 打包APP

见 [DEPLOY.md](./DEPLOY.md) 查看详细的打包和部署指南。

## 🏗️ 项目架构

```
ddz/
├── server/                 # 后端服务器
│   ├── src/
│   │   ├── index.js     # 服务器入口
│   │   ├── RoomManager.js  # 房间管理
│   │   ├── GameLogic.js   # 游戏逻辑
│   │   └── CardLogic.js   # 牌型判断
│   └── package.json
└── client/             # 前端应用
    ├── src/
    │   ├── components/    # React组件
    │   ├── App.js     # 主应用
    │   └── index.js
    └── package.json
```

## 🎮 游戏规则

### 基本规则

- 使用一副扑克牌（54张，含大小王）
- 3人模式：1地主 vs 2农民
- 4人模式：2地主 vs 2农民（2v2）
- 地主比普通牌型：单张、对子、三张、三带一、三带二、顺子、连对、飞机、四带二
- 炸弹：四张相同
- 王炸：大小王（最大）

### 叫地主

- 按顺序叫分，1-3分或不叫
- 叫分最高者成为地主
- 地主获得底牌

## ☁️ 部署到云服务器

### 推荐使用的云服务器提供商：
- 阿里云
- 腾讯云
- AWS
- Vultr

详细步骤见 [DEPLOY.md](./DEPLOY.md)

## 📝 TODO

- [ ] 语音聊天
- [ ] 战绩统计
- [ ] 好友系统
- [ ] AI 对手
- [ ] 更多游戏动画效果

## 📄 许可证

MIT License
