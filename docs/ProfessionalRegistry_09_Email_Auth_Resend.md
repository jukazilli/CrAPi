# Professional Registry — E-mail de autenticação com Resend

## Decisão

O envio de e-mails do Supabase Auth deve usar Resend via SMTP customizado. O Worker da CrAPi não envia diretamente e-mails de confirmação, recuperação, convite ou alteração de e-mail; ele inicia o fluxo no Supabase Auth, e o Supabase usa o Resend como transporte SMTP.

## Objetivos

- remover a dependência do SMTP padrão limitado do Supabase;
- permitir confirmação de cadastro e recuperação para qualquer endereço válido;
- usar identidade de envio da Soberania Tech;
- versionar templates de autenticação no Git;
- manter `RESEND_API_KEY` e `SUPABASE_ACCESS_TOKEN` fora do repositório;
- preservar confirmação de e-mail obrigatória (`mailer_autoconfirm=false`).

## Domínio de envio

Domínio organizacional: `soberania.tech`.

Subdomínio transacional adotado para autenticação: `auth.soberania.tech`.

Remetente padrão do CrAPi: `crapi@auth.soberania.tech`.

O subdomínio `auth.soberania.tech` deve ser usado somente para mensagens transacionais/autenticação. Isso separa a reputação desses e-mails de mensagens institucionais ou de marketing da Soberania Tech.

O endereço somente deve entrar em produção depois de `auth.soberania.tech` aparecer como verificado no Resend.

## SMTP

Configuração preparada para:

- host: `smtp.resend.com`;
- porta: `465`;
- usuário: `resend`;
- senha: API key do Resend;
- sender name: `CrAPi | Soberania Tech`;
- sender e-mail padrão: `crapi@auth.soberania.tech`.

O script aceita sobrescrever o remetente por `SOBERANIA_AUTH_FROM` ou pelo parâmetro `-SenderEmail`, sem alterar o Git.

## Templates versionados

Arquivos em `supabase/templates/`:

- `confirmation.html`;
- `recovery.html`;
- `magic_link.html`;
- `invite.html`;
- `email_change.html`;
- `reauthentication.html`.

Os links usam `{{ .TokenHash }}` e a rota server-side `/auth/confirm`, já implementada no Worker. Isso permite que o Worker troque o token por sessão e armazene a sessão em cookies seguros.

Fluxos principais:

- confirmação: `/auth/confirm?token_hash=...&type=email&next=/admin`;
- recuperação: `/auth/confirm?token_hash=...&type=recovery&next=/redefinir-senha`.

## Configuração automatizada

Script: `tools/supabase/configure-auth-resend.ps1`.

O script aplica SMTP e templates no projeto Supabase hospedado pela Management API. Ele lê os segredos apenas das variáveis de ambiente locais e não grava valores no Git.

Variáveis obrigatórias:

```powershell
$env:SUPABASE_ACCESS_TOKEN="<personal-access-token-do-supabase>"
$env:RESEND_API_KEY="<api-key-do-resend>"
```

Remetente padrão já configurado no script:

```text
CrAPi | Soberania Tech <crapi@auth.soberania.tech>
```

Se for necessário sobrescrever localmente:

```powershell
$env:SOBERANIA_AUTH_FROM="outro-remetente@auth.soberania.tech"
```

Executar na raiz do projeto:

```powershell
./tools/supabase/configure-auth-resend.ps1
```

Projeto padrão do script: `nxwqlxrdgpepscwjprym` (`cr-api`). Para outro projeto, usar `-ProjectRef`.

## Configuração manual equivalente no Supabase

Authentication → SMTP Settings / Custom SMTP:

- Sender name: `CrAPi | Soberania Tech`;
- Sender email: `crapi@auth.soberania.tech`;
- Host: `smtp.resend.com`;
- Port: `465`;
- Username: `resend`;
- Password: API key do Resend.

Manter confirmação de e-mail habilitada.

## DNS e Resend

Cadastrar no Resend exatamente o domínio `auth.soberania.tech`.

Os registros DNS devem ser copiados exatamente do painel do Resend para o provedor DNS de `soberania.tech`. O conjunto normalmente inclui autenticação DKIM e registros usados por SPF/Return-Path. Não inventar valores de DNS: usar somente os registros fornecidos pelo Resend para `auth.soberania.tech`.

Recomendações de entregabilidade:

- manter `auth.soberania.tech` exclusivo para e-mail transacional;
- configurar DMARC no domínio organizacional `soberania.tech`;
- manter click/open tracking desligado para links de autenticação, para evitar reescrita dos links;
- não usar o domínio transacional para campanhas de marketing;
- monitorar bounces e complaints no painel do Resend.

## Validação obrigatória

Depois do SMTP ser ativado:

1. confirmar `auth.soberania.tech` como `Verified` no Resend;
2. confirmar `/debug/auth/settings` com signup habilitado e autoconfirm desabilitado;
3. executar cadastro real em staging;
4. confirmar que o Resend registra `delivered` ou equivalente;
5. clicar no e-mail e verificar `/auth/confirm`;
6. confirmar criação de sessão;
7. testar recuperação de senha;
8. confirmar que nenhum segredo aparece em logs, commits ou respostas públicas;
9. conferir que um usuário autenticado sem membership continua sem acesso administrativo.

## Segurança

`RESEND_API_KEY` não é segredo do Worker e não deve ser adicionada ao Cloudflare. Ela pertence à configuração SMTP do Supabase/Resend. O Worker continua usando apenas `SUPABASE_PUBLISHABLE_KEY` para Auth e `SUPABASE_SECRET_KEY` para operações privilegiadas de banco.

O repositório contém somente templates, domínio público e automação sem credenciais reais.
