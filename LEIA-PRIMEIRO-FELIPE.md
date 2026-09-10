# Cortou Anotou — entrega técnica para migração

Este pacote corresponde ao código da versão 148, publicada em 09/09/2026 no domínio `cortouanotou.com.br`.

## Arquitetura atual

- Aplicação full-stack TypeScript/React com Next.js 16, Vinext e Vite.
- Execução server-side em Cloudflare Workers.
- Banco relacional Cloudflare D1 acessado no servidor por Drizzle ORM, binding `DB`.
- Arquivos e fotos no Cloudflare R2, binding `BUCKET`.
- Rotas de API dentro de `app/api/`.
- Migrações do banco em `drizzle/`.
- Worker principal em `worker/index.ts`.
- PWA com manifest e service worker em `public/`.

## Requisitos

- Node.js 22.13 ou superior.
- Ambiente Linux para usar os scripts originais.
- Cloudflare Workers, D1 e R2 ou adaptações equivalentes.

Instalação e validação:

```bash
npm ci
npm test
```

O projeto usa o script `npm run build`, que gera o Worker em `dist/server/index.js`.

## Configurações secretas necessárias

Configure como secrets/variáveis no servidor. Não grave valores reais no Git:

- `PUBLIC_APP_URL`
- `RESEND_API_KEY`
- `OWNER_EMAIL_FROM`
- `SUPPORT_EMAIL`
- `PLATFORM_SECRETS_ENCRYPTION_KEY`
- `OPENAI_API_KEY`
- `OPENAI_HELP_MODEL`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `MERCADO_PAGO_ACCESS_TOKEN` (fallback; também pode existir criptografado no banco)
- `MERCADO_PAGO_WEBHOOK_SECRET` (fallback; também pode existir criptografado no banco)

A chave `PLATFORM_SECRETS_ENCRYPTION_KEY` precisa ser preservada na migração. Trocá-la sem recriptografar os registros impede a leitura das credenciais do Mercado Pago já armazenadas.

## O que este ZIP não contém

- Dados reais do D1.
- Objetos e fotos reais do R2.
- Chaves de API, tokens e senhas.
- Dependências instaladas (`node_modules`).
- Histórico interno do Git.

Esses itens devem ser exportados separadamente pelo proprietário durante a migração.

## Ordem recomendada da migração

1. Criar o novo Worker, D1 e R2 em contas controladas pelo Kaio.
2. Configurar bindings `DB` e `BUCKET` e todas as variáveis acima.
3. Aplicar as migrações de `drizzle/` em uma base vazia de teste.
4. Exportar o D1 atual e importar no novo banco preservando IDs e relações.
5. Copiar os objetos do R2 preservando as chaves/caminhos.
6. Publicar em um endereço temporário e executar testes completos.
7. Confirmar login, redefinição de senha, e-mail, agenda pública, registros, produtos, mensalistas, comissões, afiliados, Mercado Pago, fotos, notificações e Central de Ajuda.
8. Fazer backup final, limitar escritas durante o corte, sincronizar a diferença e apontar o domínio.
9. Manter a versão anterior disponível para rollback até a confirmação da estabilidade.

## Observações importantes

A migração do código sozinha não migra usuários nem dados. O D1, o R2 e as variáveis de ambiente precisam ser transferidos.

Não alterar o domínio de produção antes de testar a cópia. Depois da migração, mantenha o projeto em um repositório Git privado para que Felipe e Codex continuem fazendo atualizações com histórico e rollback.
