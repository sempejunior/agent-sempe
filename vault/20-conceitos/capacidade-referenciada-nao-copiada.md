---
tipo: conceito
data: 2026-08-09
tags: [arquitetura, capacidades]
---

# Capacidade se referencia, não se copia

Cada capacidade da plataforma tem uma casa só, e todo o resto aponta para ela por um
identificador — o `id` da ferramenta, o nome da skill, o `template_id`, o slug da integração.
Nada de copiar o conteúdo para uma segunda camada "para ficar mais fácil ali".

Importa porque a alternativa se degrada em silêncio. Quando a mesma lista de ferramentas existe
no catálogo do backend e outra vez no frontend, elas divergem na primeira ferramenta nova, e o
sintoma não é um erro: é uma opção que o cliente marca e que não faz nada. O mesmo vale para uma
skill descrita no template e reescrita no prompt do agente.

**Quando se aplica:** sempre que você estiver prestes a escrever um id, um nome de skill ou um
slug em um segundo arquivo. Esse é o momento de introduzir ou usar um catálogo.

**Quando não se aplica:** para o conteúdo que o cliente editou. Um agente criado é uma cópia
independente do template de propósito — ver [[agente-e-instancia-independente]]. A regra é sobre
a definição da capacidade, não sobre a instância que alguém personalizou.

O padrão está descrito em `CLAUDE.md` e no `docs/backlog/05-padronizacao-capacidades.md`, e ainda
**não está totalmente implementado**: partes do frontend ainda repetem listas que o backend
poderia gerar.

## Ver também

- [[agente-e-instancia-independente]]
- [[zonas-de-mudanca]]
