# Solução de Problemas do Servidor WhatsGPT

Este documento contém instruções para resolver os problemas comuns encontrados no servidor WhatsGPT.

## Problemas Identificados

1. **Erro de Autenticação da API OpenAI**
2. **Erro de Acesso a Arquivos do WhatsApp**
3. **Problemas de Desconexão do WhatsApp**

## Soluções

### 1. Configurar a Chave da API OpenAI

O erro `401 Incorrect API key provided` indica que a chave da API OpenAI está inválida.

**Solução:**
1. Acesse [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
2. Crie uma nova chave de API
3. Edite o arquivo `.env` e substitua a linha:
   ```
   OPENAI_API_KEY=sk-sua-chave-api-aqui
   ```
   pela sua chave real:
   ```
   OPENAI_API_KEY=sk-sua-chave-real-aqui
   ```

### 2. Resolver Problemas de Arquivos Bloqueados

O erro `EBUSY: resource busy or locked` indica que há arquivos de sessão do WhatsApp bloqueados.

**Solução:**
1. Execute o script de limpeza:
   ```
   node limpar-sessao.js
   ```
2. Reinicie o servidor:
   ```
   node index.js
   ```

### 3. Reiniciar o Servidor Completamente

Se os problemas persistirem, use o script de reinicialização:

```
node reiniciar.js
```

Este script irá:
- Encerrar todos os processos Node.js
- Limpar os arquivos de sessão do WhatsApp
- Reiniciar o servidor

## Verificação da Porta

Se o servidor não iniciar devido a erro de porta em uso:

1. Verifique qual processo está usando a porta:
   ```
   netstat -ano | findstr :3000
   ```

2. Encerre o processo usando o PID encontrado:
   ```
   taskkill /F /PID [número-do-pid]
   ```

## Logs e Depuração

Para ver logs detalhados do servidor:

```
node --trace-warnings index.js
```

## Contato para Suporte

Se os problemas persistirem, entre em contato com o suporte técnico. 