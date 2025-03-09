const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');

/**
 * Extrai o texto de um arquivo PDF
 * @param {Buffer} pdfBuffer - Buffer do arquivo PDF
 * @returns {Promise<string>} - Texto extraído do PDF
 */
async function extractPdfContent(pdfBuffer) {
  try {
    console.log('Extraindo conteúdo do PDF...');
    const data = await pdfParse(pdfBuffer);
    console.log(`Extraído ${data.text.length} caracteres do PDF`);
    return data.text;
  } catch (error) {
    console.error('Erro ao extrair conteúdo do PDF:', error);
    throw new Error(`Falha ao processar PDF: ${error.message}`);
  }
}

/**
 * Processa um arquivo Excel e converte em texto estruturado
 * @param {Buffer} excelBuffer - Buffer do arquivo Excel
 * @returns {string} - Conteúdo do Excel em formato texto
 */
function processExcel(excelBuffer) {
  try {
    console.log('Processando arquivo Excel...');
    const workbook = XLSX.read(excelBuffer);
    
    let result = '';
    
    // Processar cada planilha
    for (const sheetName of workbook.SheetNames) {
      console.log(`Processando planilha: ${sheetName}`);
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // Adicionar nome da planilha e dados
      result += `\n### Planilha: ${sheetName} ###\n`;
      
      if (jsonData.length === 0) {
        result += "Nenhum dado encontrado nesta planilha.\n";
        continue;
      }
      
      // Obter cabeçalhos (nomes das colunas)
      const headers = Object.keys(jsonData[0]);
      
      // Adicionar informações sobre a planilha
      result += `Total de linhas: ${jsonData.length}\n`;
      result += `Colunas: ${headers.join(' | ')}\n\n`;
      
      // Limitar o número de linhas para não sobrecarregar o prompt
      const maxRows = Math.min(jsonData.length, 25);
      result += `Amostra de dados (primeiras ${maxRows} linhas):\n`;
      
      // Adicionar cada linha
      for (let i = 0; i < maxRows; i++) {
        const row = jsonData[i];
        result += `Linha ${i + 1}: `;
        headers.forEach(header => {
          const value = row[header] !== undefined ? row[header] : 'N/A';
          result += `${header}: ${value} | `;
        });
        result = result.slice(0, -3); // Remover o último " | "
        result += "\n";
      }
      
      // Se houver mais linhas, indicar isso
      if (jsonData.length > maxRows) {
        result += `... e mais ${jsonData.length - maxRows} linhas não mostradas ...\n`;
      }
      
      // Adicionar informações de resumo dos dados para ajudar o GPT
      result += "\n### Resumo da Planilha ###\n";
      result += `Esta planilha contém dados em formato tabular com ${headers.length} colunas e ${jsonData.length} linhas.\n`;
      result += "Para consultar estes dados, você pode fazer perguntas como:\n";
      result += "- Quais dados existem para [coluna específica]?\n";
      result += "- Qual é o valor de [coluna] para [condição específica]?\n";
      result += "- Mostre um resumo dos dados desta planilha\n\n";
      
      result += "\n";
    }
    
    console.log(`Extraído ${result.length} caracteres do Excel`);
    return result;
  } catch (error) {
    console.error('Erro ao processar arquivo Excel:', error);
    throw new Error(`Falha ao processar Excel: ${error.message}`);
  }
}

/**
 * Processa um arquivo CSV e converte em texto estruturado
 * @param {Buffer} csvBuffer - Buffer do arquivo CSV
 * @param {string} delimiter - Delimitador de colunas (padrão: vírgula)
 * @returns {string} - Conteúdo do CSV em formato texto
 */
function processCsv(csvBuffer, delimiter = ',') {
  try {
    console.log('Processando arquivo CSV...');
    console.log('Tamanho do buffer recebido:', csvBuffer.length, 'bytes');
    
    if (!csvBuffer || csvBuffer.length === 0) {
      console.error('Buffer CSV vazio ou inválido');
      return "Arquivo CSV vazio ou inválido.";
    }
    
    // Converter buffer para string, tentando diferentes encodings
    let csvContent = '';
    const encodings = ['utf8', 'latin1', 'ascii', 'utf16le'];
    let encodingUsado = 'utf8'; // padrão
    
    for (const encoding of encodings) {
      try {
        const tempContent = csvBuffer.toString(encoding);
        // Verificar se o conteúdo parece válido (não tem muitos caracteres de substituição)
        const invalidChars = (tempContent.match(/\ufffd/g) || []).length;
        
        if (invalidChars < 10) {
          csvContent = tempContent;
          encodingUsado = encoding;
          console.log(`Usando encoding ${encoding} (${invalidChars} caracteres inválidos encontrados)`);
          break;
        }
      } catch (encError) {
        console.log(`Falha ao tentar encoding ${encoding}:`, encError.message);
      }
    }
    
    console.log(`Encoding final utilizado: ${encodingUsado}`);
    console.log('Tamanho do conteúdo CSV:', csvContent.length, 'caracteres');
    
    // Verificar se o conteúdo está vazio
    if (!csvContent || csvContent.trim().length < 5) {
      console.error('Conteúdo do CSV está vazio ou muito pequeno');
      return "Arquivo CSV vazio ou com conteúdo insuficiente.";
    }
    
    // Exibir primeiros 100 caracteres para debug
    console.log('Amostra do conteúdo CSV (primeiros 100 caracteres):');
    console.log(csvContent.substring(0, 100).replace(/\n/g, '\\n').replace(/\r/g, '\\r'));
    
    // Detecção automática de delimitador
    const sample = csvContent.substring(0, Math.min(2000, csvContent.length));
    const delimiters = {
      ',': (sample.match(/,/g) || []).length,
      ';': (sample.match(/;/g) || []).length,
      '\t': (sample.match(/\t/g) || []).length,
      '|': (sample.match(/\|/g) || []).length
    };
    
    console.log('Contagem de delimitadores detectados:', delimiters);
    
    // Encontrar o delimitador mais frequente
    let maxCount = 0;
    let detectedDelimiter = delimiter;
    
    for (const [d, count] of Object.entries(delimiters)) {
      if (count > maxCount) {
        maxCount = count;
        detectedDelimiter = d;
      }
    }
    
    if (detectedDelimiter !== delimiter) {
      console.log(`Delimitador detectado automaticamente: "${detectedDelimiter === '\t' ? 'TAB' : detectedDelimiter}"`);
      delimiter = detectedDelimiter;
    } else {
      console.log(`Usando delimitador padrão: "${delimiter}"`);
    }
    
    // Tratar diferentes tipos de quebras de linha (Windows, Unix, Mac)
    let lines = [];
    if (csvContent.includes('\r\n')) {
      lines = csvContent.split('\r\n');
      console.log('Quebra de linha detectada: Windows (\\r\\n)');
    } else if (csvContent.includes('\r')) {
      lines = csvContent.split('\r');
      console.log('Quebra de linha detectada: Mac antigo (\\r)');
    } else {
      lines = csvContent.split('\n');
      console.log('Quebra de linha detectada: Unix (\\n)');
    }
    
    // Filtrar linhas vazias
    lines = lines.filter(line => line.trim());
    console.log(`CSV contém ${lines.length} linhas não vazias`);
    
    if (lines.length === 0) {
      return "Arquivo CSV vazio ou inválido (sem linhas).";
    }
    
    if (lines.length === 1) {
      console.log('Aviso: CSV contém apenas uma linha. Pode ser um formato inválido ou linha de cabeçalho apenas.');
    }
    
    try {
      // Obter cabeçalhos da primeira linha
      const headers = lines[0].split(delimiter).map(header => {
        // Remover aspas e espaços extras
        return header.trim().replace(/^["']|["']$/g, '');
      });
      
      console.log(`Cabeçalhos detectados (${headers.length}):`, headers.slice(0, 5).join(', ') + (headers.length > 5 ? '...' : ''));
      
      if (headers.length === 1) {
        console.warn('Alerta: Apenas um cabeçalho detectado. O delimitador pode estar incorreto.');
        console.warn('Conteúdo do único cabeçalho:', headers[0].substring(0, 50) + (headers[0].length > 50 ? '...' : ''));
        
        // Tentar outro delimitador se o cabeçalho for muito grande (indicação de erro de delimitador)
        if (headers[0].length > 50) {
          console.log('Tentando detectar delimitador alternativo...');
          // Verificar qual delimitador aparece mais no cabeçalho
          const altDelimiters = {
            ',': (headers[0].match(/,/g) || []).length,
            ';': (headers[0].match(/;/g) || []).length,
            '\t': (headers[0].match(/\t/g) || []).length,
            '|': (headers[0].match(/\|/g) || []).length
          };
          
          let maxAltCount = 0;
          let altDelimiter = null;
          
          for (const [d, count] of Object.entries(altDelimiters)) {
            if (count > maxAltCount) {
              maxAltCount = count;
              altDelimiter = d;
            }
          }
          
          if (altDelimiter && maxAltCount > 2) {
            console.log(`Tentando delimitador alternativo: ${altDelimiter}`);
            delimiter = altDelimiter;
            // Reprocessar os cabeçalhos
            const altHeaders = lines[0].split(delimiter).map(header => 
              header.trim().replace(/^["']|["']$/g, '')
            );
            if (altHeaders.length > headers.length) {
              console.log(`Melhor resultado com delimitador alternativo: ${altHeaders.length} colunas`);
              headers.splice(0, headers.length, ...altHeaders);
            }
          }
        }
      }
      
      // Criar um resultado em formato ainda mais claro para o GPT
      let result = `## TABELA DE DADOS CSV ##\n\n`;
      result += `Nome do arquivo: ${csvFilenames ? csvFilenames[0] : 'Dados CSV'}\n`;
      result += `Total de linhas: ${lines.length - 1}\n`;
      result += `Total de colunas: ${headers.length}\n\n`;
      
      // Criar um cabeçalho de tabela separado por barras para melhor visualização
      result += `### COLUNAS ###\n`;
      result += `| ${headers.join(' | ')} |\n`;
      result += `| ${headers.map(() => '---').join(' | ')} |\n\n`;
      
      result += `### DADOS DA TABELA ###\n`;
      
      // Processar cada linha de dados (exceto cabeçalho)
      let processedLines = 0;
      let skippedLines = 0;
      const maxLinesToShow = Math.min(20, lines.length - 1); // Limitar a 20 linhas para não sobrecarregar
      
      for (let i = 1; i < lines.length && processedLines < maxLinesToShow; i++) {
        // Ignorar linhas vazias
        if (!lines[i].trim()) {
          skippedLines++;
          continue;
        }
        
        try {
          const values = lines[i].split(delimiter).map(value => {
            // Remover aspas e espaços extras
            return value.trim().replace(/^["']|["']$/g, '');
          });
          
          // Apresentar em formato de tabela Markdown para melhor visualização
          let linha = `| `;
          
          for (let j = 0; j < headers.length; j++) {
            const value = j < values.length ? values[j] : 'N/A';
            linha += `${value} | `;
          }
          
          result += linha + "\n";
          processedLines++;
        } catch (lineError) {
          console.error(`Erro ao processar linha ${i}:`, lineError);
          skippedLines++;
        }
      }
      
      // Adicionar observação sobre linhas não mostradas
      if (lines.length - 1 > maxLinesToShow) {
        result += `\n... e mais ${lines.length - 1 - maxLinesToShow} linhas adicionais não mostradas ...\n`;
      }
      
      // Adicionar informações de resumo e explicação para o GPT
      result += `\n### COMO USAR ESSES DADOS ###\n`;
      result += `Este é um conjunto de dados em formato CSV com ${lines.length - 1} registros e ${headers.length} colunas.\n`;
      result += `As colunas disponíveis são: ${headers.join(', ')}.\n\n`;
      result += `Você pode me perguntar sobre:\n`;
      result += `- Valores específicos em determinadas colunas\n`;
      result += `- Resumos ou estatísticas dos dados\n`;
      result += `- Relações entre diferentes colunas\n`;
      result += `- Explicações sobre o significado desses dados\n`;
      
      // Extrair e fornecer alguns valores de exemplo para referência
      result += `\n### EXEMPLOS DE VALORES ###\n`;
      for (let j = 0; j < Math.min(headers.length, 5); j++) {
        const colName = headers[j];
        result += `${colName}: `;
        
        // Coletar valores únicos desta coluna (até 5)
        const uniqueValues = new Set();
        let count = 0;
        
        for (let i = 1; i < lines.length && count < 5; i++) {
          try {
            if (lines[i] && lines[i].trim()) {
              const values = lines[i].split(delimiter);
              if (j < values.length) {
                const value = values[j].trim().replace(/^["']|["']$/g, '');
                if (value && !uniqueValues.has(value)) {
                  uniqueValues.add(value);
                  count++;
                }
              }
            }
          } catch (err) {}
        }
        
        result += Array.from(uniqueValues).join(', ');
        result += '\n';
      }
      
      console.log(`Processamento concluído: ${processedLines} linhas processadas, ${skippedLines} linhas ignoradas`);
      console.log(`Extraído ${result.length} caracteres do CSV formatado`);
      return result;
    } catch (parsingError) {
      console.error('Erro durante o parsing do CSV:', parsingError);
      // Retornar uma versão simplificada do CSV como texto bruto se o parsing falhar
      return `Não foi possível processar o CSV normalmente. Conteúdo bruto (primeiras 20 linhas):\n\n${lines.slice(0, 20).join('\n')}`;
    }
  } catch (error) {
    console.error('Erro ao processar arquivo CSV:', error);
    return `Erro no processamento do CSV: ${error.message}\n\nVerifique se o formato do arquivo está correto.`;
  }
}

module.exports = {
  extractPdfContent,
  processExcel,
  processCsv
}; 