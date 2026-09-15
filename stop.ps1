# 停止斗地主服务脚本
Write-Host "====================================" -ForegroundColor Red
Write-Host "🛑  正在停止斗地主服务..." -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Red
Write-Host ""

$ports = @(3001, 8080)

foreach ($port in $ports) {
    Write-Host "正在查找占用端口 $port 的进程..." -ForegroundColor Cyan
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    
    if ($processes) {
        foreach ($pid in $processes) {
            try {
                $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "正在杀死进程 $pid ($($process.ProcessName))..." -ForegroundColor Yellow
                    Stop-Process -Id $pid -Force
                }
            } catch {
                Write-Host "无法杀死进程 $pid" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "端口 $port 没有被占用" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "✅  已清理所有占用端口的进程！" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "按任意键关闭此窗口..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
