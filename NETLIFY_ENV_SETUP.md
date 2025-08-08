# 🔧 Настройка переменных окружения в Netlify

## 📋 Переменные, которые нужно добавить в Netlify:

### 1. Перейдите в Netlify Dashboard:
- Откройте ваш сайт в Netlify
- Перейдите в **Site settings** → **Environment variables**

### 2. Добавьте следующие переменные:

```
NODE_ENV=production
NEXT_PUBLIC_CHAIN_ID=33139
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x... (ваш адрес NFT контракта)
NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS=0x... (ваш адрес CRAA токена)
NEXT_PUBLIC_GAME_PROXY_ADDRESS=0x... (ваш адрес игрового прокси)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# Alchemy API Keys (5 ключей для ротации)
NEXT_PUBLIC_ALCHEMY_API_KEY_1=your_alchemy_api_key_1
NEXT_PUBLIC_ALCHEMY_API_KEY_2=your_alchemy_api_key_2
NEXT_PUBLIC_ALCHEMY_API_KEY_3=your_alchemy_api_key_3
NEXT_PUBLIC_ALCHEMY_API_KEY_4=your_alchemy_api_key_4
NEXT_PUBLIC_ALCHEMY_API_KEY_5=your_alchemy_api_key_5

# Security settings
NEXT_PUBLIC_ENABLE_SECURITY=true
NEXT_PUBLIC_ENABLE_CSP=true
NEXT_PUBLIC_ENABLE_DDOS_PROTECTION=true
```

### 3. После добавления переменных:
- Нажмите **Save**
- Перейдите в **Deploys**
- Нажмите **Trigger deploy** → **Deploy site**

## 🔍 Проверка после деплоя:

### ✅ Что должно работать:
- ✅ Сайт загружается без CSP ошибок
- ✅ Кошелек подключается
- ✅ Все функции работают
- ✅ Нет ошибок в консоли

### ❌ Если есть проблемы:
1. Проверьте, что все адреса контрактов правильные
2. Убедитесь, что WalletConnect Project ID настроен
3. Проверьте логи в Netlify Dashboard

## 🔄 Система ротации Alchemy ключей:

### Как это работает:
- ✅ **5 ключей** для автоматической ротации
- ✅ **Умная система** - если ключ не работает, автоматически переключается на следующий
- ✅ **Fallback система** - если все Alchemy ключи не работают, переключается на публичные RPC
- ✅ **Автоматическое восстановление** - каждые 3 минуты проверяет и восстанавливает ключи

### Преимущества:
- 🚀 **Высокая надежность** - всегда есть рабочий ключ
- ⚡ **Автоматическая ротация** - равномерное распределение нагрузки
- 🛡️ **Отказоустойчивость** - если один ключ сломался, другие продолжают работать

## 🛡️ Безопасность:
- CSP заголовки исправлены
- DDoS защита активна
- CSRF защита работает
- XSS защита включена

**После настройки переменных сайт должен работать корректно! 🎉** 