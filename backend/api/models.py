from django.contrib.auth.models import User
from django.db import models
import uuid


# ==================== PRODUCT TYPES ====================

class ProductType(models.Model):
    """Типы продуктов: фотопечать, фотокниги, календари, полароиды и т.д."""
    PRODUCT_TYPES = [
        ('prints', 'Фотопечать'),
        ('photobook', 'Фотокнига'),
        ('calendar', 'Календарь'),
        ('polaroid', 'Полароид'),
        ('canvas', 'Холст'),
        ('postcard', 'Открытка'),
        ('gift', 'Подарок'),
    ]
    
    code = models.CharField(max_length=50, unique=True)  # prints, photobook, etc.
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)  # CSS класс или emoji
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    
    class Meta:
        ordering = ['sort_order', 'name']
    
    def __str__(self):
        return self.name


# ==================== PRINT SIZES & PAPER ====================

class PrintSize(models.Model):
    """Размеры печати (10x15, 15x21 и т.д.)"""
    product_type = models.ForeignKey(ProductType, on_delete=models.CASCADE, related_name='sizes')
    code = models.CharField(max_length=20)  # 10x15, 15x21
    name = models.CharField(max_length=50)  # "10 × 15 см"
    width_cm = models.DecimalField(max_digits=5, decimal_places=1)
    height_cm = models.DecimalField(max_digits=5, decimal_places=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    
    class Meta:
        ordering = ['sort_order', 'width_cm']
        unique_together = ['product_type', 'code']
    
    def __str__(self):
        return f"{self.name} ({self.product_type.code})"


class PaperType(models.Model):
    """Типы бумаги"""
    product_type = models.ForeignKey(ProductType, on_delete=models.CASCADE, related_name='papers')
    code = models.CharField(max_length=50)  # glossy, matte, silk
    name = models.CharField(max_length=100)  # "Глянцевая"
    coefficient = models.DecimalField(max_digits=4, decimal_places=2, default=1.0)  # множитель цены
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    
    class Meta:
        ordering = ['sort_order', 'name']
        unique_together = ['product_type', 'code']
    
    def __str__(self):
        return f"{self.name} ({self.product_type.code})"


# ==================== PROJECTS ====================

class Project(models.Model):
    """Проекты пользователей (черновики)"""
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('ready', 'Готов к заказу'),
        ('ordered', 'Заказан'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects', null=True, blank=True)
    session_key = models.CharField(max_length=40, null=True, blank=True)
    
    product_type = models.ForeignKey(ProductType, on_delete=models.PROTECT)
    name = models.CharField(max_length=255, default='Новый проект')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    # Данные проекта (JSON) - специфичны для каждого типа продукта
    # Для печати: {photos: [{id, settings: {size, paper, quantity, crop...}}]}
    # Для фотокниги: {pages: [{layout, photos: [...]}], cover: {...}}
    data = models.JSONField(default=dict)
    
    # Превью проекта (первое фото или обложка)
    preview_url = models.URLField(blank=True, null=True)
    
    # Расчётная стоимость
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-updated_at']
    
    def __str__(self):
        return f"{self.name} ({self.product_type.code})"
    
    def get_short_id(self):
        """Короткий ID для отображения: B_309C89"""
        return f"{self.product_type.code[0].upper()}_{str(self.id)[:6].upper()}"


class Photo(models.Model):
    """Загруженные фото"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='photos', null=True, blank=True)
    session_key = models.CharField(max_length=40, null=True, blank=True)
    
    file = models.ImageField(upload_to='photos/%Y/%m/')
    original_name = models.CharField(max_length=255)
    width = models.IntegerField()
    height = models.IntegerField()
    file_size = models.IntegerField()  # в байтах
    
    # Может быть привязано к проекту или быть в галерее пользователя
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='photos')
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.original_name
    
    @property
    def orientation(self):
        if self.width > self.height:
            return 'landscape'
        elif self.height > self.width:
            return 'portrait'
        return 'square'


# ==================== ORDERS ====================

class Order(models.Model):
    """Заказы"""
    STATUS_CHOICES = [
        ('processing', 'В обработке'),
        ('accepted', 'Принят в работу'),
        ('ready', 'Готов'),
    ]
    
    # Номер заказа: PB-2026-00123
    order_number = models.CharField(max_length=20, unique=True, editable=False)
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders', null=True, blank=True)
    session_key = models.CharField(max_length=40, null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='processing')
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Данные доставки
    delivery_address = models.TextField(blank=True)
    delivery_method = models.CharField(max_length=50, blank=True)
    tracking_number = models.CharField(max_length=100, blank=True)
    
    # Контакты
    customer_name = models.CharField(max_length=255, blank=True)
    customer_email = models.EmailField(blank=True)
    customer_phone = models.CharField(max_length=20, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.order_number
    
    def save(self, *args, **kwargs):
        if not self.order_number:
            # Генерируем номер заказа
            from django.utils import timezone
            year = timezone.now().year
            last_order = Order.objects.filter(
                order_number__startswith=f'PB-{year}-'
            ).order_by('-order_number').first()
            
            if last_order:
                last_num = int(last_order.order_number.split('-')[-1])
                new_num = last_num + 1
            else:
                new_num = 1
            
            self.order_number = f'PB-{year}-{new_num:05d}'
        
        super().save(*args, **kwargs)


class OrderItem(models.Model):
    """Позиции заказа"""
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True)
    
    product_type = models.ForeignKey(ProductType, on_delete=models.PROTECT)
    description = models.CharField(max_length=500)  # "Фотопечать 10x15, 25 шт."
    
    # Полные данные на момент заказа (snapshot)
    options = models.JSONField(default=dict)
    
    quantity = models.IntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    
    def __str__(self):
        return f"{self.description} (Order {self.order.order_number})"
    
    def save(self, *args, **kwargs):
        self.total_price = self.unit_price * self.quantity
        super().save(*args, **kwargs)


# ==================== LEGACY (для обратной совместимости) ====================

class Product(models.Model):
    """Старая модель продуктов - оставляем для совместимости"""
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    base_price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.title