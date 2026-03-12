from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.db.models import Q
from django.http import HttpResponse
from django.conf import settings as django_settings
from django.utils.text import slugify
from urllib.parse import unquote
from decimal import Decimal
from PIL import Image
import os
import io
import re

from .models import (
    Product, ProductType, PrintSize, PaperType,
    Project, Photo, Order, OrderItem
)
from .serializers import (
    ProductSerializer, ProductTypeSerializer, ProductTypeListSerializer,
    PrintSizeSerializer, PaperTypeSerializer,
    ProjectListSerializer, ProjectDetailSerializer, 
    ProjectCreateSerializer, ProjectUpdateSerializer,
    PhotoSerializer,
    OrderListSerializer, OrderDetailSerializer, OrderItemSerializer
)

# Попытка импорта pillow-heif для HEIC
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIF_SUPPORT = True
except ImportError:
    HEIF_SUPPORT = False


# ==================== HELPERS ====================


def get_print_size_pixels(size_str, dpi=300):
    """
    Конвертирует размер печати в пиксели при заданном DPI.
    10x15 см при 300 DPI = 1181 x 1772 пикселей
    
    Args:
        size_str: строка размера, например "10x15" или "10.0x15.0"
        dpi: разрешение (по умолчанию 300)
    
    Returns:
        tuple: (width_px, height_px)
    """
    try:
        # Парсим размер
        size_str = size_str.replace(',', '.')
        parts = size_str.lower().split('x')
        width_cm = float(parts[0])
        height_cm = float(parts[1])
        
        # Конвертируем см в пиксели: pixels = cm / 2.54 * dpi
        width_px = int(round(width_cm / 2.54 * dpi))
        height_px = int(round(height_cm / 2.54 * dpi))
        
        return width_px, height_px
    except:
        # По умолчанию 10x15
        return 1181, 1772


def get_user_or_session(request):
    """Получить user или session_key для фильтрации"""
    if request.user.is_authenticated:
        return {'user': request.user}
    
    if not request.session.session_key:
        request.session.create()
    return {'session_key': request.session.session_key}


# ==================== TEST ====================

@api_view(['GET'])
def test_api(request):
    return Response({
        "status": "ok",
        "message": "Backend is working"
    })


# ==================== AUTH ====================

@api_view(['POST'])
def register(request):
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')

    if not username or not password:
        return Response({'detail': 'Missing fields'}, status=400)

    if User.objects.filter(username=username).exists():
        return Response({'detail': 'Username already exists'}, status=400)

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password
    )

    refresh = RefreshToken.for_user(user)

    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh)
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({
        'id': request.user.id,
        'username': request.user.username,
        'email': request.user.email
    })


# ==================== PRODUCT TYPES & CONFIG ====================

@api_view(['GET'])
def product_type_list(request):
    """Список типов продуктов"""
    types = ProductType.objects.filter(is_active=True)
    serializer = ProductTypeListSerializer(types, many=True)
    return Response(serializer.data)


@api_view(['GET'])
def product_type_detail(request, code):
    """Детали типа продукта с размерами и бумагой"""
    product_type = get_object_or_404(ProductType, code=code, is_active=True)
    serializer = ProductTypeSerializer(product_type)
    return Response(serializer.data)


@api_view(['GET'])
def print_config(request, product_code='prints'):
    """Конфиг для приложения печати (размеры, бумага, цены)"""
    product_type = get_object_or_404(ProductType, code=product_code, is_active=True)
    
    sizes = PrintSize.objects.filter(product_type=product_type, is_active=True)
    papers = PaperType.objects.filter(product_type=product_type, is_active=True)
    
    return Response({
        'product_type': {
            'id': product_type.id,
            'code': product_type.code,
            'name': product_type.name
        },
        'sizes': PrintSizeSerializer(sizes, many=True).data,
        'papers': PaperTypeSerializer(papers, many=True).data
    })


# ==================== PROJECTS ====================

@api_view(['GET', 'POST'])
def project_list(request):
    """Список проектов / Создание проекта"""
    filters = get_user_or_session(request)
    
    if request.method == 'GET':
        # Фильтры
        product_type = request.query_params.get('product_type')
        status_filter = request.query_params.get('status')
        
        projects = Project.objects.filter(**filters)
        
        if product_type:
            projects = projects.filter(product_type__code=product_type)
        if status_filter:
            projects = projects.filter(status=status_filter)
        
        serializer = ProjectListSerializer(projects, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = ProjectCreateSerializer(data=request.data)
        if serializer.is_valid():
            project = serializer.save(**filters)
            return Response(
                ProjectDetailSerializer(project, context={'request': request}).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
def project_detail(request, project_id):
    """Детали проекта / Обновление / Удаление"""
    filters = get_user_or_session(request)
    project = get_object_or_404(Project, id=project_id, **filters)
    
    if request.method == 'GET':
        serializer = ProjectDetailSerializer(project, context={'request': request})
        return Response(serializer.data)
    
    elif request.method == 'PUT':
        serializer = ProjectUpdateSerializer(project, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(ProjectDetailSerializer(project, context={'request': request}).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        # Удаляем связанные фото
        project.photos.all().delete()
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ==================== PHOTOS ====================

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def photo_upload(request):
    """Загрузка фото с автоконвертацией HEIC/TIFF в JPEG"""
    filters = get_user_or_session(request)
    
    file = request.FILES.get('file')
    project_id = request.data.get('project_id')
    
    if not file:
        return Response({'detail': 'No file provided'}, status=400)
    
    original_name = file.name
    
    # Получаем расширение
    ext = os.path.splitext(original_name)[1].lower()
    
    try:
        # Открываем изображение
        img = Image.open(file)
        width, height = img.size
        
        # Конвертируем в RGB если нужно (для JPEG)
        needs_conversion = ext in ['.heic', '.heif', '.tiff', '.tif', '.png', '.bmp', '.webp']
        
        if needs_conversion or img.mode not in ('RGB', 'L'):
            # Конвертируем в RGB
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                if img.mode in ('RGBA', 'LA'):
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Сохраняем как JPEG
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=95, dpi=(300, 300))
            output.seek(0)
            
            # Создаём новый файл
            from django.core.files.uploadedfile import InMemoryUploadedFile
            new_name = os.path.splitext(original_name)[0] + '.jpg'
            file = InMemoryUploadedFile(
                output, 'file', new_name, 'image/jpeg', output.getbuffer().nbytes, None
            )
            original_name = new_name
        else:
            file.seek(0)
        
    except Exception as e:
        return Response({'detail': f'Invalid image: {str(e)}'}, status=400)
    
    # Получаем проект если указан
    project = None
    if project_id:
        try:
            project = Project.objects.get(id=project_id, **filters)
        except Project.DoesNotExist:
            pass
    
    # Создаём запись (project передаём сразу, чтобы файл сохранился в правильную папку)
    photo = Photo.objects.create(
        file=file,
        original_name=original_name,
        width=width,
        height=height,
        file_size=file.size if hasattr(file, 'size') else len(file.read()),
        project=project,
        **filters
    )
    
    serializer = PhotoSerializer(photo, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def photos_upload_multiple(request):
    """Загрузка нескольких фото"""
    filters = get_user_or_session(request)
    
    files = request.FILES.getlist('files')
    project_id = request.data.get('project_id')
    
    if not files:
        return Response({'detail': 'No files provided'}, status=400)
    
    project = None
    if project_id:
        try:
            project = Project.objects.get(id=project_id, **filters)
        except Project.DoesNotExist:
            pass
    
    uploaded = []
    errors = []
    
    for file in files:
        try:
            img = Image.open(file)
            width, height = img.size
            file.seek(0)
            
            photo = Photo.objects.create(
                file=file,
                original_name=file.name,
                width=width,
                height=height,
                file_size=file.size,
                project=project,
                **filters
            )
            uploaded.append(PhotoSerializer(photo, context={'request': request}).data)
        except Exception as e:
            errors.append({'file': file.name, 'error': str(e)})
    
    return Response({
        'uploaded': uploaded,
        'errors': errors
    }, status=status.HTTP_201_CREATED if uploaded else status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
def photo_delete(request, photo_id):
    """Удаление фото"""
    filters = get_user_or_session(request)
    photo = get_object_or_404(Photo, id=photo_id, **filters)
    
    # Удаляем файл
    if photo.file:
        photo.file.delete()
    
    photo.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ==================== ORDERS ====================

@api_view(['GET'])
def order_list(request):
    """Список заказов пользователя"""
    if not request.user.is_authenticated:
        return Response({'detail': 'Authentication required'}, status=401)
    
    orders = Order.objects.filter(user=request.user)
    
    # Фильтры
    status_filter = request.query_params.get('status')
    if status_filter and status_filter != 'all':
        orders = orders.filter(status=status_filter)
    
    serializer = OrderListSerializer(orders, many=True)
    return Response(serializer.data)


@api_view(['GET'])
def order_detail(request, order_id):
    """Детали заказа"""
    if not request.user.is_authenticated:
        return Response({'detail': 'Authentication required'}, status=401)
    
    order = get_object_or_404(Order, id=order_id, user=request.user)
    serializer = OrderDetailSerializer(order)
    return Response(serializer.data)


def clean_size_string(size_str):
    """
    Очищает строку размера от .0
    '10.0x15.0' -> '10x15'
    '10,0x15,0' -> '10x15'
    """
    size_str = size_str.replace(',', '.')
    parts = size_str.split('x')
    clean_parts = []
    for p in parts:
        try:
            num = float(p)
            # Если целое число - убираем .0
            if num == int(num):
                clean_parts.append(str(int(num)))
            else:
                clean_parts.append(str(num))
        except:
            clean_parts.append(p)
    return 'x'.join(clean_parts)


@api_view(['POST'])
def create_order_from_project(request, project_id):
    """Создание заказа из проекта с обработкой фото"""
    import zipfile
    from datetime import datetime
    
    filters = get_user_or_session(request)
    project = get_object_or_404(Project, id=project_id, **filters)
    
    # Создаём заказ
    order = Order.objects.create(
        user=request.user if request.user.is_authenticated else None,
        session_key=request.session.session_key if not request.user.is_authenticated else None,
        total_price=project.total_price
    )
    
    # Создаём позицию заказа
    photos_data = project.data.get('photos', [])
    total_photos = sum(p.get('settings', {}).get('quantity', 1) for p in photos_data)
    
    # Собираем размеры (очищаем от .0)
    sizes = {}
    for p in photos_data:
        size = p.get('settings', {}).get('size', '10x15')
        size_clean = clean_size_string(size)
        qty = p.get('settings', {}).get('quantity', 1)
        sizes[size_clean] = sizes.get(size_clean, 0) + qty
    
    sizes_str = ', '.join([f"{size} ({qty} шт.)" for size, qty in sizes.items()])
    description = f"Фотопечать: {sizes_str}"
    
    OrderItem.objects.create(
        order=order,
        project=project,
        product_type=project.product_type,
        description=description,
        options=project.data,
        quantity=total_photos,
        unit_price=project.total_price / total_photos if total_photos > 0 else 0,
        total_price=project.total_price
    )
    
    # Обрабатываем и сохраняем фото в папку заказа
    process_order_photos(order, project)
    
    # Обновляем статус проекта
    project.status = 'ordered'
    project.save()
    
    return Response(OrderDetailSerializer(order).data, status=status.HTTP_201_CREATED)


def process_order_photos(order, project):
    """
    Обрабатывает фото проекта и сохраняет в папку заказа.
    - Применяет поворот, зум, кроп
    - Ресайзит до точного размера печати в пикселях (300 DPI)
    - Сохраняет как JPEG с именем: 001_10x15_x1.jpg
    """
    from datetime import datetime
    
    photos_data = project.data.get('photos', [])
    now = datetime.now()
    
    # Определяем папку по типу продукта
    type_folders = {
        'prints': 'prints',
        'polaroid': 'polaroid', 
        'canvas': 'canvas',
        'photobook': 'photobooks',
        'calendar': 'calendars',
    }
    type_folder = type_folders.get(project.product_type.code, 'other')
    
    # Базовая папка: orders/prints/2026/03/11/PB-2026-00001/
    base_path = os.path.join(
        django_settings.MEDIA_ROOT,
        'orders',
        type_folder,
        str(now.year),
        f'{now.month:02d}',
        f'{now.day:02d}',
        order.order_number
    )
    
    # Создаём директорию
    os.makedirs(base_path, exist_ok=True)
    
    processed_files = []
    
    for i, photo_data in enumerate(photos_data):
        photo_url = photo_data.get('url', '')
        photo_settings = photo_data.get('settings', {})
        
        # Получаем путь к оригинальному файлу
        if '/media/' in photo_url:
            relative_path = photo_url.split('/media/')[-1]
            # Декодируем URL-encoded символы (кириллица и т.д.)
            relative_path = unquote(relative_path)
            source_path = os.path.join(django_settings.MEDIA_ROOT, relative_path)
            
            print(f"Processing photo {i+1}: {photo_url}")
            print(f"  Source path: {source_path}")
            print(f"  Exists: {os.path.exists(source_path)}")
            
            if os.path.exists(source_path):
                try:
                    # Открываем изображение
                    img = Image.open(source_path)
                    
                    # Применяем поворот
                    rotation = photo_settings.get('rotation', 0)
                    if rotation == 90:
                        img = img.transpose(Image.ROTATE_270)
                    elif rotation == 180:
                        img = img.transpose(Image.ROTATE_180)
                    elif rotation == 270:
                        img = img.transpose(Image.ROTATE_90)
                    
                    # Получаем целевой размер в пикселях
                    size_str = photo_settings.get('size', '10x15')
                    target_w, target_h = get_print_size_pixels(size_str, dpi=300)
                    target_ratio = target_w / target_h
                    
                    # Применяем кроп если есть
                    crop = photo_settings.get('crop')
                    img_w, img_h = img.size
                    
                    if crop:
                        # Применяем зум (в JS это проценты: 100 = 1x)
                        zoom = crop.get('zoom', 100) / 100.0
                        if zoom != 1.0:
                            new_w = int(img_w * zoom)
                            new_h = int(img_h * zoom)
                            img = img.resize((new_w, new_h), Image.LANCZOS)
                            img_w, img_h = img.size
                        
                        # Координаты кропа (смещение от центра в пикселях)
                        cx = crop.get('x', 0)
                        cy = crop.get('y', 0)
                    else:
                        cx, cy = 0, 0
                    
                    # Вычисляем область кропа на основе соотношения сторон печати
                    img_ratio = img_w / img_h
                    
                    if img_ratio > target_ratio:
                        # Изображение шире - обрезаем по бокам
                        crop_h = img_h
                        crop_w = int(crop_h * target_ratio)
                    else:
                        # Изображение выше - обрезаем сверху/снизу
                        crop_w = img_w
                        crop_h = int(crop_w / target_ratio)
                    
                    # Центр + смещение
                    center_x = img_w // 2
                    center_y = img_h // 2
                    
                    left = max(0, center_x - crop_w // 2 + int(cx))
                    top = max(0, center_y - crop_h // 2 + int(cy))
                    right = min(img_w, left + crop_w)
                    bottom = min(img_h, top + crop_h)
                    
                    # Корректируем если вышли за границы
                    if right - left < crop_w:
                        if left == 0:
                            right = min(img_w, crop_w)
                        else:
                            left = max(0, right - crop_w)
                    if bottom - top < crop_h:
                        if top == 0:
                            bottom = min(img_h, crop_h)
                        else:
                            top = max(0, bottom - crop_h)
                    
                    if right > left and bottom > top:
                        img = img.crop((left, top, right, bottom))
                    
                    # Ресайзим до точного размера печати
                    img = img.resize((target_w, target_h), Image.LANCZOS)
                    
                    # Конвертируем в RGB
                    if img.mode in ('RGBA', 'LA', 'P'):
                        background = Image.new('RGB', img.size, (255, 255, 255))
                        if img.mode == 'P':
                            img = img.convert('RGBA')
                        if 'A' in img.mode:
                            background.paste(img, mask=img.split()[-1])
                        else:
                            background.paste(img)
                        img = background
                    elif img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    # Формируем имя файла: 001_10x15_x1.jpg
                    size_clean = clean_size_string(size_str)
                    quantity = photo_settings.get('quantity', 1)
                    filename = f"{i+1:03d}_{size_clean}_x{quantity}.jpg"
                    
                    # Сохраняем с DPI 300
                    output_path = os.path.join(base_path, filename)
                    img.save(output_path, 'JPEG', quality=95, dpi=(300, 300))
                    
                    processed_files.append(filename)
                    
                except Exception as e:
                    print(f"Error processing photo {i}: {e}")
    
    return processed_files


@api_view(['GET'])
def download_order_photos(request, order_id):
    """Скачивание всех фото заказа архивом с обработкой"""
    import zipfile
    from datetime import datetime
    
    # Проверяем права (админ с session auth или владелец с JWT)
    # Django admin использует session authentication
    if not request.user.is_authenticated:
        return Response({'detail': 'Authentication required'}, status=401)
    
    # Админ может скачать любой заказ, обычный пользователь - только свой
    if request.user.is_staff:
        order = get_object_or_404(Order, id=order_id)
    else:
        order = get_object_or_404(Order, id=order_id, user=request.user)
    
    # Ищем папку с обработанными фото
    for item in order.items.all():
        if not item.project:
            continue
        
        project = item.project
        photos_data = project.data.get('photos', [])
        
        if not photos_data:
            continue
        
        # Создаём ZIP архив в памяти
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            type_folders = {
                'prints': 'prints',
                'polaroid': 'polaroid',
                'canvas': 'canvas',
                'photobook': 'photobooks',
                'calendar': 'calendars',
            }
            type_folder = type_folders.get(project.product_type.code, 'other')
            
            # Пробуем найти папку заказа
            order_date = order.created_at
            base_path = os.path.join(
                django_settings.MEDIA_ROOT,
                'orders',
                type_folder,
                str(order_date.year),
                f'{order_date.month:02d}',
                f'{order_date.day:02d}',
                order.order_number
            )
            
            if os.path.exists(base_path):
                # Добавляем все файлы из папки заказа
                for filename in os.listdir(base_path):
                    file_path = os.path.join(base_path, filename)
                    if os.path.isfile(file_path):
                        zip_file.write(file_path, filename)
            else:
                # Если папки нет - обрабатываем фото на лету
                for i, photo_data in enumerate(photos_data):
                    photo_url = photo_data.get('url', '')
                    photo_settings = photo_data.get('settings', {})
                    
                    if '/media/' in photo_url:
                        relative_path = photo_url.split('/media/')[-1]
                        relative_path = unquote(relative_path)
                        source_path = os.path.join(django_settings.MEDIA_ROOT, relative_path)
                        
                        if os.path.exists(source_path):
                            try:
                                img = Image.open(source_path)
                                
                                # Применяем поворот
                                rotation = photo_settings.get('rotation', 0)
                                if rotation == 90:
                                    img = img.transpose(Image.ROTATE_270)
                                elif rotation == 180:
                                    img = img.transpose(Image.ROTATE_180)
                                elif rotation == 270:
                                    img = img.transpose(Image.ROTATE_90)
                                
                                # Получаем целевой размер
                                size_str = photo_settings.get('size', '10x15')
                                target_w, target_h = get_print_size_pixels(size_str, dpi=300)
                                target_ratio = target_w / target_h
                                
                                # Применяем кроп
                                img_w, img_h = img.size
                                crop = photo_settings.get('crop')
                                
                                if crop:
                                    zoom = crop.get('zoom', 100) / 100.0
                                    if zoom != 1.0:
                                        new_w = int(img_w * zoom)
                                        new_h = int(img_h * zoom)
                                        img = img.resize((new_w, new_h), Image.LANCZOS)
                                        img_w, img_h = img.size
                                    cx = crop.get('x', 0)
                                    cy = crop.get('y', 0)
                                else:
                                    cx, cy = 0, 0
                                
                                # Вычисляем область кропа
                                img_ratio = img_w / img_h
                                if img_ratio > target_ratio:
                                    crop_h = img_h
                                    crop_w = int(crop_h * target_ratio)
                                else:
                                    crop_w = img_w
                                    crop_h = int(crop_w / target_ratio)
                                
                                center_x = img_w // 2
                                center_y = img_h // 2
                                left = max(0, center_x - crop_w // 2 + int(cx))
                                top = max(0, center_y - crop_h // 2 + int(cy))
                                right = min(img_w, left + crop_w)
                                bottom = min(img_h, top + crop_h)
                                
                                if right > left and bottom > top:
                                    img = img.crop((left, top, right, bottom))
                                
                                # Ресайзим до точного размера
                                img = img.resize((target_w, target_h), Image.LANCZOS)
                                
                                # Конвертируем в RGB
                                if img.mode not in ('RGB',):
                                    if img.mode in ('RGBA', 'LA', 'P'):
                                        background = Image.new('RGB', img.size, (255, 255, 255))
                                        if img.mode == 'P':
                                            img = img.convert('RGBA')
                                        if 'A' in img.mode:
                                            background.paste(img, mask=img.split()[-1])
                                        else:
                                            background.paste(img)
                                        img = background
                                    else:
                                        img = img.convert('RGB')
                                
                                # Сохраняем в буфер
                                img_buffer = io.BytesIO()
                                img.save(img_buffer, 'JPEG', quality=95, dpi=(300, 300))
                                img_buffer.seek(0)
                                
                                # Имя файла: 001_10x15_x1.jpg
                                size_clean = clean_size_string(size_str)
                                quantity = photo_settings.get('quantity', 1)
                                filename = f"{i+1:03d}_{size_clean}_x{quantity}.jpg"
                                
                                zip_file.writestr(filename, img_buffer.getvalue())
                                
                            except Exception as e:
                                print(f"Error processing photo for zip: {e}")
        
        zip_buffer.seek(0)
        
        response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{order.order_number}.zip"'
        return response
    
    return Response({'detail': 'No photos found'}, status=404)


# ==================== LEGACY CART (для обратной совместимости) ====================

@api_view(['GET'])
def product_list(request):
    products = Product.objects.filter(is_active=True)
    serializer = ProductSerializer(products, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def merge_cart(request):
    """Объединение корзины сессии с корзиной пользователя"""
    if not request.session.session_key:
        request.session.create()

    session_key = request.session.session_key

    # Переносим проекты из сессии к пользователю
    Project.objects.filter(
        session_key=session_key,
        user__isnull=True
    ).update(user=request.user, session_key=None)
    
    # Переносим фото
    Photo.objects.filter(
        session_key=session_key,
        user__isnull=True
    ).update(user=request.user, session_key=None)

    return Response({'detail': 'Data merged'})
