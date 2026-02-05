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
    readonly_fields = ['product_type', 'description', 'quantity', 'unit_price', 'total_price']


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
    list_display = ['order_number', 'user', 'status', 'total_price', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['order_number', 'user__username', 'customer_email']
    readonly_fields = ['order_number', 'created_at', 'updated_at']
    inlines = [OrderItemInline]
    
    fieldsets = (
        (None, {
            'fields': ('order_number', 'status', 'total_price')
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
