# 阿里云新手部署教程

这份文档专门写给第一次用阿里云的人。

你现在的状态是：
- 已经开好了 3 个月试用 ECS
- 已经配置好了安全组
- 下一步不知道做什么

那就直接从这里继续。

## 先说结论

对你现在这个项目，最简单的部署方式是：

1. 阿里云服务器只负责跑后端
2. 前端先继续本地调试，确认后再部署
3. 后端跑通后，再决定前端放在阿里云还是放到 Vercel/Netlify

原因：
- 后端必须放到公网，朋友才能连进来
- 前端可以后面再处理
- 对新手来说，先把后端跑起来最重要

## 你现在需要准备什么

开始之前，先确认你手里有这 4 个信息：

1. 服务器公网 IP
2. 服务器登录密码
3. 服务器系统是不是 Ubuntu
4. 本地电脑里已经有这个项目代码

如果你的系统不是 Ubuntu，而是 CentOS，先别往下照抄命令，告诉我一声，我给你换成 CentOS 版。

## 第 1 步：确认安全组是否真的配好

你说已经配好了，但第一次部署最容易卡在这里，所以再核对一次。

在阿里云控制台里找到你的 ECS 实例，确认安全组入方向至少有这些规则：

| 端口 | 协议 | 用途 | 授权对象 |
|------|------|------|----------|
| 22 | TCP | 远程登录服务器 | 建议填你的本机公网 IP，实在不会可先填 `0.0.0.0/0` |
| 3001 | TCP | 斗地主后端服务 | `0.0.0.0/0` |
| 80 | TCP | 网站访问 | `0.0.0.0/0` |

说明：
- `22` 是你登录服务器用的
- `3001` 是 Node 后端端口
- `80` 是网页端口，后面如果你用 Nginx 会用到

如果暂时还没配 `80`，也没关系，先保证 `22` 和 `3001` 有就行。

## 第 2 步：登录服务器

推荐你直接用阿里云自带的网页终端，不需要装额外软件。

操作路径：

1. 登录阿里云控制台
2. 找到你的 ECS 实例
3. 点击实例名称进入详情页
4. 找到“远程连接”或“Workbench”
5. 点击进入
6. 输入用户名和密码登录

如果你不知道用户名：
- Ubuntu 常见是 `root`
- 也有可能是你创建实例时设置的用户

登录成功后，你会看到一个黑色命令行窗口。

## 第 3 步：先确认系统版本

登录后，先输入这条命令：

```bash
cat /etc/os-release
```

如果输出里能看到 `Ubuntu`，就继续。

## 第 4 步：更新服务器

把下面这条命令复制进去，按回车：

```bash
apt update && apt upgrade -y
```

这一步作用：
- 更新软件源
- 给系统打补丁

这一步可能要等几分钟，正常。

## 第 5 步：安装 Node.js

继续一条一条复制执行。

先执行：

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
```

再执行：

```bash
apt install -y nodejs
```

安装完成后，检查版本：

```bash
node -v
npm -v
```

正常情况下：
- `node -v` 会显示 `v18.x.x`
- `npm -v` 会显示一个版本号

如果这一步没有报错，说明 Node 环境已经装好了。

## 第 6 步：安装几个后面会用到的工具

执行：

```bash
apt install -y unzip git
```

说明：
- `unzip` 用来解压项目压缩包
- `git` 以后更新代码会方便很多

## 第 7 步：把项目传到服务器

新手最简单的方式是：压缩项目，然后上传。

### 7.1 在你自己的电脑上操作

在 `d:\dfj\dfj\ddz` 这个项目文件夹外面，打一个压缩包。

例如压成：

```text
ddz.zip
```

### 7.2 上传到阿里云服务器

你有两个简单选择：

#### 方式 A：用 WinSCP 或 FileZilla

如果你愿意安装一个上传工具，推荐 WinSCP。

连接时填写：
- 主机名：你的阿里云公网 IP
- 用户名：`root`
- 密码：你的服务器密码
- 端口：`22`

连接成功后，把 `ddz.zip` 上传到服务器的 `/root/` 目录。

#### 方式 B：用阿里云 Workbench 自带上传

如果你在阿里云网页终端里能看到上传文件功能，也可以直接把 `ddz.zip` 传到 `/root/`。

### 7.3 回到服务器解压

上传完成后，在服务器里执行：

```bash
cd /root
unzip ddz.zip
```

如果解压后文件夹名字不是 `ddz`，用这个命令看一下：

```bash
ls
```

你要找到真正的项目目录名。

## 第 8 步：先只启动后端

进入后端目录：

```bash
cd /root/ddz/server
```

如果这里提示没有这个目录，说明解压后的文件夹名字不是 `ddz`，你先执行：

```bash
cd /root
ls
```

看看真实名字，再重新进入。

进入后端目录后，执行：

```bash
npm install
```

这一步是安装后端依赖，第一次会稍慢。

安装完后，启动后端测试：

```bash
node src/index.js
```

如果看到类似下面的输出：

```text
服务器运行在端口 3001
```

说明后端已经启动成功。

## 第 9 步：测试后端公网是否通

不要关掉刚刚那个运行中的窗口。

在你自己电脑浏览器里，打开：

```text
http://你的公网IP:3001/health
```

例如：

```text
http://47.xx.xx.xx:3001/health
```

如果看到：

```json
{"status":"ok"}
```

说明你的服务器后端已经真的通了。

如果打不开，按这个顺序排查：

1. 安全组是否放行 3001
2. 服务器窗口里 Node 进程是否还在运行
3. 网址是不是写成了你的真实公网 IP

## 第 10 步：让后端一直运行

刚才用 `node src/index.js` 启动，只要你关掉窗口，服务就没了。

所以现在要装 `pm2`。

在服务器里按 `Ctrl + C` 先停掉刚才那个 Node 进程，然后执行：

```bash
npm install -g pm2
```

接着执行：

```bash
cd /root/ddz/server
pm2 start src/index.js --name ddz-server
```

再看状态：

```bash
pm2 status
```

如果看到 `ddz-server` 状态是 `online`，说明成功。

再执行：

```bash
pm2 save
pm2 startup
```

执行 `pm2 startup` 后，终端通常会返回一条很长的命令。
你需要把那条命令复制出来再执行一次。

这是正常的，不用怕。

## 第 11 步：修改前端连接到阿里云

你本地项目里，前端现在默认连的是本机 `localhost:3001`，这个上线后不行。

你需要改这个文件：

[config.js](file:///d:/dfj/dfj/ddz/client/src/config.js)

把这里：

```javascript
production: {
  serverUrl: 'http://localhost:3001'
}
```

改成：

```javascript
production: {
  serverUrl: 'http://你的公网IP:3001'
}
```

比如：

```javascript
production: {
  serverUrl: 'http://47.xx.xx.xx:3001'
}
```

## 第 12 步：重新构建前端

在你自己电脑上打开项目根目录，然后执行：

```bash
cd client
npm run build
```

执行成功后，会生成这个目录：

[build](file:///d:/dfj/dfj/ddz/client/build)

## 第 13 步：前端怎么部署

这里我给你两个选择。

### 选择 A：最适合新手

后端放阿里云，前端放 Vercel 或 Netlify。

优点：
- 不用在阿里云上配 Nginx
- 操作更简单
- 出问题更少

如果你愿意，我下一条就可以继续一步一步教你把前端发到 Vercel。

### 选择 B：前端也放阿里云

如果你想全部都放阿里云，也可以。

先在服务器安装 Nginx：

```bash
apt install -y nginx
```

然后把你本地的前端 `build` 目录上传到服务器，例如传到：

```text
/root/ddz/client/build
```

接着编辑 Nginx 配置：

```bash
nano /etc/nginx/sites-available/default
```

把内容改成下面这样：

```nginx
server {
    listen 80;
    server_name _;

    root /root/ddz/client/build;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

保存后执行：

```bash
nginx -t
systemctl restart nginx
```

然后浏览器访问：

```text
http://你的公网IP
```

## 第 14 步：你现在最该做什么

如果你是完全新手，我建议你先做到这里：

1. 登录服务器
2. 安装 Node
3. 上传项目
4. 跑通后端
5. 用浏览器打开 `http://你的公网IP:3001/health`

只要这一步通了，就说明最难的部分已经完成了。

## 最常用的 5 条命令

后面你基本只会反复用到这几条：

```bash
pm2 status
pm2 logs ddz-server
pm2 restart ddz-server
cd /root/ddz/server
node src/index.js
```

## 如果你卡住了，直接把这 3 样发给我

如果你做到哪一步报错了，直接把下面 3 个内容发我，我就能继续带你：

1. 你执行的命令
2. 终端报错截图或文字
3. 你的公网 IP 和服务器系统是不是 Ubuntu

## 现在最适合你的下一步

你已经配好安全组了，所以现在请直接去阿里云网页终端，按顺序执行下面这 6 条：

```bash
cat /etc/os-release
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs unzip git
node -v
npm -v
```

你把输出结果发我，我就继续带你做“上传项目”和“启动后端”这两步。
