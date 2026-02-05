from rest_framework import serializers
from .models import (
    Product, ProductType, PrintSize, PaperType,
    Project, Photo, Order, OrderItem
)


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = '__all__'


# ==================== CONFIG SERIALIZERS ====================

class PrintSizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintSize
        fields = ['id', 'code', 'name', 'width_cm', 'height_cm', 'price', 'sort_order']


class PaperTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaperType
        fields = ['id', 'code', 'name', 'coefficient', 'sort_order']


class ProductTypeSerializer(serializers.ModelSerializer):
    sizes = PrintSizeSerializer(many=True, read_only=True)
    papers = PaperTypeSerializer(many=True, read_only=True)
    
    class Meta:
        model = ProductType
        fields = ['id', 'code', 'name', 'description', 'icon', 'sizes', 'papers']


class ProductTypeListSerializer(serializers.ModelSerializer):
    """Краткий сериализатор для списков"""
    class Meta:
        model = ProductType
        fields = ['id', 'code', 'name', 'icon']


# ==================== PHOTO SERIALIZERS ====================

class PhotoSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    orientation = serializers.ReadOnlyField()
    
    class Meta:
        model = Photo
        fields = ['id', 'url', 'original_name', 'width', 'height', 'file_size', 'orientation', 'created_at']
    
    def get_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class PhotoUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = ['file', 'original_name']


# ==================== PROJECT SERIALIZERS ====================

class ProjectListSerializer(serializers.ModelSerializer):
    """Для списка проектов"""
    product_type_name = serializers.CharField(source='product_type.name', read_only=True)
    product_type_code = serializers.CharField(source='product_type.code', read_only=True)
    short_id = serializers.CharField(source='get_short_id', read_only=True)
    photos_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = [
            'id', 'short_id', 'name', 'status', 
            'product_type_code', 'product_type_name',
            'data', 'preview_url', 'total_price', 'photos_count',
            'created_at', 'updated_at'
        ]
    
    def get_photos_count(self, obj):
        # Считаем из JSON data
        if obj.data and 'photos' in obj.data:
            return len(obj.data['photos'])
        return obj.photos.count()


class ProjectDetailSerializer(serializers.ModelSerializer):
    """Полные данные проекта"""
    product_type = ProductTypeSerializer(read_only=True)
    product_type_id = serializers.PrimaryKeyRelatedField(
        queryset=ProductType.objects.all(),
        source='product_type',
        write_only=True
    )
    photos = PhotoSerializer(many=True, read_only=True)
    short_id = serializers.CharField(source='get_short_id', read_only=True)
    
    class Meta:
        model = Project
        fields = [
            'id', 'short_id', 'name', 'status',
            'product_type', 'product_type_id',
            'data', 'preview_url', 'total_price',
            'photos', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ProjectCreateSerializer(serializers.ModelSerializer):
    """Для создания проекта"""
    class Meta:
        model = Project
        fields = ['name', 'product_type', 'data', 'total_price']


class ProjectUpdateSerializer(serializers.ModelSerializer):
    """Для обновления проекта"""
    class Meta:
        model = Project
        fields = ['name', 'status', 'data', 'preview_url', 'total_price']


# ==================== ORDER SERIALIZERS ====================

class OrderItemSerializer(serializers.ModelSerializer):
    product_type_name = serializers.CharField(source='product_type.name', read_only=True)
    
    class Meta:
        model = OrderItem
        fields = [
            'id', 'product_type', 'product_type_name',
            'description', 'options', 'quantity',
            'unit_price', 'total_price'
        ]


class OrderListSerializer(serializers.ModelSerializer):
    """Для списка заказов"""
    items_count = serializers.SerializerMethodField()
    items_summary = serializers.SerializerMethodField()
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'total_price',
            'items_count', 'items_summary',
            'created_at', 'updated_at'
        ]
    
    def get_items_count(self, obj):
        return obj.items.count()
    
    def get_items_summary(self, obj):
        items = obj.items.all()[:3]
        return [item.description for item in items]


class OrderDetailSerializer(serializers.ModelSerializer):
    """Полные данные заказа"""
    items = OrderItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'total_price',
            'delivery_address', 'delivery_method', 'tracking_number',
            'customer_name', 'customer_email', 'customer_phone',
            'items', 'created_at', 'updated_at', 'paid_at'
        ]
