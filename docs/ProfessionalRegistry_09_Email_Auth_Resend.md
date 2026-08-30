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

Domínio verificado no Resend: `soberania.tech`.

Remetente padrão do CrAPi: `no-reply@soberania.tech`.

A CrAPi usa o domínio raiz já verificado pela Soberania Tech para e-mails de autenticação. O endereço `no-reply@soberania.tech` é o remetente técnico padrão e não depende da existência de uma caixa postal para envio via Resend.

## SMTP

Configuração preparada para:

- host: `smtp.resend.com`;
- porta: `465`;
- usuário: `resend`;
- senha: API key do Resend;
- sender name: `CrAPi | Soberania Tech`;
- sender e-mail padrão: `no-reply@soberania.tech`.

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

O script aplica SMTP e templates no projeto Supabase hospedado pela Management API. No fluxo em nuvem, ele é executado pelo GitHub Actions e lê os segredos somente dos GitHub Actions Secrets, sem gravá-los no repositório.

Secrets obrigatórios no GitHub:

- `SUPABASE_ACCESS_TOKEN`;
- `RESEND_API_KEY`.

Remetente padrão configurado:

```text
CrAPi | Soberania Tech <no-reply@soberania.tech>
```

Projeto padrão do script: `nxwqlxrdgpepscwjprym` (`cr-api`).

## Configuração manual equivalente no Supabase

Authentication → SMTP Settings / Custom SMTP:

- Sender name: `CrAPi | Soberania Tech`;
- Sender email: `no-reply@soberania.tech`;
- Host: `smtp.resend.com`;
- Port: `465`;
- Username: `resend`;
- Password: API key do Resend.

Manter confirmação de e-mail habilitada.

## DNS e Resend

O domínio `soberania.tech` está verificado no Resend e é a identidade de envio usada pela CrAPi.

Os registros DNS de autenticação devem permanecer conforme os valores fornecidos pelo Resend. Não inventar ou alterar DKIM/SPF/Return-Path sem validar a configuração no painel do Resend.

Recomendações de entregabilidade:

- usar `no-reply@soberania.tech` somente para mensagens transacionais do sistema;
- configurar/manter DMARC no domínio `soberania.tech`;
- manter click/open tracking desligado para links de autenticação, para evitar reescrita dos links;
- não usar o endereço de autenticação para campanhas de marketing;
- monitorar bounces e complaints no painel do Resend.

## Validação obrigatória

Depois do SMTP ser ativado:

1. confirmar `soberania.tech` como `Verified` no Resend;
2. confirmar `/debug/auth/settings` com signup habilitado e autoconfirm desabilitado;
3. confirmar o teste SMTP real usando `no-reply@soberania.tech`;
4. executar cadastro real em staging;
5. confirmar que o Resend registra `delivered` ou equivalente;
6. clicar no e-mail e verificar `/auth/confirm`;
7. confirmar criação de sessão;
8. testar recuperação de senha;
9. confirmar que nenhum segredo aparece em logs, commits ou respostas públicas;
10. conferir que um usuário autenticado sem membership continua sem acesso administrativo.

## Segurança

`RESEND_API_KEY` não é segredo do Worker e não deve ser adicionada ao Cloudflare. Ela pertence à configuração SMTP do Supabase/Resend. O Worker continua usando apenas `SUPABASE_PUBLISHABLE_KEY` para Auth e `SUPABASE_SECRET_KEY` para operações privilegiadas de banco.

O repositório contém somente templates, domínio público e automação sem credenciais reais.
