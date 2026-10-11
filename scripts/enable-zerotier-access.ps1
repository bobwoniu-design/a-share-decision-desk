param(
    [string]$ListenAddress = '',
    [string]$AllowedSubnet = ''
)

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script in PowerShell opened with Run as administrator.'
}

if ($ListenAddress) {
    $adapterAddress = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $ListenAddress
} else {
    $adapterAddress = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.InterfaceAlias -like '*ZeroTier*' } |
        Select-Object -First 1
    if (-not $adapterAddress) { throw 'No ZeroTier IPv4 adapter found.' }
    $ListenAddress = $adapterAddress.IPAddress
}
if ($adapterAddress.InterfaceAlias -notlike '*ZeroTier*') {
    throw "$ListenAddress is not assigned to a ZeroTier adapter. No settings changed."
}
if (-not $AllowedSubnet) {
    if ($adapterAddress.PrefixLength -ne 24) {
        throw 'ZeroTier subnet is not /24. Pass -AllowedSubnet explicitly.'
    }
    $octets = $ListenAddress.Split('.')
    $AllowedSubnet = '{0}.{1}.{2}.0/24' -f $octets[0], $octets[1], $octets[2]
}
$listener = Get-NetTCPConnection -State Listen -LocalPort 5173 |
    Where-Object { $_.LocalAddress -eq '127.0.0.1' }
if (-not $listener) {
    throw 'Start the project on 127.0.0.1:5173 before running this script.'
}

# Keep the development server and its database on the existing local endpoint.
# Expose only the ZeroTier address, leaving the physical LAN interface unbound.
Start-Service iphlpsvc
& netsh interface portproxy add v4tov4 "listenaddress=$ListenAddress" listenport=5173 connectaddress=127.0.0.1 connectport=5173 protocol=tcp
if ($LASTEXITCODE -ne 0) { throw 'Failed to configure the Windows port proxy.' }

$ruleName = 'AShareDecisionDesk-ZeroTier-5173'
$rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($rule) {
    $rule | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile Any -Protocol TCP -LocalPort 5173 -LocalAddress $ListenAddress -RemoteAddress $AllowedSubnet | Out-Null
} else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'A-share decision desk: ZeroTier only' -Enabled True -Direction Inbound -Action Allow -Profile Any -Protocol TCP -LocalPort 5173 -LocalAddress $ListenAddress -RemoteAddress $AllowedSubnet | Out-Null
}

Write-Host "Configured: http://${ListenAddress}:5173/"
Write-Host "Allowed source network: $AllowedSubnet"
Write-Host 'Keep this computer and the project running. Test the URL on the other computer.'
Write-Host 'No router port forwarding is required.'
