
# 📱 Android APK 打包详细指南

## 前置准备

请确保您已经安装了以下软件：
1. **Java JDK 17 或更高版本** (推荐 17 LTS)
2. **Android Studio** (最新稳定版)
3. **Android SDK** (Android 10 API 29 或更高)

---

## 步骤 1：配置服务器地址（重要！）

在打包 APK 之前，先配置您的服务器地址：

1. 打开文件：`client/src/config.js`
2. 修改这一行：
```javascript
production: {
  serverUrl: 'http://your-server-ip:3001'  // 修改为您的公网服务器地址
}
```

注意：
- 如果是本地测试（手机和电脑在同一 WiFi）：使用电脑的局域网 IP，如 `http://192.168.1.100:3001`
- 如果是公网服务器：使用公网 IP 或域名，如 `http://your-domain.com:3001`

修改后需要重新构建和同步：
```bash
cd client
npm run build
npx cap sync android
```

---

## 步骤 2：打开 Android Studio 项目

1. 打开 **Android Studio**
2. 选择 **Open an Existing Project**（打开现有项目）
3. 选择文件夹：`d:\dfj\dfj\ddz\client\android`
4. 等待 Gradle 同步完成（第一次可能需要几分钟）

---

## 步骤 3：构建 Debug APK（测试用）

这是最简单的方式，可以直接安装到手机测试：

1. 在 Android Studio 顶部菜单栏，选择 **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. 等待构建完成（右下角会有进度条）
3. 构建完成后，会弹出通知，点击 **locate** 或 **analyze**
4. APK 文件位置：`client/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 步骤 4：构建 Release APK（正式发布）

如果您要发布到应用商店或正式分发，需要构建签名版本的 APK：

### 4.1 创建签名密钥

1. 菜单：**Build** → **Generate Signed Bundle / APK**
2. 选择 **APK** → 点击 **Next**
3. 点击 **Create new...** 来创建新密钥
4. 填写以下信息：
   - **Key store path**: 选择一个安全的位置保存密钥文件
   - **Password**: 设置密钥库密码（请记住！）
   - **Key alias**: 密钥别名（例如：ddzkey）
   - **Password**: 密钥密码
   - **Validity (years)**: 25（有效期年数）
   - **Certificate**: 填写证书信息（姓名、组织等）
5. 点击 **OK** 保存密钥

### 4.2 继续构建 Release APK

1. 选择刚才创建的密钥，填入密码
2. 点击 **Next**
3. 选择 **release** 构建变体
4. 勾选 **V1 (Jar Signature)** 和 **V2 (Full APK Signature)**（两项都勾选！）
5. 点击 **Finish**
6. 等待构建完成
7. APK 文件位置：`client/android/app/build/outputs/apk/release/app-release.apk`

---

## 步骤 5：安装到手机

### 方法 A：通过 Android Studio 直接安装（推荐，需要 USB 调试）
1. 在手机上启用 **开发者选项** 和 **USB 调试**
2. 用 USB 数据线连接手机到电脑
3. 在 Android Studio 顶部工具栏，选择您的手机设备
4. 点击绿色的运行按钮 ▶️
5. APP 会自动安装并启动！

### 方法 B：通过 USB 传输安装
1. 将构建好的 APK 文件复制到手机
2. 在手机文件管理器中找到 APK
3. 点击安装（需要允许"未知来源"安装）

### 方法 C：通过在线传输
1. 使用微信、QQ、网盘等工具发送 APK 到手机
2. 在手机上下载并安装

---

## 常见问题

### Q: Gradle 同步失败？
A: 检查网络连接，Android Studio 需要下载依赖。如果在中国，请配置国内镜像源。

### Q: 手机无法连接到服务器？
A: 
1. 确认服务器已启动
2. 确认 `config.js` 中的服务器地址正确
3. 检查防火墙设置，开放 3001 端口
4. 手机和服务器需要网络连通

### Q: 构建时内存不足？
A: 在 `client/android/gradle.properties` 中增加内存：
```properties
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
```

### Q: 如何修改 APP 图标和名称？
- APP 名称：修改 `client/android/app/src/main/res/values/strings.xml` 中的 `app_name`
- APP 图标：替换 `client/android/app/src/main/res/mipmap-*/` 下的图标文件

---

## 快速命令参考

如果您想通过命令行构建（不打开 Android Studio）：

```bash
cd client/android

# Debug 版本（无需签名）
.\gradlew.bat assembleDebug

# Release 版本（需要配置签名）
.\gradlew.bat assembleRelease
```

---

## 下一步

APK 打包好后，记得：
1. 先部署服务器到公网（参考 DEPLOY.md）
2. 更新 `config.js` 中的服务器地址
3. 重新构建并同步
4. 重新打包 APK

祝您打包顺利！🎮🚀
