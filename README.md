# WhatsGPT

WhatsGPT é uma aplicação que integra o WhatsApp com a API do OpenAI (ChatGPT), permitindo que os usuários criem chatbots personalizados que respondem às mensagens do WhatsApp utilizando inteligência artificial.

## Funcionalidades

- **Integração WhatsApp**: Conecte-se ao WhatsApp via QR Code
- **Personalização**: Configure prompts personalizados para cada bot
- **Contexto Adicional**: Adicione URLs para que o bot tenha informações contextuais para responder às perguntas
- **Integração de Dados**: Carregue arquivos PDF, Excel e CSV para enriquecer as respostas
- **Múltiplas Configurações**: Crie e gerencie diferentes perfis de bots para diversos casos de uso

## Requisitos

- Node.js (v14 ou superior)
- NPM ou Yarn
- SQLite (incluso nas dependências)
- Chave de API da OpenAI
- Google Chrome ou Chromium (para o WhatsApp Web)

## Instalação

1. Clone o repositório:
```bash
git clone https://github.com/SEU_USUARIO/whatsgpt.git
cd whatsgpt
```

2. Instale as dependências:
```bash
npm install
```

3. Crie um arquivo `.env` na raiz do projeto com o seguinte conteúdo:
```
OPENAI_API_KEY=sua_chave_api_da_openai
PORT=3000
```

4. Inicie o servidor:
```bash
node index.js
```

## Uso

1. Acesse `http://localhost:3000` em seu navegador
2. Escaneie o QR Code exibido com seu WhatsApp
3. Configure seu bot na página de configuração
4. Comece a receber e responder mensagens automaticamente!

## Configurando seu Bot

1. Após conectar seu WhatsApp, acesse a página de configuração
2. Crie uma nova configuração com um nome e um prompt personalizado
3. Adicione URLs para contexto adicional (opcional)
4. Carregue arquivos para enriquecer as respostas (opcional)
5. Salve e ative sua configuração
6. Teste enviando mensagens para o número conectado

## Suporte

Para suporte, entre em contato com:
- Email: nzantunes1@gmail.com
- WhatsApp: (47) 99109-7740

## Licença

© 2025 WhatsGPT. Todos os direitos reservados a Nain Zahailo. 