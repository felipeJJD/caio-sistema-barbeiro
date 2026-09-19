# Continuação da investigação — 19/09/2026

## Estado: sincronização ainda não resolvida

Base conferida no GitHub e em `/api/health` de produção:
`19781d5f9ba26acd13f2937d668f9498cb2e3aab`.
Não houve alteração de dados, migrações ou configuração de produção.

## Evidências

- A sessão já disponível no navegador abriu a Kaio Barbearia como administrador.
- No Histórico, período 01–19/09, os últimos registros visíveis de Davi e Eduardo eram de 12/09; registros do proprietário chegavam a 18/09.
- Isso confirma o sintoma nessa sessão, mas não comprova onde os lançamentos posteriores dos funcionários foram gravados. Não declarar perda nem atribuir a cache.
- A sessão é resolvida por `auth_sessions -> auth_accounts -> team`. A consulta do proprietário usa `organization_id`; a de barbeiro também limita `barber_id`.
- Teste HTTP com banco temporário: Davi e Eduardo registram por suas sessões; duas sessões independentes do proprietário recebem ambos. Barbeiros veem apenas seus próprios registros. Dados de outra organização ficam ocultos. Registros sobrevivem ao reinício.
- Esse teste não substitui validação nos aparelhos reais.

## Notificações: falha reproduzida e correção preparada

Uma requisição sem cookie, com `Origin: https://cortouanotou.com.br`, retornou 403 `Origem inválida` em produção, antes da autenticação. A rota comparava Origin ao endereço de execução do Next, inadequado quando o endereço público difere do interno atrás do proxy.

A correção compara com a origem de `PUBLIC_APP_URL`, usando o domínio oficial como padrão já adotado no projeto. Não confia em cabeçalhos encaminhados arbitrários. Origens externas continuam bloqueadas e a autenticação continua obrigatória. Não altera sessões, permissões ou registros.

Testes cobrem origem pública HTTPS com servidor interno HTTP, origem hostil/nula/parecida, configuração inválida, sessão obrigatória e execução da rota autenticada.

## Pontos ainda abertos

1. Obter um exemplo de lançamento posterior a 12/09, identificado por data e barbeiro, visível no aparelho do funcionário.
2. Comparar o endereço completo utilizado nesse aparelho com o do proprietário e do aparelho de teste. Nome igual da barbearia não prova banco/ambiente igual.
3. Comparar o mesmo lançamento e período nas sessões reais antes de modificar a consulta ou a sessão.
4. Observado erro React 418 na primeira carga, com data inicialmente 14/09 e depois 19/09. Datas em escopo de módulo e substituição silenciosa por dados vazios são pontos de investigação; não foram provados como causa dos registros ausentes e não foram alterados.
5. Sem acesso à configuração/logs do Railway ou leitura direta do banco de produção. Se for necessário ajuste manual, parar e explicar ao usuário antes de prosseguir.

## Validação executada

- Build de produção, typecheck e 69 testes aprovados.
- Lint: zero erros, 18 avisos existentes.
- Teste de isolamento entre organizações acrescentado e executado novamente.
- Falta validar notificações após publicação e presença dos lançamentos reais no iPhone e Android do proprietário.
