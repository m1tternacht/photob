// ==================== GALLERIES JS ====================

const API = 'http://127.0.0.1:8000/api';

let allGalleries = [];
let currentGallery = null;
let currentPhotos = [];
let lightboxIndex = 0;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    initGalleryPage();
});

function initGalleryPage() {
    document.getElementById('create-gallery-card').addEventListener('click', openCreateModal);
    document.getElementById('create-first-gallery')?.addEventListener('click', openCreateModal);

    document.getElementById('sort-galleries').addEventListener('change', renderGalleryList);

    document.getElementById('modal-close').addEventListener('click', closeCreateModal);
    document.getElementById('cancel-create').addEventListener('click', closeCreateModal);
    document.getElementById('btn-create-gallery').addEventListener('click', handleCreateGallery);
    document.getElementById('create-gallery-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('create-gallery-modal')) closeCreateModal();
    });

    initUploadArea();

    document.getElementById('back-to-galleries').addEventListener('click', showGalleryList);
    document.getElementById('btn-add-photos-detail').addEventListener('click', () => {
        document.getElementById('add-photos-input').click();
    });
    document.getElementById('btn-add-first-photo')?.addEventListener('click', () => {
        document.getElementById('add-photos-input').click();
    });
    document.getElementById('add-photos-input').addEventListener('change', handleAddPhotos);
    document.getElementById('btn-delete-gallery').addEventListener('click', handleDeleteGallery);

    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    document.getElementById('lightbox-prev').addEventListener('click', () => moveLightbox(-1));
    document.getElementById('lightbox-next').addEventListener('click', () => moveLightbox(1));
    document.getElementById('lightbox-delete').addEventListener('click', handleLightboxDelete);
    document.getElementById('lightbox').addEventListener('click', (e) => {
        if (e.target === document.getElementById('lightbox')) closeLightbox();
    });
    document.addEventListener('keydown', onKeydown);

    loadGalleries();
}

// ==================== API ====================

function authHeaders() {
    return { 'Authorization': 'Bearer ' + localStorage.getItem('access') };
}

async function loadGalleries() {
    showLoading(true);
    try {
        const res = await fetch(`${API}/galleries/`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Error ' + res.status);
        allGalleries = await res.json();
        renderGalleryList();
    } catch (e) {
        console.error('Load galleries error:', e);
        showToast('Не удалось загрузить галереи', 'error');
    } finally {
        showLoading(false);
    }
}

async function apiCreateGallery(name) {
    const res = await fetch(`${API}/galleries/`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Ошибка создания галереи');
    }
    return res.json();
}

async function apiUploadPhotos(galleryId, files, onProgress) {
    const uploaded = [];
    const errors = [];
    for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append('files', files[i]);
        try {
            const res = await fetch(`${API}/galleries/${galleryId}/photos/`, {
                method: 'POST',
                headers: authHeaders(),
                body: fd
            });
            const data = await res.json();
            if (data.uploaded) uploaded.push(...data.uploaded);
            if (data.errors)   errors.push(...data.errors);
        } catch (e) {
            errors.push({ file: files[i].name, error: e.message });
        }
        if (onProgress) onProgress(i + 1, files.length);
    }
    return { uploaded, errors };
}

async function apiDeleteGallery(galleryId) {
    const res = await fetch(`${API}/galleries/${galleryId}/`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!res.ok) throw new Error('Ошибка удаления');
}

async function apiDeletePhoto(galleryId, photoId) {
    const res = await fetch(`${API}/galleries/${galleryId}/photos/${photoId}/`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!res.ok) throw new Error('Ошибка удаления фото');
}

async function apiGetGallery(galleryId) {
    const res = await fetch(`${API}/galleries/${galleryId}/`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Ошибка загрузки');
    return res.json();
}

// ==================== RENDER GALLERY LIST ====================

function getSortedFilteredGalleries() {
    const sortVal = document.getElementById('sort-galleries')?.value || 'date-desc';
    let list = [...allGalleries];
    if (sortVal === 'date-asc')  list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sortVal === 'date-desc') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sortVal === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return list;
}

function renderGalleryList() {
    const grid  = document.getElementById('galleries-grid');
    const empty = document.getElementById('galleries-empty');
    const list  = getSortedFilteredGalleries();

    // Оставляем только кнопку «создать»
    const createCard = document.getElementById('create-gallery-card');
    grid.innerHTML = '';
    grid.appendChild(createCard);

    if (list.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    list.forEach(g => grid.appendChild(buildGalleryCard(g)));
}

// FIX 1 + FIX 2: каждое фото в обёртке-ячейке, название галереи внизу
function buildGalleryCard(gallery) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.dataset.galleryId = gallery.id;

    const count    = gallery.photos_count || 0;
    const previews = gallery.preview_photos || [];

    // 4 ячейки сетки превью
    let cells = '';
    for (let i = 0; i < 4; i++) {
        if (previews[i]) {
            cells += `<div class="gallery-preview-cell"><img src="${previews[i]}" alt="" loading="lazy"></div>`;
        } else {
            cells += `<div class="gallery-preview-cell"><div class="gallery-preview-placeholder"></div></div>`;
        }
    }

    card.innerHTML = `
        <div class="gallery-preview">
            <div class="gallery-photo-count"><span>${count}</span> фото</div>
            ${cells}
        </div>
        <div class="gallery-info">
            <div class="gallery-name">${escHtml(gallery.name)}</div>
            <div class="gallery-date">${formatDate(gallery.created_at)}</div>
        </div>
    `;

    card.addEventListener('click', () => openGallery(gallery.id));
    return card;
}

// ==================== GALLERY DETAIL ====================

async function openGallery(galleryId) {
    document.getElementById('view-galleries').style.display = 'none';
    document.getElementById('view-gallery-detail').style.display = 'block';
    document.getElementById('gallery-photos-grid').innerHTML =
        '<p style="color:#999;padding:16px 0;">Загрузка...</p>';
    document.getElementById('gallery-photos-empty').style.display = 'none';

    try {
        const gallery = await apiGetGallery(galleryId);
        currentGallery = gallery;
        currentPhotos  = gallery.photos || [];

        document.getElementById('gallery-detail-title').textContent = gallery.name;
        document.getElementById('gallery-detail-meta').textContent =
            `${currentPhotos.length} фото · Создана ${formatDate(gallery.created_at)}`;

        renderPhotosGrid();
    } catch (e) {
        showToast('Не удалось загрузить галерею', 'error');
        showGalleryList();
    }
}

// FIX 3: изображение + название фото под ячейкой
function renderPhotosGrid() {
    const grid  = document.getElementById('gallery-photos-grid');
    const empty = document.getElementById('gallery-photos-empty');
    grid.innerHTML = '';

    if (currentPhotos.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    currentPhotos.forEach((photo, index) => {
        const cell = document.createElement('div');
        cell.className = 'gallery-photo-cell';
        cell.dataset.photoId = photo.id;

        // Убираем расширение из названия для красоты
        const displayName = photo.original_name.replace(/\.[^.]+$/, '');

        cell.innerHTML = `
            <div class="gallery-photo-img">
                <img src="${photo.url}" alt="${escHtml(photo.original_name)}" loading="lazy">
                <button class="photo-delete-btn" data-photo-id="${photo.id}" title="Удалить">✕</button>
            </div>
            <div class="gallery-photo-name" title="${escHtml(photo.original_name)}">${escHtml(displayName)}</div>
        `;

        cell.querySelector('img').addEventListener('click', () => openLightbox(index));
        cell.querySelector('.photo-delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await deletePhoto(photo.id);
        });

        grid.appendChild(cell);
    });
}

function showGalleryList() {
    document.getElementById('view-gallery-detail').style.display = 'none';
    document.getElementById('view-galleries').style.display = 'block';
    currentGallery = null;
    currentPhotos  = [];
    loadGalleries();
}

// ==================== СОЗДАНИЕ ГАЛЕРЕИ ====================

function openCreateModal() {
    selectedFiles = [];
    document.getElementById('gallery-name').value = '';
    document.getElementById('upload-preview').innerHTML = '';
    document.getElementById('gallery-upload-progress').style.display = 'none';
    document.getElementById('gallery-files').value = '';
    document.getElementById('create-gallery-modal').classList.add('active');
    setTimeout(() => document.getElementById('gallery-name').focus(), 50);
}

function closeCreateModal() {
    document.getElementById('create-gallery-modal').classList.remove('active');
    selectedFiles = [];
}

async function handleCreateGallery() {
    const name = document.getElementById('gallery-name').value.trim();
    if (!name) {
        showToast('Введите название галереи', 'error');
        document.getElementById('gallery-name').focus();
        return;
    }

    const btn = document.getElementById('btn-create-gallery');
    btn.disabled = true;
    btn.textContent = 'Создание...';

    try {
        const gallery = await apiCreateGallery(name);
        if (selectedFiles.length > 0) {
            showUploadProgress(0, selectedFiles.length);
            await apiUploadPhotos(gallery.id, selectedFiles, (done, total) => {
                showUploadProgress(done, total);
            });
        }
        closeCreateModal();
        showToast(`Галерея «${name}» создана`);
        await loadGalleries();
    } catch (e) {
        showToast(e.message || 'Ошибка создания галереи', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Создать';
        document.getElementById('gallery-upload-progress').style.display = 'none';
    }
}

// ==================== ДОБАВЛЕНИЕ ФОТО ====================

async function handleAddPhotos(e) {
    const files = Array.from(e.target.files);
    if (!files.length || !currentGallery) return;
    e.target.value = '';

    const progressWrap = document.getElementById('gallery-upload-progress-detail');
    const fillEl       = document.getElementById('upload-fill-detail');
    const countEl      = document.getElementById('upload-count-detail');
    progressWrap.style.display = 'block';

    await apiUploadPhotos(currentGallery.id, files, (done, total) => {
        fillEl.style.width  = Math.round((done / total) * 100) + '%';
        countEl.textContent = `${done} / ${total}`;
    });

    progressWrap.style.display = 'none';
    showToast(`${files.length} фото загружено`);
    await openGallery(currentGallery.id);
}

// ==================== УДАЛЕНИЕ ГАЛЕРЕИ ====================

async function handleDeleteGallery() {
    if (!currentGallery) return;
    if (!confirm(`Удалить галерею «${currentGallery.name}» и все фото в ней?`)) return;
    try {
        await apiDeleteGallery(currentGallery.id);
        showToast('Галерея удалена');
        showGalleryList();
    } catch (e) {
        showToast('Ошибка удаления галереи', 'error');
    }
}

// ==================== УДАЛЕНИЕ ФОТО ====================

async function deletePhoto(photoId) {
    if (!confirm('Удалить это фото?')) return;
    try {
        await apiDeletePhoto(currentGallery.id, photoId);
        currentPhotos = currentPhotos.filter(p => p.id !== photoId);
        renderPhotosGrid();
        document.getElementById('gallery-detail-meta').textContent =
            `${currentPhotos.length} фото · Создана ${formatDate(currentGallery.created_at)}`;
        const idx = allGalleries.findIndex(g => g.id === currentGallery.id);
        if (idx !== -1) allGalleries[idx].photos_count = currentPhotos.length;
        showToast('Фото удалено');
    } catch (e) {
        showToast('Ошибка удаления фото', 'error');
    }
}

// ==================== ЛАЙТБОКС ====================

function openLightbox(index) {
    lightboxIndex = index;
    updateLightbox();
    document.getElementById('lightbox').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
    document.body.style.overflow = '';
}

// FIX 3: название фото в заголовке лайтбокса
function updateLightbox() {
    const photo = currentPhotos[lightboxIndex];
    if (!photo) return;

    document.getElementById('lightbox-img').src = photo.url;

    // Название без расширения
    const name = photo.original_name.replace(/\.[^.]+$/, '');
    document.getElementById('lightbox-title').textContent = name;

    document.getElementById('lightbox-counter').textContent =
        `${lightboxIndex + 1} / ${currentPhotos.length}`;
    document.getElementById('lightbox-delete').dataset.photoId = photo.id;

    document.getElementById('lightbox-prev').style.visibility =
        lightboxIndex > 0 ? 'visible' : 'hidden';
    document.getElementById('lightbox-next').style.visibility =
        lightboxIndex < currentPhotos.length - 1 ? 'visible' : 'hidden';
}

function moveLightbox(dir) {
    const newIdx = lightboxIndex + dir;
    if (newIdx >= 0 && newIdx < currentPhotos.length) {
        lightboxIndex = newIdx;
        updateLightbox();
    }
}

async function handleLightboxDelete() {
    const photo = currentPhotos[lightboxIndex];
    if (!photo || !confirm('Удалить это фото?')) return;
    try {
        await apiDeletePhoto(currentGallery.id, photo.id);
        currentPhotos = currentPhotos.filter((_, i) => i !== lightboxIndex);
        renderPhotosGrid();
        if (currentPhotos.length === 0) {
            closeLightbox();
        } else {
            if (lightboxIndex >= currentPhotos.length) lightboxIndex = currentPhotos.length - 1;
            updateLightbox();
        }
        document.getElementById('gallery-detail-meta').textContent =
            `${currentPhotos.length} фото · Создана ${formatDate(currentGallery.created_at)}`;
        showToast('Фото удалено');
    } catch (e) {
        showToast('Ошибка удаления', 'error');
    }
}

function onKeydown(e) {
    if (document.getElementById('lightbox').style.display === 'none') return;
    if (e.key === 'ArrowLeft')  moveLightbox(-1);
    if (e.key === 'ArrowRight') moveLightbox(1);
    if (e.key === 'Escape')     closeLightbox();
}

// ==================== UPLOAD AREA ====================

function initUploadArea() {
    const area    = document.getElementById('upload-area');
    const input   = document.getElementById('gallery-files');
    const preview = document.getElementById('upload-preview');
    if (!area || !input) return;

    // area — это <label for="gallery-files">, нативный клик сам открывает диалог.
    // JS-клик не нужен — только drag-and-drop вешаем вручную.
    area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        addSelectedFiles(files, preview);
    });

    input.addEventListener('change', () => {
        if (input.files.length > 0) {
            addSelectedFiles(Array.from(input.files), preview);
        }
        input.value = '';
    });
}

function addSelectedFiles(files, preview) {
    selectedFiles.push(...files);
    renderUploadPreview(preview);
}

function renderUploadPreview(preview) {
    preview.innerHTML = '';
    selectedFiles.forEach((file, i) => {
        const url  = URL.createObjectURL(file);
        const item = document.createElement('div');
        item.className = 'upload-preview-item';
        item.innerHTML = `
            <img src="${url}" alt="">
            <button type="button" class="remove-file-btn" data-index="${i}">✕</button>
        `;
        item.querySelector('.remove-file-btn').addEventListener('click', () => {
            selectedFiles.splice(i, 1);
            renderUploadPreview(preview);
        });
        preview.appendChild(item);
    });
}

// ==================== PROGRESS ====================

function showUploadProgress(done, total) {
    const wrap  = document.getElementById('gallery-upload-progress');
    const fill  = document.getElementById('upload-fill');
    const count = document.getElementById('upload-count');
    wrap.style.display  = 'block';
    fill.style.width    = (total > 0 ? Math.round((done / total) * 100) : 0) + '%';
    count.textContent   = `${done} / ${total}`;
}

function showLoading(show) {
    document.getElementById('galleries-loading').style.display = show ? 'block' : 'none';
}

// ==================== HELPERS ====================

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'success') {
    let toast = document.getElementById('gallery-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gallery-toast';
        toast.style.cssText = [
            'position:fixed', 'bottom:30px', 'left:50%', 'transform:translateX(-50%)',
            'color:#fff', 'padding:10px 22px', 'font-size:14px',
            'z-index:9999', 'transition:opacity 0.3s', 'pointer-events:none'
        ].join(';');
        document.body.appendChild(toast);
    }
    toast.textContent   = msg;
    toast.style.background = type === 'error' ? '#c0392b' : '#007674';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}
