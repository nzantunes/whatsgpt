# WhatsGPT

Um bot de WhatsApp integrado com GPT que permite responder mensagens automaticamente usando configurações personalizadas.

## Funcionalidades

- Integração com WhatsApp Web usando whatsapp-web.js
- Integração com OpenAI GPT para processamento de mensagens
- Interface web para configuração do bot
- Suporte a múltiplas configurações por usuário
- Upload e processamento de arquivos (PDF, Excel, CSV)
- Histórico de conversas
- Sistema de autenticação via QR Code

## Requisitos

- Node.js v18 ou superior
- Chrome instalado
- Conta no WhatsApp
- Chave API da OpenAI

## Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/whatsgpt.git
cd whatsgpt
```

2. Instale as dependências:
```bash
npm install
```

3. Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:
```env
OPENAI_API_KEY=sua_chave_api_aqui
SESSION_SECRET=seu_segredo_aqui
PORT=3000
```

4. Inicie o servidor:
```bash
node index.js
```

5. Acesse `http://localhost:3000` e escaneie o QR Code com seu WhatsApp.

## Configuração

1. Após escanear o QR Code, você será redirecionado para a página de configuração
2. Crie uma nova configuração com:
   - Nome da configuração
   - Prompt personalizado
   - Modelo GPT desejado
   - URLs para contexto (opcional)
   - Arquivos para contexto (opcional)

## Uso

- Envie mensagens para o número do WhatsApp configurado
- O bot responderá automaticamente usando o GPT com base nas configurações ativas
- Todas as conversas são salvas no histórico
- Você pode ter múltiplas configurações e alternar entre elas

## Contribuição

Sinta-se à vontade para contribuir com o projeto através de pull requests.

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes. 