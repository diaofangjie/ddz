
// 服务器配置
const config = {
  // 开发环境（本地测试）
  development: {
    serverUrl: 'http://localhost:3001'
  },
  // 生产环境（APK 打包时使用，需要改为您的公网服务器地址）
  production: {
    serverUrl: 'http://8.137.195.155:3001'
  }
};

// 根据环境变量选择配置
const env = process.env.NODE_ENV || 'development';
const currentConfig = config[env];

console.log(`当前环境: ${env}, 服务器地址: ${currentConfig.serverUrl}`);

export default currentConfig;
