#requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$sourceScript = Join-Path $PSScriptRoot 'scanner.py'
$installDir = Join-Path $env:ProgramData 'DecisionDeskScanner'
$targetScript = Join-Path $installDir 'scanner.py'
$configPath = Join-Path $installDir 'config.json'
$siteUrl = 'https://a-share-decision-desk.bobzhou198.chatgpt.site'

if (Get-Command py -ErrorAction SilentlyContinue) {
    $python = & py -3 -c 'import sys; print(sys.executable)' 2>$null | Select-Object -First 1
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $python = & python -c 'import sys; print(sys.executable)' 2>$null | Select-Object -First 1
} else {
    throw '请先安装 Python 3。'
}
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($python)) { throw '未找到可运行的 Python 3。' }

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item $sourceScript $targetScript -Force

# Read the Sites service credential without echoing it or placing it in a
# command line. Restrict the saved file to SYSTEM and local administrators.
$secure = Read-Host '请输入站点后台服务凭证（不会显示）' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
if ([string]::IsNullOrWhiteSpace($token)) { throw '后台服务凭证不能为空。' }
@{ url = $siteUrl; token = $token } | ConvertTo-Json -Compress | Set-Content -Path $configPath -Encoding UTF8
$token = $null
& icacls.exe $configPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw '未能限制凭证文件权限，安装已停止。' }

& $python $targetScript --config $configPath --check-only
if ($LASTEXITCODE -ne 0) { throw '站点连接测试未通过；定时任务尚未启用。' }

$taskName = 'DecisionDeskIntradayScanner'
$action = New-ScheduledTaskAction -Execute $python -Argument ('"' + $targetScript + '" --config "' + $configPath + '"') -WorkingDirectory $installDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "已安装 $taskName；每 2 分钟运行，脚本只在北京时间交易时段请求行情。"
