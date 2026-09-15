# 斗地主 APP 打包指南 📱

本指南将带你完成将斗地主游戏打包成 Android 和 iOS 本地 APP 的完整流程！

## 准备工作

### 1. 环境准备

#### Android 开发环境
- 安装 [JDK 17 或更高版本](https://adoptium.net/)
- 安装 [Android Studio](https://developer.android.com/studio)
- 安装 Android SDK (API 26 或更高)

#### iOS 开发环境（仅 macOS）
- 安装 [Xcode](https://developer.apple.com/xcode/)
- 安装 [CocoaPods](https://cocoapods.org/)

### 2. 服务器部署

在打包 APP 之前，你需要先部署服务器到公网，这样 APP 才能连接到游戏服务器。服务器部署详见 [DEPLOY.md](./DEPLOY.md)

## 配置步骤

### 1. 修改服务器地址

打包 APP 时，需要确保 APP 连接到公网服务器，而不是 localhost！

修改 `client/src/App.js`：

```javascript
// 找到这行
const socket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:3001');

// 改成你的公网服务器地址
const socket = io('https://your-domain.com:3001');
```

### 2. 重新构建项目

每次修改前端代码后，都需要重新构建：

```bash
cd client
npm run build
npx cap sync
```

## Android 打包流程

### 方式一：使用 Android Studio 打包（推荐）

1. **打开 Android 项目**
   ```bash
   cd client
   npx cap open android
   ```

2. **配置签名**
   - 在 Android Studio 中打开项目
   - File → Project Structure → Modules → Signing Configs
   - 配置 debug 和 release 签名

3. **构建 APK**
   - Build → Build Bundle(s) / APK(s) → Build APK(s)
   - 或者 Build → Generate Signed Bundle / APK

4. **获取 APK**
   - APK 文件位于：`client/android/app/build/outputs/apk/`

### 方式二：命令行打包

```bash
cd client/android

# Debug 版本
./gradlew assembleDebug

# Release 版本
./gradlew assembleRelease
```

## iOS 打包流程（仅 macOS）

### 1. 打开 iOS 项目

```bash
cd client
npx cap open ios
```

### 2. 配置签名

- 在 Xcode 中打开项目
- 选择 Team（需要 Apple Developer 账号）
- 配置 Bundle Identifier

### 3. 构建和测试

1. **模拟器测试**
   - 选择模拟器设备
   - 点击 ▶️ 按钮运行

2. **真机测试**
   - 连接 iPhone/iPad
   - 选择设备运行

3. **打包发布**
   - Product → Archive
   - 按照向导完成打包和发布

## 快速开发流程

### 日常开发命令

```bash
# 重新构建前端
cd client
npm run build

# 同步到原生平台
npx cap sync

# 或者使用 copy 命令
npx cap copy android
npx cap copy ios

# 打开 Android Studio
npx cap open android

# 打开 Xcode
npx cap open ios
```

## 常见问题

### 问题 1: 服务器连接失败
**解决**: 确保 APP 中的服务器地址配置正确，并且服务器已部署到公网

### 问题 2: 无法打开 Android Studio
**解决**: 确保 Android Studio 已正确安装并配置了环境变量

### 问题 3: iOS 签名错误
**解决**: 需要 Apple Developer 账号，在 Xcode 中正确配置 Team

### 问题 4: 构建失败
**解决**: 运行 `npx cap sync` 确保最新代码已同步

## 下一步

1. **测试 APP** - 在手机上安装和测试 APP
2. **优化体验** - 根据测试结果优化 UI 和性能
3. **发布上线** - 发布到 Google Play 或 App Store

## 更多资源

- [Capacitor 官方文档](https://capacitorjs.com/docs)
- [Android 开发者文档](https://developer.android.com/docs)
- [iOS 开发者文档](https://developer.apple.com/documentation/)

祝你打包顺利！🎉
