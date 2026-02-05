# Photobond Backend

Django REST API для Photobond.

## Установка

```bash
cd backend
pip install django djangorestframework djangorestframework-simplejwt django-cors-headers pillow
```

## Первый запуск

```bash
# Применить миграции
python manage.py makemigrations
python manage.py migrate

# Загрузить начальные данные (размеры, бумага, типы продуктов)
python manage.py loaddata initial_data

# Создать суперпользователя для админки
python manage.py createsuperuser

# Запустить сервер
python manage.py runserver
```

## API Endpoints

### Auth
- `POST /api/auth/register/` - Регистрация
- `POST /api/auth/login/` - Вход (получение JWT токенов)
- `POST /api/auth/refresh/` - Обновление токена
- `GET /api/auth/me/` - Текущий пользователь
- `POST /api/auth/merge/` - Объединение данных сессии с пользователем

### Config
- `GET /api/product-types/` - Список типов продуктов
- `GET /api/product-types/{code}/` - Детали типа продукта с размерами и бумагой
- `GET /api/config/` - Конфиг для фотопечати (размеры, бумага, цены)
- `GET /api/config/{product_code}/` - Конфиг для конкретного продукта

### Projects
- `GET /api/projects/` - Список проектов
- `POST /api/projects/` - Создать проект
- `GET /api/projects/{id}/` - Детали проекта
- `PUT /api/projects/{id}/` - Обновить проект
- `DELETE /api/projects/{id}/` - Удалить проект
- `POST /api/projects/{id}/checkout/` - Создать заказ из проекта

### Photos
- `POST /api/photos/upload/` - Загрузить одно фото
- `POST /api/photos/upload-multiple/` - Загрузить несколько фото
- `DELETE /api/photos/{id}/` - Удалить фото

### Orders
- `GET /api/orders/` - Список заказов (требует авторизации)
- `GET /api/orders/{id}/` - Детали заказа

## Структура данных проекта (JSON)

### Фотопечать (prints)
```json
{
    "photos": [
        {
            "id": "uuid",
            "settings": {
                "size": "10x15",
                "paper": "glossy",
                "quantity": 2,
                "frame": "none",
                "frameSize": 3,
                "crop": {"x": 0, "y": 0, "zoom": 100},
                "rotation": 0,
                "filter": "original",
                "fullImage": false
            }
        }
    ]
}
```

### Фотокнига (photobook)
```json
{
    "cover": {
        "type": "hardcover",
        "color": "#ffffff"
    },
    "pages": [
        {
            "layout": "single",
            "photos": [{"id": "uuid", "position": {...}}]
        }
    ]
}
```

## Django Admin

Админка доступна по адресу `/admin/`

Можно управлять:
- Типами продуктов
- Размерами печати и ценами
- Типами бумаги и коэффициентами
- Проектами пользователей
- Заказами
