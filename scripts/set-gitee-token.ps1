$ErrorActionPreference = 'Stop'
$token = Read-Host '请输入 Gitee 私人令牌（只需 projects 权限，输入内容不显示）' -AsSecureString
if ($token.Length -eq 0) { throw '未输入令牌，未保存。' }
$credentialDir = Join-Path $env:LOCALAPPDATA 'Papery/release'
New-Item -ItemType Directory -Path $credentialDir -Force | Out-Null
# DPAPI binds this ciphertext to the current Windows account.
ConvertFrom-SecureString $token | Set-Content -LiteralPath (Join-Path $credentialDir 'gitee-token.dpapi') -Encoding UTF8
Write-Host 'Gitee 发布令牌已加密保存在当前 Windows 账户中。'
