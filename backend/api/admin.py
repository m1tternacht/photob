from django.contrib import admin
from .models import (
    ProductType, PrintSize, PaperType,
    Project, Photo, Order, OrderItem, Product
)


# ==================== INLINE ADMINS ====================

class PrintSizeInline(admin.TabularInline):
    model = PrintSize
    extra = 1
    fields = ['code', 'name', 'width_cm', 'height_cm', 'price', 'is_active', 'sort_order']


class PaperTypeInline(admin.TabularInline):
    model = PaperType
    extra = 1
    fields = ['code', 'name', 'coefficient', 'is_active', 'sort_order']


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ['project_short_id', 'product_type', 'description', 'quantity', 'unit_price', 'total_price']
    fields = ['project_short_id', 'product_type', 'description', 'quantity', 'unit_price', 'total_price']
    
    def project_short_id(self, obj):
        if obj.project:
            return obj.project.get_short_id()
        return '-'
    project_short_id.short_description = 'ID проекта'


class PhotoInline(admin.TabularInline):
    model = Photo
    extra = 0
    readonly_fields = ['original_name', 'width', 'height', 'file_size', 'created_at']
    fields = ['original_name', 'width', 'height', 'file_size', 'created_at']


# ==================== PRODUCT TYPE ====================

@admin.register(ProductType)
class ProductTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'is_active', 'sort_order']
    list_editable = ['is_active', 'sort_order']
    search_fields = ['name', 'code']
    inlines = [PrintSizeInline, PaperTypeInline]


# ==================== PRINT SIZE ====================

@admin.register(PrintSize)
class PrintSizeAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'product_type', 'price', 'is_active', 'sort_order']
    list_editable = ['price', 'is_active', 'sort_order']
    list_filter = ['product_type', 'is_active']
    search_fields = ['name', 'code']


# ==================== PAPER TYPE ====================

@admin.register(PaperType)
class PaperTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'product_type', 'coefficient', 'is_active', 'sort_order']
    list_editable = ['coefficient', 'is_active', 'sort_order']
    list_filter = ['product_type', 'is_active']
    search_fields = ['name', 'code']


# ==================== PROJECT ====================

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'get_short_id', 'product_type', 'user', 'status', 'total_price', 'updated_at']
    list_filter = ['product_type', 'status', 'created_at']
    search_fields = ['name', 'user__username']
    readonly_fields = ['id', 'created_at', 'updated_at']
    inlines = [PhotoInline]
    
    fieldsets = (
        (None, {
            'fields': ('id', 'name', 'product_type', 'status')
        }),
        ('Владелец', {
            'fields': ('user', 'session_key')
        }),
        ('Данные', {
            'fields': ('data', 'preview_url', 'total_price'),
            'classes': ('collapse',)
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at')
        }),
    )


# ==================== PHOTO ====================

@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ['original_name', 'project', 'user', 'width', 'height', 'created_at']
    list_filter = ['created_at']
    search_fields = ['original_name', 'user__username']
    readonly_fields = ['id', 'width', 'height', 'file_size', 'created_at']


# ==================== ORDER ====================

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['order_number', 'user', 'get_projects_ids', 'status', 'total_price', 'created_at', 'download_button']
    list_filter = ['status', 'created_at']
    search_fields = ['order_number', 'user__username', 'customer_email']
    readonly_fields = ['order_number', 'created_at', 'updated_at', 'download_link']
    inlines = [OrderItemInline]
    
    def get_projects_ids(self, obj):
        """Получить короткие ID всех проектов в заказе"""
        items = obj.items.select_related('project').all()
        ids = []
        for item in items:
            if item.project:
                ids.append(item.project.get_short_id())
        return ', '.join(ids) if ids else '-'
    get_projects_ids.short_description = 'Проекты'
    
    def download_button(self, obj):
        """Кнопка скачивания в списке"""
        from django.utils.html import format_html
        return format_html(
            '<a href="/api/orders/{}/download/" target="_blank" title="Скачать архив">📦</a>',
            obj.pk
        )
    download_button.short_description = '📦'
    
    def download_link(self, obj):
        """Ссылка на скачивание архива в детальной странице"""
        from django.utils.html import format_html
        if obj.pk:
            return format_html(
                '<a class="button" href="/api/orders/{}/download/" target="_blank" '
                'style="padding: 10px 20px; background: #417690; color: white; '
                'text-decoration: none; border-radius: 4px;">'
                '📦 Скачать архив с фото</a>',
                obj.pk
            )
        return '-'
    download_link.short_description = 'Скачать фото'
    
    fieldsets = (
        (None, {
            'fields': ('order_number', 'status', 'total_price', 'download_link')
        }),
        ('Владелец', {
            'fields': ('user', 'session_key')
        }),
        ('Доставка', {
            'fields': ('delivery_method', 'delivery_address', 'tracking_number')
        }),
        ('Контакты', {
            'fields': ('customer_name', 'customer_email', 'customer_phone')
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at', 'paid_at')
        }),
    )


# ==================== ORDER ITEM ====================

@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ['order', 'product_type', 'description', 'quantity', 'total_price']
    list_filter = ['product_type', 'order__status']
    search_fields = ['order__order_number', 'description']


# ==================== LEGACY ====================

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['title', 'slug', 'base_price', 'is_active']
    list_editable = ['is_active', 'base_price']
