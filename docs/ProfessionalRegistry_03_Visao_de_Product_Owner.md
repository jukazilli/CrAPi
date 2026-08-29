# Professional Registry — Visão de Product Owner

Status: Draft v0.1  
Data: 2026-08-29

## Visão

Construir uma camada confiável de infraestrutura que transforme fontes públicas de registros profissionais em uma verificação técnica uniforme, auditável e segura.

## Proposta de valor

Para aplicações internas, o Professional Registry oferece:

- um contrato único;
- uma credencial única por aplicação;
- isolamento dos detalhes dos conselhos;
- histórico e observabilidade;
- menor risco de implementação incorreta;
- substituição de provider sem quebrar consumidores.

## Princípios de decisão do PO

1. **Conclusão segura é melhor que conclusão falsa.**  
   Em dúvida, retornar `UNKNOWN`/`INCONCLUSIVE`.

2. **Independência é requisito de produto.**  
   Não acoplar ao Daygym ou Stude.ai.

3. **Server-to-server por padrão.**  
   Segredos não pertencem a apps distribuídos.

4. **Database-first e free-first.**  
   Aplicações consultam nossa base; sincronizações e refreshes externos são controlados para reduzir custo, latência e dependência.

5. **Provider é descartável; contrato é estável.**  
   Alterações de fonte não devem alterar consumidores.

6. **Observabilidade faz parte da feature.**  
   Não existe provider “pronto” sem métricas, erros e evidência.

7. **Controle administrativo simples.**  
   A UI deve responder rapidamente: está funcionando, quem usa, quanto usa, qual chave está ativa, onde falhou.

## Objetivos do beta

- CREF funcional.
- Banco local de registros profissionais como fonte operacional.
- Sincronização periódica e refresh sob demanda.
- API Key lifecycle completo.
- Console operacional.
- Supabase PostgreSQL e Cloudflare Worker independentes.
- Auditoria mínima.
- Cache e quotas.
- Estrutura preparada para CRM.

## Não objetivos

- ser plataforma pública de busca;
- armazenar uma cópia massiva de bases de conselhos;
- emitir julgamento profissional próprio;
- substituir certidão oficial;
- permitir acesso anônimo;
- automatizar evasão de mecanismos anti-bot.

## Métricas

### Produto

- percentual de verificações conclusivas;
- integrações ativas;
- tempo para criar aplicação e primeira chave;
- percentual de requests respondidos integralmente pelo banco local;
- idade média dos dados (freshness);
- novos/alterados por sync.

### Confiabilidade

- success rate por provider;
- p50/p95 de latência;
- `SOURCE_UNAVAILABLE`;
- `SCHEMA_CHANGED`;
- circuit breaker openings.

### Segurança

- chaves revogadas;
- tentativas inválidas;
- rate limit events;
- secret scanning incidents;
- zero segredos em logs/bundles.

### Custos

- requests/dia frente ao soft limit;
- leituras/escritas no PostgreSQL, storage e egress;
- chamadas externas evitadas por cache.

## Definition of Beta Ready

O produto só entra em beta com dados reais quando:

- threat model revisado;
- Access ativo no console;
- fluxo de API Key provado;
- segredo não aparece no banco em claro;
- secrets scan e dependency audit passam;
- staging reproduzível;
- restore/export do banco testado;
- limites e alertas definidos;
- CREF possui fixtures e contract tests;
- falha de provider não vira falso status profissional.
