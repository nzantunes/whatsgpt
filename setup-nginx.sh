#!/bin/bash

# Instalar Nginx se não estiver instalado
if ! command -v nginx &> /dev/null; then
    echo "Instalando Nginx..."
    sudo apt-get update
    sudo apt-get install -y nginx
fi

# Criar configuração do site
echo "Configurando Nginx para whatsgpt.tech..."
sudo tee /etc/nginx/sites-available/whatsgpt << EOF
server {
    listen 80;
    server_name whatsgpt.tech www.whatsgpt.tech;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        
        # Aumentar timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Criar link simbólico
sudo ln -sf /etc/nginx/sites-available/whatsgpt /etc/nginx/sites-enabled/

# Remover configuração padrão
sudo rm -f /etc/nginx/sites-enabled/default

# Testar configuração do Nginx
echo "Testando configuração do Nginx..."
sudo nginx -t

# Reiniciar Nginx
echo "Reiniciando Nginx..."
sudo systemctl restart nginx

# Verificar status do Nginx
echo "Status do Nginx:"
sudo systemctl status nginx

# Verificar portas em uso
echo "Portas em uso:"
sudo netstat -tulpn | grep -E ':80|:3000'

# Verificar logs do Nginx
echo "Últimas linhas do log de erro do Nginx:"
sudo tail -n 20 /var/log/nginx/error.log 