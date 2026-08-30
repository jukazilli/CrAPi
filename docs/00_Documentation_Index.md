# Professional Registry — Índice de Documentação

Status: Canônico v0.2  
Data: 2026-08-30

## Documentos principais

1. `ProfessionalRegistry_01_Pesquisa_e_Viabilidade.md` — pesquisa, fontes, limitações e viabilidade.
2. `ProfessionalRegistry_02_Briefing_de_Produto_e_Escopo_do_Beta.md` — produto, escopo, atores, Auth e critérios do beta.
3. `ProfessionalRegistry_03_Visao_de_Product_Owner.md` — direção de produto e prioridades.
4. `ProfessionalRegistry_04_Direcao_de_UI_e_Design_System.md` — linguagem visual e sistema de interface.
5. `ProfessionalRegistry_05_Especificacao_de_UX.md` — jornadas, estados e experiência operacional.
6. `ProfessionalRegistry_06_Tecnicas_de_Desenvolvimento_e_Engenharia_com_IA.md` — práticas de desenvolvimento e colaboração com IA.
7. `ProfessionalRegistry_07_Arquitetura_e_Engenharia.md` — arquitetura Database-first, Supabase Auth, memberships, Data Plane e Sync Engine.
8. `ProfessionalRegistry_08_Backlog_Canonico_Rastreabilidade_e_Plano_de_Entrega.md` — requisitos, backlog e evidências.
9. `ProfessionalRegistry_08_Matriz_de_Rastreabilidade_e_Backlog.xlsx` — matriz detalhada; sincronização com o backlog Markdown deve ser mantida explicitamente.
10. `Principios_de_UX_UI.md` — princípios transversais de UX/UI.

## Documentos técnicos de apoio

- `security/environment-contract.md` — contrato de ambientes, configuração pública, secrets, identidade humana e credenciais de aplicações.
- `governance/m0-foundation.md` — registro histórico da fundação M0.
- `AGENTS.md` — regras operacionais para alterações por agentes/IA.

## Decisões vigentes

- CrAPi é independente de DayGym e Stude.ai.
- Fonte operacional: Registry Store próprio em Supabase PostgreSQL.
- Aquisição: Database-first + Scheduled Synchronization + On-demand Refresh.
- Identidade humana: Supabase Auth.
- Autorização administrativa: `admin_memberships` com OWNER/ADMIN.
- Autenticação de aplicações: API Keys próprias `prk_test_*` / `prk_live_*`.
- Login humano nunca substitui API Key do Data Plane.
- Cloudflare Workers executam Data Plane e Control Plane server-side.
- Cloudflare Access pode ser perímetro adicional em produção, mas não é o login primário.

## Regra de atualização

Mudança arquitetural ou de segurança deve atualizar no mesmo trabalho, quando aplicável:
- briefing;
- arquitetura;
- backlog canônico;
- environment contract;
- README;
- evidência do PR.

A matriz XLSX não deve ser considerada atualizada automaticamente a partir do Markdown.
