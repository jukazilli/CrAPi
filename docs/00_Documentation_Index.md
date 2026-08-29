# Professional Registry — Índice Canônico de Documentação

Status: Fundação v0.1  
Data: 2026-08-29

## Objetivo

Este diretório é a fonte canônica de produto, UX, engenharia, segurança e entrega do **Professional Registry**, uma aplicação independente destinada à verificação de registros em conselhos profissionais brasileiros.

A solução nasce para atender Daygym e Stude.ai, mas **não pertence a nenhum dos dois ecossistemas**. Possui repositório, banco, infraestrutura, credenciais, observabilidade, ciclo de deploy e governança próprios.

## Ordem obrigatória de leitura

Agentes de IA, desenvolvedores e revisores devem consultar os documentos nesta ordem:

1. `ProfessionalRegistry_01_Pesquisa_e_Viabilidade.md`
2. `ProfessionalRegistry_02_Briefing_de_Produto_e_Escopo_do_Beta.md`
3. `ProfessionalRegistry_03_Visao_de_Product_Owner.md`
4. `Principios_de_UX_UI.md`
5. `ProfessionalRegistry_04_Direcao_de_UI_e_Design_System.md`
6. `ProfessionalRegistry_05_Especificacao_de_UX.md`
7. `ProfessionalRegistry_06_Tecnicas_de_Desenvolvimento_e_Engenharia_com_IA.md`
8. `ProfessionalRegistry_07_Arquitetura_e_Engenharia.md`
9. `ProfessionalRegistry_08_Backlog_Canonico_Rastreabilidade_e_Plano_de_Entrega.md`
10. `ProfessionalRegistry_09_Seguranca_Threat_Model_e_Gestao_de_Chaves.md`
11. `ProfessionalRegistry_10_Operacao_Observabilidade_Custos_e_Runbook.md`
12. `ProfessionalRegistry_11_Sincronizacao_Aquisicao_e_Freshness_de_Dados.md`

A arquitetura de dados adota como padrão **Database-first + Scheduled Synchronization + On-demand Refresh**. A fonte operacional consultada pelos apps é o banco próprio do Professional Registry; fontes oficiais são acessadas pelo Sync Engine e pelo refresh sob demanda.

A matriz tabular correspondente fica em:

- `ProfessionalRegistry_08_Matriz_de_Rastreabilidade_e_Backlog.xlsx`

## Regra de precedência

Quando houver conflito:

1. segurança e privacidade;
2. briefing/escopo aprovado;
3. visão do PO;
4. arquitetura;
5. UX/UI;
6. backlog;
7. implementação existente.

Código existente **não transforma comportamento acidental em requisito**.

## Fonte de verdade para IA

O arquivo raiz `AGENTS.md` traduz estes documentos em instruções executáveis para agentes de código. Nenhum agente deve iniciar implementação sem identificar o item de backlog, os requisitos afetados e os testes esperados.
