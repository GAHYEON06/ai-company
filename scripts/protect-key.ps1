param([ValidateSet('protect', 'unprotect')][string]$Operation)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$value = [Console]::In.ReadToEnd()
try {
    if ($Operation -eq 'protect') {
        $bytes = [Text.Encoding]::UTF8.GetBytes($value)
        $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [Console]::Out.Write([Convert]::ToBase64String($protected))
    } else {
        $bytes = [Convert]::FromBase64String($value)
        $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))
    }
} finally {
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    if ($plain) { [Array]::Clear($plain, 0, $plain.Length) }
}
