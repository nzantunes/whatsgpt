#!/bin/bash

# Criar diretório principal
sudo mkdir -p /var/www/whatsgpt

# Copiar arquivos do projeto
sudo cp -r ./* /var/www/whatsgpt/

# Criar link simbólico para o diretório public
sudo ln -s /var/www/whatsgpt/public /var/www/whatsgpt/whatsgpt/public

# Configurar permissões
sudo chown -R www-data:www-data /var/www/whatsgpt
sudo chmod -R 755 /var/www/whatsgpt

echo "Configuração dos diretórios concluída!" 