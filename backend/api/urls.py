from django.urls import path
from . import views

urlpatterns = [
    # Test
    path('test/', views.test_api),
    
    # Auth
    path('auth/register/', views.register),
    path('auth/me/', views.me),
    path('auth/merge/', views.merge_cart),
    
    # Product Types & Config
    path('product-types/', views.product_type_list),
    path('product-types/<str:code>/', views.product_type_detail),
    path('config/<str:product_code>/', views.print_config),
    path('config/', views.print_config),  # default: prints
    
    # Projects
    path('projects/', views.project_list),
    path('projects/<uuid:project_id>/', views.project_detail),
    path('projects/<uuid:project_id>/checkout/', views.create_order_from_project),
    
    # Photos
    path('photos/upload/', views.photo_upload),
    path('photos/upload-multiple/', views.photos_upload_multiple),
    path('photos/<uuid:photo_id>/', views.photo_delete),
    
    # Orders
    path('orders/', views.order_list),
    path('orders/<int:order_id>/', views.order_detail),
    
    # Legacy
    path('products/', views.product_list),
]
