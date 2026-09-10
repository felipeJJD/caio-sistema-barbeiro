# Cortou Anotou — Railway

Sistema de gestão de barbearias, baseado na entrega v148. Next.js 16 / React 19, SQLite e fotos em volume persistente.

## Executar

Node.js 24.13 ou superior (linha 24).

```sh
npm ci
npm run build
npm test
npm start
```

O banco e uploads ficam em `.data` localmente. No Railway, montar volume em `/data`; o processo recusa iniciar sem volume persistente. Usar uma réplica. As 33 migrações são aplicadas no startup com checksum e transação. Não editar migrações já aplicadas.

## Railway

O Dockerfile gera o build de produção. Healthcheck: `/api/health`. Porta: `PORT` (3000 por padrão).

Para criar o primeiro administrador, configurar `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` pelos secrets do provedor. A senha precisa ter ao menos 12 caracteres. Opcionalmente definir `INITIAL_ADMIN_NAME` e `INITIAL_ORGANIZATION_NAME`. O bootstrap só funciona quando não existe nenhuma conta e nunca redefine senhas. Remover a variável da senha após ativar o administrador.

Configurar `PUBLIC_APP_URL` com a URL pública. Integrações opcionais: `RESEND_API_KEY`, `OWNER_EMAIL_FROM`, `SUPPORT_EMAIL`, `PLATFORM_SECRETS_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `OPENAI_HELP_MODEL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e credenciais Mercado Pago. Nunca gravar valores no Git. Sem essas configurações, e-mail/cadastro público, pagamentos e notificações externas não estão prontos para operação.

## Migração e verificação

O ZIP original não contém dados D1, objetos R2 ou credenciais da instalação anterior. Esta implantação inicia uma base nova. Para migrar clientes existentes, é necessário importar o banco e fotos e preservar a chave original de criptografia. O domínio anterior não é alterado.

`npm test` inclui testes reais do servidor de produção: login, autorização, painel, gravação, upload/leitura de foto e persistência após reinício. Executar o build antes. `npm run typecheck` e `npm run lint` verificam o código.

O login via cabeçalhos de identidade do antigo provedor está desativado no Railway. Dados demonstrativos não são gerados em produção.

Documentação original: `LEIA-PRIMEIRO-FELIPE.md`. Os arquivos de Cloudflare preservados são referência da origem; o deploy usa `Dockerfile` e `railway.json`.