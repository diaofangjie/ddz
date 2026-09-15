# 斗地主启动脚本 (PowerShell)
Write-Host "====================================" -ForegroundColor Green
Write-Host "🃏  斗地主 - 好友开房间" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Green
Write-Host ""

# 清理旧进程
Write-Host "正在清理旧进程..." -ForegroundColor Cyan
$ports = @(3001, 8080)
foreach ($port in $ports) {
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($processes) {
        foreach ($pid in $processes) {
            try {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }
}
Write-Host "旧进程已清理！" -ForegroundColor Green
Write-Host ""

# 启动后端服务器
Write-Host "[1/2] 正在启动后端服务器..." -ForegroundColor Cyan
$serverPath = Join-Path $PSScriptRoot "server"
if (-not (Test-Path (Join-Path $serverPath "node_modules"))) {
    Write-Host "首次运行，正在安装后端依赖..." -ForegroundColor Yellow
    Set-Location $serverPath
    & npm install
}

# 在新窗口启动后端
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$serverPath'; npm run dev" -WindowStyle Normal
Write-Host "后端服务器已启动！" -ForegroundColor Green

Start-Sleep -Seconds 3

# 启动前端服务器
Write-Host ""
Write-Host "[2/2] 正在启动前端开发服务器..." -ForegroundColor Cyan
$clientPath = Join-Path $PSScriptRoot "client"
if (-not (Test-Path (Join-Path $clientPath "node_modules"))) {
    Write-Host "首次运行，正在安装前端依赖..." -ForegroundColor Yellow
    Set-Location $clientPath
    & npm install
}

# 在新窗口启动前端
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$clientPath'; npm start" -WindowStyle Normal
Write-Host "前端服务器已启动！" -ForegroundColor Green

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "✅ 服务已启动！" -ForegroundColor Green
Write-Host "📡 后端: http://localhost:3001" -ForegroundColor Gray
Write-Host "🌐 前端: http://localhost:8080" -ForegroundColor Gray
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "按任意键关闭此窗口（服务将继续运行）..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
