const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extrai o conteúdo de uma URL
 * @param {string} url - URL para extrair o conteúdo
 * @returns {Promise<string>} - Conteúdo extraído
 */
async function extractUrlContent(url) {
  try {
    // Validar URL
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw new Error('URL inválida: ' + url);
    }
    
    console.log(`Extraindo conteúdo da URL: ${url}`);
    
    // Fazer requisição HTTP
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html',
      },
      timeout: 15000, // 15 segundos
      maxContentLength: 10 * 1024 * 1024 // 10MB
    });
    
    // Verificar se a resposta é HTML
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      console.log(`Tipo de conteúdo não suportado: ${contentType}`);
      return `[Conteúdo não extraído - formato: ${contentType}]`;
    }
    
    // Extrair texto usando cheerio
    const $ = cheerio.load(response.data);
    
    // Remover elementos não desejados
    $('script, style, meta, link, noscript, footer, header, nav, svg, img').remove();
    
    // Extrair título
    const title = $('title').text().trim();
    
    // Extrair conteúdo principal
    let mainContent = '';
    
    // Tentar encontrar o conteúdo principal por seletores comuns
    const mainSelectors = ['article', 'main', '.content', '.main-content', '#content', '#main'];
    
    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        mainContent = element.text().trim();
        break;
      }
    }
    
    // Se não encontrou conteúdo principal, usar o body
    if (!mainContent) {
      mainContent = $('body').text().trim();
    }
    
    // Limpar o texto
    mainContent = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    // Limitar o tamanho do texto
    const maxLength = 10000;
    if (mainContent.length > maxLength) {
      mainContent = mainContent.substring(0, maxLength) + '... [conteúdo truncado]';
    }
    
    // Formatar o resultado
    const result = `
Título: ${title}
URL: ${url}
---
${mainContent}
---
    `.trim();
    
    console.log(`Conteúdo extraído da URL: ${url} (${result.length} caracteres)`);
    
    return result;
  } catch (error) {
    console.error(`Erro ao extrair conteúdo da URL ${url}:`, error.message);
    return `[Erro ao extrair conteúdo da URL: ${error.message}]`;
  }
}

/**
 * Extrai conteúdo de múltiplas URLs
 * @param {string[]} urls - Lista de URLs para extrair
 * @returns {Promise<string>} - Conteúdo extraído de todas as URLs
 */
async function extractMultipleUrls(urls) {
  try {
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return '';
    }
    
    console.log(`Extraindo conteúdo de ${urls.length} URLs`);
    
    // Processar até 5 URLs em paralelo
    const results = [];
    const batchSize = 5;
    
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(url => extractUrlContent(url))
      );
      
      results.push(...batchResults);
    }
    
    // Concatenar resultados
    const concatenated = results.join('\n\n');
    
    console.log(`Extração concluída: ${urls.length} URLs, ${concatenated.length} caracteres`);
    
    return concatenated;
  } catch (error) {
    console.error('Erro ao extrair múltiplas URLs:', error);
    return '[Erro ao extrair conteúdo das URLs]';
  }
}

module.exports = {
  extractUrlContent,
  extractMultipleUrls
}; 