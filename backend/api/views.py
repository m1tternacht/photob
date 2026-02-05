from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.db.models import Q
from decimal import Decimal
from PIL import Image
import os

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


# ==================== HELPERS ====================

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
    """Загрузка фото"""
    filters = get_user_or_session(request)
    
    file = request.FILES.get('file')
    project_id = request.data.get('project_id')
    
    if not file:
        return Response({'detail': 'No file provided'}, status=400)
    
    # Получаем размеры изображения
    try:
        img = Image.open(file)
        width, height = img.size
        file.seek(0)  # Сбрасываем позицию после чтения
    except Exception as e:
        return Response({'detail': f'Invalid image: {str(e)}'}, status=400)
    
    # Создаём запись
    photo = Photo.objects.create(
        file=file,
        original_name=file.name,
        width=width,
        height=height,
        file_size=file.size,
        **filters
    )
    
    # Привязываем к проекту если указан
    if project_id:
        try:
            project = Project.objects.get(id=project_id, **filters)
            photo.project = project
            photo.save()
        except Project.DoesNotExist:
            pass
    
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


@api_view(['POST'])
def create_order_from_project(request, project_id):
    """Создание заказа из проекта"""
    filters = get_user_or_session(request)
    project = get_object_or_404(Project, id=project_id, **filters)
    
    # Создаём заказ
    order = Order.objects.create(
        user=request.user if request.user.is_authenticated else None,
        session_key=request.session.session_key if not request.user.is_authenticated else None,
        total_price=project.total_price
    )
    
    # Создаём позицию заказа
    # Формируем описание
    photos_data = project.data.get('photos', [])
    total_photos = sum(p.get('settings', {}).get('quantity', 1) for p in photos_data)
    
    # Собираем размеры
    sizes = {}
    for p in photos_data:
        size = p.get('settings', {}).get('size', '10x15')
        qty = p.get('settings', {}).get('quantity', 1)
        sizes[size] = sizes.get(size, 0) + qty
    
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
    
    # Обновляем статус проекта
    project.status = 'ordered'
    project.save()
    
    return Response(OrderDetailSerializer(order).data, status=status.HTTP_201_CREATED)


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
