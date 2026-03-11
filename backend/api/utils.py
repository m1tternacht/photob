# api/utils.py
# Утилиты для обработки изображений

import os
import io
import zipfile
from PIL import Image
from django.conf import settings
from django.core.files.base import ContentFile
from datetime import datetime

# Попытка импорта pillow-heif для HEIC
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIF_SUPPORT = True
except ImportError:
    HEIF_SUPPORT = False
    print("Warning: pillow-heif not installed. HEIC support disabled.")


def process_image_for_print(image_file, settings_data=None, target_dpi=300):
    """
    Обрабатывает изображение для печати:
    - Конвертирует HEIC/TIFF/другие форматы в JPEG
    - Применяет кроп и зум если указаны в settings
    - Устанавливает DPI 300
    
    Args:
        image_file: Django UploadedFile или путь к файлу
        settings_data: dict с настройками {crop: {x, y, width, height, zoom}, rotation, ...}
        target_dpi: целевое DPI (по умолчанию 300)
    
    Returns:
        tuple: (processed_image_bytes, width, height, filename)
    """
    # Открываем изображение
    if hasattr(image_file, 'read'):
        img = Image.open(image_file)
    else:
        img = Image.open(image_file)
    
    # Конвертируем в RGB (для JPEG)
    if img.mode in ('RGBA', 'LA', 'P'):
        # Создаём белый фон для прозрачных изображений
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Применяем поворот если указан
    if settings_data and settings_data.get('rotation'):
        rotation = settings_data['rotation']
        if rotation == 90:
            img = img.transpose(Image.ROTATE_270)
        elif rotation == 180:
            img = img.transpose(Image.ROTATE_180)
        elif rotation == 270:
            img = img.transpose(Image.ROTATE_90)
    
    # Применяем кроп если указан
    if settings_data and settings_data.get('crop'):
        crop = settings_data['crop']
        
        # crop содержит проценты от изображения
        img_width, img_height = img.size
        
        # Если есть zoom, сначала масштабируем
        zoom = crop.get('zoom', 1.0)
        if zoom != 1.0:
            new_width = int(img_width * zoom)
            new_height = int(img_height * zoom)
            img = img.resize((new_width, new_height), Image.LANCZOS)
            img_width, img_height = img.size
        
        # Вычисляем координаты кропа
        # crop.x и crop.y - это смещение от центра (или от левого верхнего угла)
        crop_x = crop.get('x', 0)
        crop_y = crop.get('y', 0)
        crop_width = crop.get('width', img_width)
        crop_height = crop.get('height', img_height)
        
        # Если координаты в процентах (0-1)
        if isinstance(crop_x, float) and crop_x <= 1:
            crop_x = int(crop_x * img_width)
        if isinstance(crop_y, float) and crop_y <= 1:
            crop_y = int(crop_y * img_height)
        if isinstance(crop_width, float) and crop_width <= 1:
            crop_width = int(crop_width * img_width)
        if isinstance(crop_height, float) and crop_height <= 1:
            crop_height = int(crop_height * img_height)
        
        # Обрезаем
        left = max(0, crop_x)
        top = max(0, crop_y)
        right = min(img_width, crop_x + crop_width)
        bottom = min(img_height, crop_y + crop_height)
        
        if right > left and bottom > top:
            img = img.crop((left, top, right, bottom))
    
    # Получаем финальные размеры
    final_width, final_height = img.size
    
    # Сохраняем в JPEG с DPI 300
    output = io.BytesIO()
    img.save(output, format='JPEG', quality=95, dpi=(target_dpi, target_dpi))
    output.seek(0)
    
    return output.getvalue(), final_width, final_height


def get_order_photo_path(order_number, product_type_code, filename):
    """
    Генерирует путь для сохранения фото заказа:
    prints/2026/03/11/PB-2026-00001/photo.jpg
    
    Args:
        order_number: номер заказа (PB-2026-00001)
        product_type_code: код типа продукта (prints, polaroid, canvas)
        filename: имя файла
    
    Returns:
        str: путь для сохранения
    """
    now = datetime.now()
    
    # Определяем папку по типу продукта
    type_folders = {
        'prints': 'prints',
        'polaroid': 'polaroid',
        'canvas': 'canvas',
        'photobook': 'photobooks',
        'calendar': 'calendars',
        'postcard': 'postcards',
        'gift': 'gifts',
    }
    
    type_folder = type_folders.get(product_type_code, 'other')
    
    # Формируем путь: type/year/month/day/order_number/
    path = os.path.join(
        'orders',
        type_folder,
        str(now.year),
        f'{now.month:02d}',
        f'{now.day:02d}',
        order_number,
        filename
    )
    
    return path


def process_and_save_order_photos(order):
    """
    Обрабатывает все фото заказа и сохраняет в папку заказа.
    
    Args:
        order: Order object
    
    Returns:
        list: список путей к обработанным фото
    """
    from .models import Photo, OrderItem
    
    processed_paths = []
    
    for item in order.items.all():
        if not item.project:
            continue
        
        project = item.project
        photos_data = project.data.get('photos', [])
        
        for i, photo_data in enumerate(photos_data):
            settings = photo_data.get('settings', {})
            quantity = settings.get('quantity', 1)
            
            # Получаем оригинальное фото
            photo_url = photo_data.get('url', '')
            
            # Если это серверный URL - получаем файл
            if photo_url.startswith('http'):
                # Извлекаем путь из URL
                if '/media/' in photo_url:
                    relative_path = photo_url.split('/media/')[-1]
                    file_path = os.path.join(settings.MEDIA_ROOT, relative_path)
                    
                    if os.path.exists(file_path):
                        # Обрабатываем изображение
                        processed_bytes, width, height = process_image_for_print(
                            file_path, 
                            settings
                        )
                        
                        # Генерируем имя файла
                        size_str = settings.get('size', '10x15').replace('.', '_')
                        base_name = os.path.splitext(photo_data.get('name', f'photo_{i}'))[0]
                        filename = f"{base_name}_{size_str}_x{quantity}.jpg"
                        
                        # Путь для сохранения
                        save_path = get_order_photo_path(
                            order.order_number,
                            project.product_type.code,
                            filename
                        )
                        
                        # Полный путь
                        full_path = os.path.join(settings.MEDIA_ROOT, save_path)
                        
                        # Создаём директории
                        os.makedirs(os.path.dirname(full_path), exist_ok=True)
                        
                        # Сохраняем
                        with open(full_path, 'wb') as f:
                            f.write(processed_bytes)
                        
                        processed_paths.append(save_path)
    
    return processed_paths


def create_order_zip(order):
    """
    Создаёт ZIP архив со всеми фото заказа.
    
    Args:
        order: Order object
    
    Returns:
        bytes: содержимое ZIP файла
    """
    from .models import OrderItem
    
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for item in order.items.all():
            if not item.project:
                continue
            
            project = item.project
            photos_data = project.data.get('photos', [])
            
            for i, photo_data in enumerate(photos_data):
                photo_settings = photo_data.get('settings', {})
                photo_url = photo_data.get('url', '')
                
                if photo_url.startswith('http') and '/media/' in photo_url:
                    relative_path = photo_url.split('/media/')[-1]
                    file_path = os.path.join(settings.MEDIA_ROOT, relative_path)
                    
                    if os.path.exists(file_path):
                        # Обрабатываем фото
                        processed_bytes, _, _ = process_image_for_print(
                            file_path,
                            photo_settings
                        )
                        
                        # Имя файла в архиве
                        size_str = photo_settings.get('size', '10x15')
                        quantity = photo_settings.get('quantity', 1)
                        base_name = os.path.splitext(photo_data.get('name', f'photo_{i}'))[0]
                        zip_filename = f"{base_name}_{size_str}_x{quantity}.jpg"
                        
                        # Добавляем в архив
                        zip_file.writestr(zip_filename, processed_bytes)
    
    zip_buffer.seek(0)
    return zip_buffer.getvalue()


def convert_heic_to_jpeg(file_path_or_bytes):
    """
    Конвертирует HEIC в JPEG.
    
    Args:
        file_path_or_bytes: путь к файлу или bytes
    
    Returns:
        bytes: JPEG данные
    """
    if not HEIF_SUPPORT:
        raise Exception("HEIC support not available. Install pillow-heif.")
    
    if isinstance(file_path_or_bytes, bytes):
        img = Image.open(io.BytesIO(file_path_or_bytes))
    else:
        img = Image.open(file_path_or_bytes)
    
    # Конвертируем в RGB
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    output = io.BytesIO()
    img.save(output, format='JPEG', quality=95)
    output.seek(0)
    
    return output.getvalue()
