---
tipo: conceito
data: 2026-08-09
tags: [produto, multiusuario]
---

# Agente criado é instância independente

Quando um cliente cria um agente a partir de um template, ele leva uma cópia — prompt,
guardrails, ferramentas, skills recomendadas — e essa cópia passa a ser dele. Mudar o template
depois afeta **apenas os agentes novos**; os que já existem são do cliente para editar.

Importa porque a tentação oposta é forte e destrutiva: quando se corrige um prompt de template,
parece óbvio "propagar a correção" para quem já criou. Isso reescreve, sem aviso, o texto que uma
pessoa ajustou — e ela descobre pelo comportamento diferente do agente, não por um aviso.

A consequência prática é uma proibição concreta: **nunca escrever migração que altere agentes já
criados.** Migração ajusta esquema e conserta dado corrompido; não reedita conteúdo do cliente.

**Quando não se aplica:** para agentes de sistema, que são infraestrutura do produto e não do
cliente, e para correção de dado inválido (um `agent_id` apontando para skill inexistente é
defeito, não personalização).

## Ver também

- [[capacidade-referenciada-nao-copiada]]
- [[zonas-de-mudanca]]
