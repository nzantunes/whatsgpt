# ChatBot WhatsApp com Extração de Conteúdo do Site

Um chatbot para WhatsApp que extrai informações do seu site e usa o GPT para responder perguntas com base nessas informações. Inclui uma interface web para configuração.

## Funcionalidades

- Interface web para configurar o prompt e o link do site
- Extração automática de conteúdo do site para fornecer ao GPT
- Conexão com WhatsApp via QR Code
- Integração com OpenAI GPT para gerar respostas baseadas no conteúdo do site
- Resposta automática a mensagens do WhatsApp

## Requisitos

- Node.js (v14 ou superior)
- Navegador Google Chrome instalado
- Conexão com a internet

## Instalação

1. Clone este repositório ou baixe os arquivos

2. Instale as dependências:
```
npm install
```

3. Configure o arquivo `.env` com sua chave da API OpenAI:
```
OPENAI_API_KEY=sua_chave_da_api_openai
```

4. Inicie o servidor:
```
npm start
```

5. Acesse a interface web:
```
http://localhost:3000
```

## Como usar

### Configuração do ChatBot

1. Acesse a interface web em `http://localhost:3000`

2. No campo **Prompt (Descrição do seu site)**, descreva o que seu site faz e como o bot deve se comportar. Por exemplo:
   ```
   Você é um assistente da loja XYZ que vende produtos eletrônicos. Responda dúvidas sobre nossos produtos, preços e políticas de entrega.
   ```

3. No campo **Link do Site**, adicione o URL completo do seu site (incluindo https://). Por exemplo:
   ```
   https://www.minhaloja.com.br
   ```

4. Clique no botão **Extrair Conteúdo** para extrair as informações do site. O sistema irá:
   - Acessar o site informado
   - Extrair textos, títulos, descrições e outros conteúdos relevantes
   - Mostrar uma prévia do conteúdo extraído
   - Armazenar essas informações para uso pelo GPT

5. Clique em **Salvar Configuração** para salvar as configurações e o conteúdo extraído

### Conexão com WhatsApp

1. Na seção **Conexão com WhatsApp**, um QR Code será exibido

2. Abra o WhatsApp no seu celular

3. Toque em Menu (três pontos) > WhatsApp Web

4. Escaneie o QR Code exibido na tela

5. Após a conexão, o status mudará para "Conectado"

### Uso do ChatBot

- Qualquer mensagem enviada para o número do WhatsApp conectado será respondida automaticamente pelo bot
- O bot usará o prompt, o link do site e o conteúdo extraído para gerar respostas relevantes
- Você pode atualizar a configuração ou extrair novamente o conteúdo do site a qualquer momento através da interface web

## Como funciona a extração de conteúdo

O sistema utiliza web scraping para extrair informações do seu site:

1. Acessa a URL fornecida
2. Extrai o título da página, meta descrições, cabeçalhos (H1, H2, H3)
3. Captura parágrafos, listas e conteúdo de tabelas
4. Remove elementos não relevantes como scripts e estilos
5. Formata o conteúdo para ser utilizado pelo GPT
6. Limita o tamanho do conteúdo para evitar exceder os limites de tokens do GPT

## Solução de problemas

- Se o QR Code não aparecer, tente reiniciar o servidor
- Se o WhatsApp desconectar, um novo QR Code será gerado automaticamente
- Se a extração de conteúdo falhar, verifique se a URL está correta e se o site permite acesso via web scraping
- Certifique-se de que sua chave da API OpenAI é válida

## Tecnologias utilizadas

- Node.js
- Express
- Socket.io
- WhatsApp Web.js
- OpenAI API
- Cheerio (para web scraping)
- Axios
- Bootstrap 