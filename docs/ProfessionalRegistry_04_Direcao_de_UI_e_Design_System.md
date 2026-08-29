# Professional Registry — Direção de UI e Design System

Status: Draft v0.1

## Direção

Console administrativo minimalista, inspirado em ferramentas de infraestrutura modernas, com baixa carga cognitiva e hierarquia forte.

Referências conceituais: consoles como Resend/Stripe/Vercel apenas como padrão de interação, sem copiar identidade visual.

## Layout

### Desktop

- sidebar compacta;
- header contextual;
- conteúdo com largura confortável;
- tabelas para entidades;
- cards apenas para KPIs e estados;
- drawers para inspeção rápida;
- páginas dedicadas para configuração complexa.

### Navegação

- Overview
- Applications
- API Keys
- Requests
- Registries
- Providers
- Sync
- Security
- Settings

## Tokens semânticos

Não fixar branding antes de aprovação.

Categorias obrigatórias:
- `surface`
- `surface-muted`
- `text-primary`
- `text-secondary`
- `border`
- `accent`
- `success`
- `warning`
- `danger`
- `info`

## Componentes fundacionais

- AppShell
- Sidebar
- PageHeader
- Stat
- DataTable
- FilterBar
- StatusBadge
- EmptyState
- SecretReveal
- ConfirmDangerDialog
- Drawer
- CodeSnippet
- CopyButton
- UsageMeter
- ProviderHealth
- RegistryFreshness
- SyncRunSummary
- RequestTimeline
- Toast
- Skeleton
- ErrorState

## Padrão de API Key

Lista:
`Nome | Ambiente | Prefixo | Scopes | Último uso | Status | ...`

Criação:
1. nome;
2. ambiente;
3. scopes;
4. quota;
5. expiração;
6. confirmar;
7. exibir segredo uma única vez.

Após fechar, a UI só mostra prefixo + last4.

## Padrão de request log

Lista:
`timestamp | aplicação | endpoint | conselho | resultado | HTTP | cache | latência`

Detalhe:
- Request ID;
- aplicação;
- key ID/prefixo, nunca segredo;
- provider;
- status;
- latência;
- cache;
- erro sanitizado;
- security flags.

## Padrão de status

Texto e ícone acompanham cor:
- Operational
- Degraded
- Unavailable
- Disabled
- Revoked
- Expired
- Rate limited

## Tipografia

- sans-serif de sistema na fundação;
- monospace para IDs, chaves parciais, endpoints e snippets;
- evitar fontes externas como dependência operacional no beta.

## Motion

Microinterações curtas apenas para:
- copiar;
- carregar;
- abrir drawer;
- confirmar criação;
- mudança de status.

Nenhuma animação pode atrasar operação.

## Padrão de Registries

Resumo por conselho/UF: registros conhecidos, freshness, última sincronização, novos, alterados e estado da fonte.

## Padrão de Sync

Lista: `started_at | provider | mode | processed | new | changed | unchanged | errors | status`.

Detalhe: cursor/checkpoint, duração, falhas sanitizadas e links para provider health.
