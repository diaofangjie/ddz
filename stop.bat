@echo off
chcp 65001 >nul
echo ====================================
echo 🛑  正在停止斗地主服务...
echo ====================================
echo.

echo 正在查找占用 3001 和 8080 端口的进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    echo 正在杀死进程 %%a...
    taskkill /F /PID %%a
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080') do (
    echo 正在杀死进程 %%a...
    taskkill /F /PID %%a
)

echo.
echo ====================================
echo ✅  已清理所有占用端口的进程！
echo ====================================
echo.
pause
