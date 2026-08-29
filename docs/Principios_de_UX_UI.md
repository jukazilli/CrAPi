# Princípios de UX e UI — Professional Registry

## 1. Clareza antes de densidade

A interface é um console operacional, não uma planilha. Exibir primeiro o que exige decisão.

## 2. Uma tela, uma tarefa mental principal

- Overview: “está saudável?”
- Applications: “quem consome?”
- API Keys: “quem pode autenticar?”
- Requests: “o que aconteceu?”
- Registries: “quais dados conhecemos e quão recentes são?”
- Sync: “a atualização das fontes está funcionando?”
- Providers: “qual fonte está saudável?”
- Security: “há abuso ou incidente?”

## 3. Ação perigosa nunca parece ação comum

Revogar chave, bloquear aplicação ou remover provider exige:
- linguagem explícita;
- confirmação;
- consequência visível;
- feedback persistente.

## 4. Chave é um segredo, não um campo de cadastro

A chave completa é exibida somente na criação/rotação. Não existe “mostrar chave novamente”.

## 5. Progressive disclosure

A lista mostra resumo. Detalhes técnicos entram em drawer/página de detalhe.

## 6. Estado sempre visível

Operacional, degradado, bloqueado, revogado e expirado não dependem apenas de cor.

## 7. Feedback imediato

Criação, cópia, rotação, revogação, filtro e erro precisam de resposta visual imediata.

## 8. Empty states ensinam

Uma instalação nova deve explicar o próximo passo:
`Criar aplicação -> gerar chave -> fazer primeira requisição`.

## 9. Erros operacionais devem ser acionáveis

Evitar “Algo deu errado”. Preferir:
- “Provider CONFEF indisponível.”
- “Chave revogada.”
- “Limite diário atingido.”
- “Fonte alterou o formato esperado.”

## 10. Redação curta e técnica apenas quando necessária

O produto é administrativo, mas não deve exigir conhecimento do código para operações comuns.

## 11. Acessibilidade

- WCAG AA como mínimo;
- foco visível;
- navegação por teclado;
- estados não dependentes de cor;
- labels persistentes;
- alvos de interação adequados.

## 12. Responsividade

Desktop é a superfície principal. Tablet deve preservar operação completa. Mobile deve permitir inspeção e ações essenciais, sem tentar comprimir tabelas extensas.

## 13. Segurança perceptível

A UI deve comunicar:
- último uso;
- ambiente;
- escopo;
- expiração;
- revogação;
- rotação;
- limites.

## 14. Consistência

Mesmo verbo = mesma ação. Mesmo status = mesma apresentação. Mesmo risco = mesmo padrão de confirmação.

## 15. Não inventar branding

A fundação adota tokens neutros. Paleta e identidade final dependem de aprovação explícita.
