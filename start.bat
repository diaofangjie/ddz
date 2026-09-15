@echo off
chcp 65001 >nul
echo ====================================
echo 🃏  斗地主 - 好友开房间
echo ====================================
echo.

echo 正在清理旧进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo 旧进程已清理！
echo.

echo [1/2] 正在启动后端服务器...
cd /d "%~dp0server"
if not exist "node_modules" (
    echo 首次运行，正在安装后端依赖...
    call npm.cmd install
)
start "DDZ Server" cmd /k "cd /d \"%~dp0server\" && npm.cmd run dev"
echo 后端服务器已启动！

echo.
timeout /t 3 /nobreak >nul

echo [2/2] 正在启动前端开发服务器...
cd /d "%~dp0client"
if not exist "node_modules" (
    echo 首次运行，正在安装前端依赖...
    call npm.cmd install
)
start "DDZ Client" cmd /k "cd /d \"%~dp0client\" && npm.cmd start"
echo 前端服务器已启动！

echo.
echo ====================================
echo ✅ 服务已启动！
echo 📡 后端: http://localhost:3001
echo 🌐 前端: http://localhost:8080
echo ====================================
echo.
echo 按任意键关闭此窗口（服务将继续运行）...
pause >nul
