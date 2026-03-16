from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import api.models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_alter_photo_file'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Gallery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('folder_name', models.CharField(max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='galleries', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('user', 'folder_name')},
            },
        ),
        migrations.CreateModel(
            name='GalleryPhoto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.ImageField(upload_to=api.models.gallery_photo_upload_path)),
                ('original_name', models.CharField(max_length=255)),
                ('width', models.IntegerField(default=0)),
                ('height', models.IntegerField(default=0)),
                ('file_size', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('gallery', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='gallery_photos', to='api.gallery')),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
        migrations.AddField(
            model_name='gallery',
            name='cover_photo',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='api.galleryphoto'),
        ),
    ]
