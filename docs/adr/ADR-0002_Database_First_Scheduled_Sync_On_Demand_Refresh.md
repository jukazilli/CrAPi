# ADR-0002 — Database-first + Scheduled Sync + On-demand Refresh

Status: Aceito para a fundação  
Data: 2026-08-29

## Contexto

Consultar portais de conselhos ao vivo em toda chamada aumentaria latência, dependência externa, custo e risco de indisponibilidade.

## Decisão

O banco próprio do Professional Registry será a fonte operacional para Daygym, Stude.ai e futuros consumidores.

Fontes oficiais são sincronizadas em segundo plano e consultadas sob demanda quando um registro estiver ausente ou stale.

Estratégias possíveis por provider: FULL, INCREMENTAL, KNOWN_RECORDS e ON_DEMAND.

## Consequências positivas

- baixa latência;
- desacoplamento de disponibilidade externa;
- histórico de mudanças;
- menor número de requests upstream;
- melhor controle do free tier.

## Limitações

- freshness precisa ser explícita;
- nem toda fonte permite full sync;
- base local não é uma certidão oficial;
- atualização completa depende das capacidades e regras de cada provider.

## Regras

- ausência em sync não implica inatividade;
- sem delete automático por ausência;
- sem enumeração cega de registros;
- frequência é configurável;
- on-demand refresh usa single-flight;
- mudanças relevantes são historizadas.
