# Настройка HTTPS для CryptoChatix

## ⚠️ Важно!

**Web Crypto API требует HTTPS!** Приложение не будет работать на обычном HTTP (кроме localhost), потому что браузеры блокируют доступ к криптографическим функциям в небезопасном контексте.

## Вариант 1: Nginx + Let's Encrypt (рекомендуется)

### Требования:
- Доменное имя (например, `chat.example.com`)
- Сервер с Ubuntu/Debian

### Шаги:

#### 1. Установить Nginx и Certbot

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

#### 2. Настроить DNS

Добавь A-запись для своего домена:
```
chat.example.com -> 77.105.128.50
```

#### 3. Скопировать конфигурацию Nginx

```bash
# Скопировать конфигурацию
sudo cp nginx.conf /etc/nginx/sites-available/cryptochatix

# Заменить your-domain.com на свой домен
sudo nano /etc/nginx/sites-available/cryptochatix

# Создать симлинк
sudo ln -s /etc/nginx/sites-available/cryptochatix /etc/nginx/sites-enabled/

# Удалить дефолтную конфигурацию
sudo rm /etc/nginx/sites-enabled/default

# Проверить конфигурацию
sudo nginx -t
```

#### 4. Получить SSL сертификат

```bash
# Получить сертификат от Let's Encrypt
sudo certbot --nginx -d chat.example.com

# Следовать инструкциям:
# - Ввести email
# - Согласиться с ToS
# - Выбрать редирект с HTTP на HTTPS (рекомендуется)
```

#### 5. Перезапустить Nginx

```bash
sudo systemctl restart nginx
```

#### 6. Запустить приложение

```bash
cd /path/to/CryptoChatix
docker-compose up -d
```

#### 7. Открыть в браузере

```
https://chat.example.com
```

### Автообновление сертификата

Certbot автоматически настроит cron job для обновления сертификата. Проверить:

```bash
sudo certbot renew --dry-run
```

## Вариант 2: Cloudflare Tunnel (самый простой)

Если у тебя есть домен в Cloudflare:

### Шаги:

#### 1. Установить cloudflared

```bash
# Скачать cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

#### 2. Аутентифицироваться

```bash
cloudflared tunnel login
```

#### 3. Создать туннель

```bash
# Создать туннель
cloudflared tunnel create cryptochatix

# Создать конфигурацию
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <TUNNEL-ID>
credentials-file: /home/user/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: chat.example.com
    service: http://localhost:5000
  - service: http_status:404
EOF

# Настроить DNS
cloudflared tunnel route dns cryptochatix chat.example.com

# Запустить туннель
cloudflared tunnel run cryptochatix
```

#### 4. Запустить как сервис

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

## Вариант 3: Самоподписанный сертификат (только для тестирования)

⚠️ **Браузеры будут показывать предупреждение о безопасности!**

### Шаги:

#### 1. Создать сертификат

```bash
# Создать директорию
mkdir -p /path/to/CryptoChatix/certs
cd /path/to/CryptoChatix/certs

# Создать приватный ключ и сертификат
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=CryptoChatix/OU=Dev/CN=77.105.128.50"
```

#### 2. Обновить docker-compose.yml

```yaml
services:
  cryptochatix:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "443:443"
      - "5000:5000"
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=https://+:443;http://+:5000
      - ASPNETCORE_Kestrel__Certificates__Default__Path=/app/certs/cert.pem
      - ASPNETCORE_Kestrel__Certificates__Default__KeyPath=/app/certs/key.pem
    volumes:
      - passwords-data:/app/passwords
      - ./certs:/app/certs
    restart: unless-stopped
```

#### 3. Перезапустить Docker

```bash
docker-compose down
docker-compose up -d --build
```

#### 4. Открыть в браузере

```
https://77.105.128.50
```

Браузер покажет предупреждение - нажать "Advanced" -> "Proceed anyway"

## Рекомендации

1. **Лучший вариант**: Nginx + Let's Encrypt с доменом
2. **Самый простой**: Cloudflare Tunnel
3. **Только для теста**: Самоподписанный сертификат

## Troubleshooting

### Ошибка: Cannot read properties of undefined (reading 'generateKey')

Это значит, что используется HTTP вместо HTTPS. Web Crypto API недоступен.

**Решение**: Настроить HTTPS любым из способов выше.

### Certbot не может получить сертификат

- Проверь, что домен правильно настроен (A-запись указывает на IP сервера)
- Проверь, что порт 80 и 443 открыты в firewall
- Убедись, что другой веб-сервер не занимает порты 80/443
