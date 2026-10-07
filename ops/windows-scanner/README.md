# Windows 盘中扫描器

这台常开电脑只承担定时扫描。网站、选股逻辑、提醒去重和 Bark 推送仍在私有 Sites 站点运行；电脑不保存 Bark 地址或个人账本，也不会下单。扫描范围包括前一交易日的规则候选股、手工自选股和当前持仓股。

需要 Windows 10/11 或 Windows Server、Python 3、管理员权限、可访问站点的网络连接。使用 `install.ps1` 安装后，Windows 任务计划程序每 2 分钟唤醒一次脚本。脚本只在北京时间工作日 09:30–11:30、13:00–15:00 请求站点；站点再核验交易日与分钟数据。闭市、节假日不会发交易提醒。

安装脚本通过隐藏输入读取 Sites 后台服务凭证，将它保存在 `%ProgramData%\DecisionDeskScanner\config.json`，并把文件权限限制为 SYSTEM 和本机管理员。不要把凭证写进命令、仓库、聊天记录或截图。安装时先用 `--check-only` 验证站点访问，成功后才注册任务。后台扫描日志位于同目录的 `scanner.log`，每轮只记录数量和错误，不记录凭证。

验证任务状态：

```powershell
Get-ScheduledTask -TaskName DecisionDeskIntradayScanner | Get-ScheduledTaskInfo
Get-Content "$env:ProgramData\DecisionDeskScanner\scanner.log" -Tail 20
```

停止后台提醒：

```powershell
Disable-ScheduledTask -TaskName DecisionDeskIntradayScanner
```

删除：

```powershell
Unregister-ScheduledTask -TaskName DecisionDeskIntradayScanner -Confirm:$false
Remove-Item "$env:ProgramData\DecisionDeskScanner" -Recurse -Force
```

站点服务凭证如失效，需要重新安装或更新受保护的配置。计划任务只保证发起扫描，不保证数据源分钟行情连续可用；启动后须在真实交易时段核验完整一轮扫描、Bark 送达、延迟及漏报。
