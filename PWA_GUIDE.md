
# 📱 PWA（渐进式 Web 应用）快速指南 - 最简单的方案！

## 什么是 PWA？

PWA 就是可以"安装"到手机主屏幕的网站！它看起来和用起来就跟本地 APP 完全一样，但**不需要安装 APK**，也不需要通过应用商店！

## ✨ PWA 的优势

✅ **不需要安装 JDK 和 Android Studio**  
✅ **不需要打包 APK**  
✅ **不需要应用商店审核**  
✅ **安卓和 iOS 都支持**  
✅ **自动更新，用户每次打开都是最新版本**  
✅ **占用空间极小**  

---

## 🚀 如何使用（两步完成）

### 第一步：部署网站

1. 将前端构建后的文件部署到任何 Web 服务器（Nginx、Apache、GitHub Pages、Vercel、Netlify 等）
2. 或者更简单：将 `client/build` 文件夹的内容部署到公网服务器

### 第二步：手机安装 PWA

#### 在 Android 手机上：

1. 用 Chrome 或 Edge 浏览器打开您的网站地址
2. 浏览器会自动弹出 "添加到主屏幕" 或 "安装应用" 的提示
3. 点击添加，应用图标就会出现在主屏幕！
4. 以后就可以直接从主屏幕打开，像普通 APP 一样使用！

#### 在 iPhone 上：

1. 用 Safari 浏览器打开网站
2. 点击底部的分享按钮（方框带箭头图标）
3. 向下滑动找到并点击 "添加到主屏幕"
4. 点击添加，完成！

---

## 🎨 如何添加 APP 图标

当前配置需要两个图标文件：
- `icon-192.png` (192x192 像素)
- `icon-512.png` (512x512 像素)

您可以：
1. 使用在线工具生成：https://favicon.io/ 或 https://realfavicongenerator.net/
2. 找一张好看的图片（扑克牌、斗地主相关的）
3. 用 PS、画图 或在线工具（如 Canva）调整尺寸
4. 保存为 PNG 格式，放到 `client/public/` 文件夹中

---

## 📦 部署前端的几种简单方法

### 方法 A：Vercel（推荐，完全免费！）

1. 去 https://vercel.com/ 注册并登录
2. 导入您的项目（或者直接上传 `client/build` 文件夹）
3. 点击部署，1分钟搞定！
4. 获得一个免费的 HTTPS 网址

### 方法 B：Netlify（也是免费的！）

1. 去 https://www.netlify.com/ 注册
2. 直接把 `client/build` 文件夹拖到网站上
3. 自动部署，获得免费网址

### 方法 C：GitHub Pages

1. 将代码上传到 GitHub
2. 在仓库设置中开启 GitHub Pages
3. 免费部署！

---

## 🎮 完整流程总结

1. 部署后端服务器到公网（参考 DEPLOY.md）
2. 修改 `client/src/config.js` 中的服务器地址
3. 构建前端：`cd client && npm run build`
4. 部署 `client/build` 文件夹到任意静态托管服务
5. 在手机浏览器中打开网站地址
6. 添加到主屏幕，开始游戏！

---

## 💡 提示

- 如果您想测试 PWA，先用本地地址（同一 WiFi 下）在手机上测试
- 如果要正式发布，必须使用 HTTPS（Vercel 和 Netlify 都自动提供 HTTPS）
- PWA 支持离线使用（需要添加 Service Worker，这个我们可以后续添加）

这就是最简单的方案！完全不需要安装复杂的开发工具！ 🎉🚀
