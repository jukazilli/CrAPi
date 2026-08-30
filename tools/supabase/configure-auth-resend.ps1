param(
  [string]$ProjectRef = "nxwqlxrdgpepscwjprym",
  [string]$SenderEmail = $(if ($env:SOBERANIA_AUTH_FROM) { $env:SOBERANIA_AUTH_FROM } else { "crapi@auth.soberania.tech" }),
  [string]$SenderName = "CrAPi | Soberania Tech"
)

$ErrorActionPreference = "Stop"

function Require-EnvironmentValue([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Variavel de ambiente obrigatoria ausente: $Name"
  }
  return $value
}

if ([string]::IsNullOrWhiteSpace($SenderEmail) -or $SenderEmail -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$") {
  throw "Informe um e-mail remetente valido e verificado no Resend."
}

$supabaseAccessToken = Require-EnvironmentValue "SUPABASE_ACCESS_TOKEN"
$resendApiKey = Require-EnvironmentValue "RESEND_API_KEY"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$templateRoot = Join-Path $repoRoot "supabase\templates"

function Read-Template([string]$Name) {
  $path = Join-Path $templateRoot $Name
  if (-not (Test-Path $path)) {
    throw "Template ausente: $path"
  }
  return Get-Content -Raw -Encoding UTF8 $path
}

$payload = @{
  external_email_enabled = $true
  mailer_secure_email_change_enabled = $true
  mailer_autoconfirm = $false

  smtp_admin_email = $SenderEmail
  smtp_host = "smtp.resend.com"
  smtp_port = "465"
  smtp_user = "resend"
  smtp_pass = $resendApiKey
  smtp_sender_name = $SenderName

  mailer_subjects_confirmation = "Confirme seu e-mail | CrAPi"
  mailer_templates_confirmation_content = Read-Template "confirmation.html"

  mailer_subjects_recovery = "Redefina sua senha | CrAPi"
  mailer_templates_recovery_content = Read-Template "recovery.html"

  mailer_subjects_magic_link = "Seu acesso seguro | CrAPi"
  mailer_templates_magic_link_content = Read-Template "magic_link.html"

  mailer_subjects_invite = "Convite para a CrAPi"
  mailer_templates_invite_content = Read-Template "invite.html"

  mailer_subjects_email_change = "Confirme seu novo e-mail | CrAPi"
  mailer_templates_email_change_content = Read-Template "email_change.html"

  mailer_subjects_reauthentication = "{{ .Token }} e seu codigo de verificacao | CrAPi"
  mailer_templates_reauthentication_content = Read-Template "reauthentication.html"
}

$headers = @{
  Authorization = "Bearer $supabaseAccessToken"
  "Content-Type" = "application/json"
}

$uri = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"
$body = $payload | ConvertTo-Json -Depth 8 -Compress

Write-Host "Configurando Supabase Auth com Resend para o projeto $ProjectRef..."
Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body $body | Out-Null
Write-Host "Configuracao concluida. Nenhum segredo foi gravado no repositorio."
Write-Host "Remetente: $SenderName <$SenderEmail>"
Write-Host "SMTP: smtp.resend.com:465 / usuario resend"
