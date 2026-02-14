// ==================== PRINT APP ====================

// API URL
const API_URL = 'http://127.0.0.1:8000/api';

// Состояние приложения
const AppState = {
    currentStep: 1,
    photos: [], // { id, file, url, name, width, height, aspectRatio, orientation, settings: {...} }
    sizes: [], // { value, label, price, ratio } - загружаются с API
    papers: [], // { value, label, coefficient } - загружаются с API
    projectId: null, // UUID проекта в БД
    projectName: 'Проект печати',
    totalPrice: 0,
    fullImageWarningShown: false, // показано ли предупреждение о полях
    sortOrder: 'asc', // 'asc' или 'desc'
    defaultSize: null, // размер из URL-параметров (со standard-photos.html)
    defaultPaper: null
};

// Стандартные соотношения сторон для печати
const PRINT_RATIOS = {
    '10x15': 1.5,    // 3:2
    '13x18': 1.385,  // ~3:2
    '15x21': 1.4,    // ~3:2
    '21x30': 1.429,  // ~3:2
    '30x42': 1.4,    // ~3:2
    '15x15': 1,      // 1:1 квадрат
    '20x20': 1,
    '30x30': 1
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadPrintOptions();
    initStepNavigation();
    initUploadSources();
    initGalleryPicker();
    initSettingsPage();
    initPreviewPage();
    initEditorModal();
    initInfoModal();
    initOrderModal();
    initFooterButtons();
    initFullImageWarningModal();
});

// ==================== AUTH ====================
async function checkAuth() {
    const token = localStorage.getItem('access');
    const userName = document.getElementById('user-name');
    
    if (!token) {
        if (userName) userName.textContent = 'Гость';
        return;
    }
    
    try {
        const res = await fetch('http://127.0.0.1:8000/api/auth/me/', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
            const user = await res.json();
            if (userName) userName.textContent = user.username;
        }
    } catch (e) {
        console.error('Auth check failed:', e);
    }
}

// ==================== LOAD PRINT OPTIONS ====================
async function loadPrintOptions() {
    try {
        // Загружаем конфиг с API
        const res = await fetch(`${API_URL}/config/prints/`);
        if (!res.ok) throw new Error('Failed to load config');
        
        const config = await res.json();
        
        // Парсим размеры
        if (config.sizes && config.sizes.length > 0) {
            AppState.sizes = config.sizes.map(s => {
                const [w, h] = s.code.split('x').map(Number);
                return {
                    value: s.code,
                    label: s.name,
                    price: parseFloat(s.price),
                    ratio: Math.max(w, h) / Math.min(w, h)
                };
            });
        }
        
        // Парсим типы бумаги
        if (config.papers && config.papers.length > 0) {
            AppState.papers = config.papers.map(p => ({
                value: p.code,
                label: p.name,
                coefficient: parseFloat(p.coefficient)
            }));
        }
        
        console.log('Loaded sizes from API:', AppState.sizes);
        console.log('Loaded papers from API:', AppState.papers);
        
    } catch (e) {
        console.error('Failed to load print options from API:', e);
        // Fallback - дефолтные значения
        AppState.sizes = [
            { value: '10x15', label: '10 × 15 см', price: 15, ratio: 1.5 },
            { value: '15x21', label: '15 × 21 см', price: 35, ratio: 1.4 },
            { value: '21x30', label: '21 × 30 см', price: 60, ratio: 1.43 }
        ];
        AppState.papers = [
            { value: 'glossy', label: 'Глянцевая', coefficient: 1.0 },
            { value: 'matte', label: 'Матовая', coefficient: 1.0 }
        ];
    }

    // Применяем параметры из URL (размер/бумага со страницы standard-photos.html)
    applyUrlParams();
}

// Читаем URL-параметры и добавляем кастомный размер в AppState.sizes если нужно
function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const size = params.get('size');
    const paper = params.get('paper');
    const isCustom = params.get('custom') === '1';
    const customPrice = parseFloat(params.get('price'));

    if (size && isCustom) {
        const [w, h] = size.split('x').map(Number);
        if (w > 0 && h > 0) {
            // Добавляем только если такого размера ещё нет в стандартных
            const exists = AppState.sizes.some(s => {
                const [sw, sh] = s.value.split('x').map(Number);
                return (sw === w && sh === h) || (sw === h && sh === w);
            });
            if (!exists) {
                const price = customPrice || Math.round(w * h * 0.1);
                AppState.sizes.unshift({
                    value: size,
                    label: `${w} × ${h} см (нестанд.)`,
                    price: price,
                    ratio: Math.max(w, h) / Math.min(w, h)
                });
            }
        }
    }

    if (size) {
        AppState.defaultSize = size;
    }
    if (paper) {
        AppState.defaultPaper = paper;
    }
}

// Поиск данных размера с учётом ориентации (10x15 и 15x10 — один размер)
function findSizeData(sizeValue) {
    let data = AppState.sizes.find(s => s.value === sizeValue);
    if (data) return data;

    // Пробуем перевёрнутый вариант
    const [a, b] = sizeValue.split('x').map(Number);
    return AppState.sizes.find(s => s.value === `${b}x${a}`);
}

// ==================== API HELPERS ====================
function getAuthHeaders() {
    const token = localStorage.getItem('access');
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// Сохранить проект в БД
async function saveProject() {
    try {
        // Обновляем общую стоимость перед сохранением
        updateTotalPrice();
        
        const projectData = {
            photos: AppState.photos.map(p => ({
                id: p.id,
                serverId: p.serverId || null, // ID фото на сервере
                name: p.name,
                width: p.width,
                height: p.height,
                url: p.url, // пока храним локальный URL
                settings: p.settings
            }))
        };
        
        let res;
        if (AppState.projectId) {
            // Обновляем существующий проект (без product_type)
            const body = {
                name: AppState.projectName,
                data: projectData,
                total_price: AppState.totalPrice
            };
            res = await fetch(`${API_URL}/projects/${AppState.projectId}/`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify(body)
            });
        } else {
            // Создаём новый проект (с product_type)
            const body = {
                name: AppState.projectName,
                product_type: 1, // prints
                data: projectData,
                total_price: AppState.totalPrice
            };
            res = await fetch(`${API_URL}/projects/`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify(body)
            });
        }
        
        if (!res.ok) {
            const err = await res.text();
            console.error('Server response:', err);
            throw new Error('Failed to save project');
        }
        
        const project = await res.json();
        AppState.projectId = project.id;
        
        console.log('Project saved:', project);
        return project;
        
    } catch (e) {
        console.error('Failed to save project:', e);
        throw e;
    }
}

// Загрузить фото на сервер
async function uploadPhotoToServer(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        if (AppState.projectId) {
            formData.append('project_id', AppState.projectId);
        }
        
        const headers = {};
        const token = localStorage.getItem('access');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const res = await fetch(`${API_URL}/photos/upload/`, {
            method: 'POST',
            headers: headers,
            credentials: 'include',
            body: formData
        });
        
        if (!res.ok) throw new Error('Failed to upload photo');
        
        const photo = await res.json();
        console.log('Photo uploaded:', photo);
        return photo;
        
    } catch (e) {
        console.error('Failed to upload photo:', e);
        return null;
    }
}

// Создать заказ из проекта
async function createOrderFromProject() {
    try {
        // Сначала сохраняем проект
        await saveProject();
        
        if (!AppState.projectId) {
            throw new Error('No project ID');
        }
        
        const res = await fetch(`${API_URL}/projects/${AppState.projectId}/checkout/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        
        if (!res.ok) throw new Error('Failed to create order');
        
        const order = await res.json();
        console.log('Order created:', order);
        return order;
        
    } catch (e) {
        console.error('Failed to create order:', e);
        throw e;
    }
}

// ==================== ASPECT RATIO HELPERS ====================
function getImageDimensions(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            resolve({ width: 0, height: 0 });
        };
        img.src = URL.createObjectURL(file);
    });
}

function calculateAspectRatio(width, height) {
    if (width === 0 || height === 0) return 1;
    return Math.max(width, height) / Math.min(width, height);
}

function getOrientation(width, height) {
    if (width > height) return 'landscape';
    if (height > width) return 'portrait';
    return 'square';
}

function getSizeRatio(sizeValue) {
    const [w, h] = sizeValue.split('x').map(Number);
    return Math.max(w, h) / Math.min(w, h);
}

function getSizeDimensions(sizeValue, photoOrientation) {
    const [a, b] = sizeValue.split('x').map(Number);
    // Если фото горизонтальное, большая сторона - ширина
    if (photoOrientation === 'landscape') {
        return { width: Math.max(a, b), height: Math.min(a, b) };
    }
    // Если вертикальное - большая сторона - высота
    return { width: Math.min(a, b), height: Math.max(a, b) };
}

function checkAspectRatioMatch(photoRatio, sizeValue, tolerance = 0.05) {
    const sizeRatio = getSizeRatio(sizeValue);
    return Math.abs(photoRatio - sizeRatio) <= tolerance;
}

function needsCropping(photo) {
    if (photo.settings.fullImage) return false;
    return !checkAspectRatioMatch(photo.aspectRatio, photo.settings.size);
}

// ==================== STEP NAVIGATION ====================
function initStepNavigation() {
    const stepItems = document.querySelectorAll('.step-item');
    
    stepItems.forEach(item => {
        item.addEventListener('click', () => {
            const step = parseInt(item.dataset.step);
            
            if (step > 1 && AppState.photos.length === 0) {
                alert('Сначала загрузите фотографии');
                return;
            }
            
            goToStep(step);
        });
    });
}

function goToStep(step) {
    AppState.currentStep = step;
    
    document.querySelectorAll('.step-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.dataset.step) === step);
    });
    
    document.querySelectorAll('.step-content').forEach(content => {
        content.classList.toggle('active', parseInt(content.dataset.step) === step);
    });
    
    const btnContinue = document.getElementById('btn-continue');
    btnContinue.textContent = step === 3 ? 'Заказать' : 'Продолжить';
    
    if (step === 2) {
        renderSettingsPage();
    } else if (step === 3) {
        renderPreviewPage();
    }
}

// ==================== UPLOAD SOURCES (STEP 1) ====================
function initUploadSources() {
    const sourceUpload = document.getElementById('source-upload');
    const sourceGallery = document.getElementById('source-gallery');
    const fileInput = document.getElementById('file-input');
    const btnAddMore = document.getElementById('btn-add-more');
    
    sourceUpload?.addEventListener('click', () => fileInput.click());
    
    fileInput?.addEventListener('change', (e) => handleFileUpload(e.target.files));
    
    sourceGallery?.addEventListener('click', () => showGalleryPicker());
    
    btnAddMore?.addEventListener('click', () => {
        if (AppState.currentStep === 1) {
            fileInput.click();
        } else {
            goToStep(1);
        }
    });
    
    // Drag and drop
    const appContent = document.querySelector('.app-content');
    
    appContent?.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    });
    
    appContent?.addEventListener('dragleave', (e) => {
        e.currentTarget.classList.remove('dragover');
    });
    
    appContent?.addEventListener('drop', (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files);
        }
    });
}

async function handleFileUpload(files) {
    for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        
        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        const url = URL.createObjectURL(file);
        
        // Получаем размеры изображения
        const dimensions = await getImageDimensions(file);
        const aspectRatio = calculateAspectRatio(dimensions.width, dimensions.height);
        const orientation = getOrientation(dimensions.width, dimensions.height);
        
        AppState.photos.push({
            id,
            file,
            url,
            name: file.name,
            width: dimensions.width,
            height: dimensions.height,
            aspectRatio,
            orientation,
            settings: getDefaultSettings(orientation)
        });
    }
    
    updatePhotosCount();
    renderUploadedPhotos();
    showUploadedPhotos();
}

function getDefaultSettings(orientation) {
    // Выбираем размер в соответствии с ориентацией фото
    const defaultSize = AppState.defaultSize || AppState.sizes[0]?.value || '10x15';
    const [a, b] = defaultSize.split('x').map(Number);
    
    let size;
    if (orientation === 'landscape') {
        // Горизонтальное фото - большее число первым (15x10)
        size = `${Math.max(a, b)}x${Math.min(a, b)}`;
    } else if (orientation === 'portrait') {
        // Вертикальное фото - меньшее число первым (10x15)
        size = `${Math.min(a, b)}x${Math.max(a, b)}`;
    } else {
        // Квадратное - как есть
        size = defaultSize;
    }
    
    return {
        size: size,
        paper: AppState.defaultPaper || AppState.papers[0]?.value || 'глянец',
        frame: 'none',
        frameSize: 3,
        quantity: 1,
        crop: { x: 0, y: 0, zoom: 100 },
        rotation: 0,
        filter: 'original',
        fullImage: false,
        wasEdited: false // флаг: было ли фото открыто в редакторе
    };
}

function updatePhotosCount() {
    const totalPhotos = document.getElementById('total-photos');
    if (totalPhotos) {
        totalPhotos.textContent = AppState.photos.length;
    }
    updateTotalPrice();
}

function updateTotalPrice() {
    let total = 0;

    AppState.photos.forEach(photo => {
        const sizeData = findSizeData(photo.settings.size);
        const paperData = AppState.papers.find(p => p.value === photo.settings.paper);
        
        const basePrice = sizeData?.price || 15;
        const coefficient = paperData?.coefficient || 1.0;
        
        total += Math.round(basePrice * coefficient * photo.settings.quantity);
    });
    
    AppState.totalPrice = total;
    
    const totalPriceEl = document.getElementById('total-price');
    if (totalPriceEl) {
        totalPriceEl.textContent = total;
    }
}

function showUploadedPhotos() {
    const uploadSources = document.getElementById('upload-sources');
    const uploadedPhotos = document.getElementById('uploaded-photos');
    const galleryPicker = document.getElementById('gallery-picker');
    
    if (AppState.photos.length > 0) {
        uploadSources.style.display = 'none';
        galleryPicker.style.display = 'none';
        uploadedPhotos.style.display = 'block';
    }
}

function renderUploadedPhotos() {
    const grid = document.getElementById('photos-grid');
    if (!grid) return;
    
    grid.innerHTML = AppState.photos.map(photo => `
        <div class="photo-thumb" data-id="${photo.id}">
            <img src="${photo.url}" alt="${photo.name}">
            <span class="photo-check">✓</span>
            <button class="remove-photo" data-id="${photo.id}">&times;</button>
        </div>
    `).join('');
    
    grid.querySelectorAll('.remove-photo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removePhoto(btn.dataset.id);
        });
    });
}

function removePhoto(id) {
    const index = AppState.photos.findIndex(p => p.id === id);
    if (index > -1) {
        URL.revokeObjectURL(AppState.photos[index].url);
        AppState.photos.splice(index, 1);
        updatePhotosCount();
        renderUploadedPhotos();
        
        if (AppState.photos.length === 0) {
            document.getElementById('upload-sources').style.display = 'flex';
            document.getElementById('uploaded-photos').style.display = 'none';
        }
    }
}

// ==================== GALLERY PICKER ====================
function initGalleryPicker() {
    const tabUpload = document.getElementById('tab-upload');
    const tabGallery = document.getElementById('tab-gallery');
    
    tabUpload?.addEventListener('click', () => document.getElementById('file-input').click());
    tabGallery?.addEventListener('click', () => loadUserGalleries());
}

function showGalleryPicker() {
    document.getElementById('upload-sources').style.display = 'none';
    document.getElementById('gallery-picker').style.display = 'block';
    loadUserGalleries();
}

async function loadUserGalleries() {
    const galleriesList = document.getElementById('galleries-list');
    const galleryPhotos = document.getElementById('gallery-photos');
    
    galleriesList.style.display = 'flex';
    galleryPhotos.style.display = 'none';
    
    // TODO: API
    const galleries = [
        { id: 1, name: 'Отпуск 2025', photosCount: 24, thumbs: [] },
        { id: 2, name: 'Семейные фото', photosCount: 48, thumbs: [] }
    ];
    
    galleriesList.innerHTML = galleries.map(g => `
        <div class="gallery-item" data-id="${g.id}">
            <div class="gallery-thumb">
                <div class="gallery-photo-count"><span>${g.photosCount}</span> фото</div>
                <div class="gallery-thumb-placeholder"></div>
                <div class="gallery-thumb-placeholder"></div>
                <div class="gallery-thumb-placeholder"></div>
                <div class="gallery-thumb-placeholder"></div>
            </div>
            <div class="gallery-name">${g.name}</div>
        </div>
    `).join('');
    
    galleriesList.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => loadGalleryPhotos(item.dataset.id));
    });
}

async function loadGalleryPhotos(galleryId) {
    const galleriesList = document.getElementById('galleries-list');
    const galleryPhotos = document.getElementById('gallery-photos');
    
    galleriesList.style.display = 'none';
    galleryPhotos.style.display = 'block';
    galleryPhotos.innerHTML = '<p style="padding: 20px; color: #999;">Загрузка фото из галереи...</p>';
}

// ==================== SETTINGS PAGE (STEP 2) ====================
function initSettingsPage() {
    const sortBy = document.getElementById('sort-by');
    
    sortBy?.addEventListener('change', () => {
        sortPhotos(sortBy.value);
        renderSettingsPage();
    });
}

function sortPhotos(by) {
    if (by === 'name-asc') {
        AppState.photos.sort((a, b) => a.name.localeCompare(b.name));
    } else if (by === 'name-desc') {
        AppState.photos.sort((a, b) => b.name.localeCompare(a.name));
    } else if (by === 'date-asc') {
        AppState.photos.sort((a, b) => (a.file?.lastModified || 0) - (b.file?.lastModified || 0));
    } else if (by === 'date-desc') {
        AppState.photos.sort((a, b) => (b.file?.lastModified || 0) - (a.file?.lastModified || 0));
    }
}

function renderSettingsPage() {
    const list = document.getElementById('photos-settings-list');
    if (!list) return;
    
    list.innerHTML = AppState.photos.map((photo, index) => {
        const sizeData = findSizeData(photo.settings.size);
        const paperData = AppState.papers.find(p => p.value === photo.settings.paper);
        
        const basePrice = sizeData?.price || 15;
        const coefficient = paperData?.coefficient || 1.0;
        const price = Math.round(basePrice * coefficient * photo.settings.quantity);
        
        // Размеры для отображения берём напрямую из size
        // size уже содержит правильный порядок: первое число - ширина, второе - высота
        const [sizeWidth, sizeHeight] = photo.settings.size.split('x').map(Number);
        
        return `
        <div class="photo-settings-item" data-id="${photo.id}">
            <div class="photo-settings-preview">
                <span class="size-indicator">${sizeHeight} см</span>
                <img src="${photo.url}" alt="${photo.name}" class="orientation-${photo.orientation}">
                <span class="size-indicator-bottom">${sizeWidth} см</span>
            </div>
            <div class="photo-settings-details">
                <div class="photo-settings-info">${index + 1} из ${AppState.photos.length} фотографий</div>
                <div class="photo-settings-filename">${photo.name}</div>
                <div class="photo-settings-options">
                    <div class="setting-group">
                        <label>Размер</label>
                        <select class="setting-size" data-id="${photo.id}">
                            ${AppState.sizes.map(s => {
                                const [sa, sb] = s.value.split('x').map(Number);
                                const [pa, pb] = photo.settings.size.split('x').map(Number);
                                const match = (sa === pa && sb === pb) || (sa === pb && sb === pa);
                                return `<option value="${s.value}" ${match ? 'selected' : ''}>${s.label}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="setting-group">
                        <label>Тип бумаги</label>
                        <select class="setting-paper" data-id="${photo.id}">
                            ${AppState.papers.map(p => `
                                <option value="${p.value}" ${p.value === photo.settings.paper ? 'selected' : ''}>${p.label}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="setting-group">
                        <label>Рамка</label>
                        <div class="frame-settings">
                            <select class="setting-frame" data-id="${photo.id}">
                                <option value="none" ${photo.settings.frame === 'none' ? 'selected' : ''}>Без рамки</option>
                                <option value="white" ${photo.settings.frame === 'white' ? 'selected' : ''}>Белая рамка</option>
                            </select>
                            <div class="frame-size-input ${photo.settings.frame === 'white' ? 'visible' : ''}">
                                <input type="number" class="setting-frame-size" data-id="${photo.id}" 
                                    value="${photo.settings.frameSize}" min="1" max="10">
                                <span>мм</span>
                            </div>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Кол-во</label>
                        <input type="number" class="setting-quantity" data-id="${photo.id}" 
                            value="${photo.settings.quantity}" min="1">
                    </div>
                    <div class="photo-settings-price">
                        <label>Цена</label>
                        <span>${price} руб.</span>
                    </div>
                    <button class="photo-settings-delete" data-id="${photo.id}">🗑️</button>
                </div>
                <button class="btn-apply-to-all" data-id="${photo.id}">Применить настройки ко всем фото</button>
            </div>
        </div>
        `;
    }).join('');
    
    // Обработчики
    list.querySelectorAll('.setting-size').forEach(select => {
        select.addEventListener('change', (e) => {
            updatePhotoSetting(e.target.dataset.id, 'size', e.target.value);
            renderSettingsPage(); // перерисовываем для обновления размеров
        });
    });
    
    list.querySelectorAll('.setting-paper').forEach(select => {
        select.addEventListener('change', (e) => {
            updatePhotoSetting(e.target.dataset.id, 'paper', e.target.value);
            renderSettingsPage();
        });
    });
    
    list.querySelectorAll('.setting-frame').forEach(select => {
        select.addEventListener('change', (e) => {
            updatePhotoSetting(e.target.dataset.id, 'frame', e.target.value);
            const frameSizeInput = e.target.closest('.frame-settings').querySelector('.frame-size-input');
            frameSizeInput.classList.toggle('visible', e.target.value === 'white');
        });
    });
    
    list.querySelectorAll('.setting-frame-size').forEach(input => {
        input.addEventListener('change', (e) => updatePhotoSetting(e.target.dataset.id, 'frameSize', parseInt(e.target.value)));
    });
    
    list.querySelectorAll('.setting-quantity').forEach(input => {
        input.addEventListener('change', (e) => {
            updatePhotoSetting(e.target.dataset.id, 'quantity', parseInt(e.target.value) || 1);
            renderSettingsPage();
        });
    });
    
    list.querySelectorAll('.photo-settings-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            removePhoto(btn.dataset.id);
            renderSettingsPage();
        });
    });
    
    // Обработчик "применить ко всем" для каждого фото
    list.querySelectorAll('.btn-apply-to-all').forEach(btn => {
        btn.addEventListener('click', () => {
            applySettingsFromPhoto(btn.dataset.id);
        });
    });
}

function updatePhotoSetting(id, key, value) {
    const photo = AppState.photos.find(p => p.id === id);
    if (photo) {
        photo.settings[key] = value;
        updateTotalPrice();
    }
}

function applySettingsFromPhoto(photoId) {
    const photo = AppState.photos.find(p => p.id === photoId);
    if (!photo) return;
    
    // Копируем настройки с выбранного фото на все остальные
    // Размер применяется с учётом ориентации каждого фото
    const settings = { 
        paper: photo.settings.paper,
        frame: photo.settings.frame,
        frameSize: photo.settings.frameSize,
        quantity: photo.settings.quantity
    };
    
    // Получаем базовый размер (без учёта ориентации)
    const [a, b] = photo.settings.size.split('x').map(Number);
    const baseWidth = Math.min(a, b);
    const baseHeight = Math.max(a, b);
    
    AppState.photos.forEach(p => {
        // Применяем общие настройки
        p.settings.paper = settings.paper;
        p.settings.frame = settings.frame;
        p.settings.frameSize = settings.frameSize;
        p.settings.quantity = settings.quantity;
        
        // Размер применяем с учётом ориентации фото
        if (p.orientation === 'landscape') {
            p.settings.size = `${baseHeight}x${baseWidth}`;
        } else {
            p.settings.size = `${baseWidth}x${baseHeight}`;
        }
    });
    
    renderSettingsPage();
    updateTotalPrice();
    alert('Настройки применены ко всем фото');
}

// Старая функция для обратной совместимости
function applySettingsToAll() {
    if (AppState.photos.length === 0) return;
    applySettingsFromPhoto(AppState.photos[0].id);
}

// ==================== PREVIEW PAGE (STEP 3) ====================
function initPreviewPage() {
    const cropInfoLink = document.getElementById('crop-info-link');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const groupBtns = document.querySelectorAll('.group-btn');
    
    cropInfoLink?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('crop-info-modal').classList.add('active');
    });
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPreviewPage(btn.dataset.filter);
        });
    });
    
    groupBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            groupBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPreviewPage(null, btn.dataset.group);
        });
    });
}

function renderPreviewPage(filter = 'all', groupBy = 'size') {
    const grid = document.getElementById('preview-grid');
    if (!grid) return;
    
    // Подсчёт для фильтров
    const loadedCount = AppState.photos.length; // Загружено - количество уникальных фото
    const toPrintCount = AppState.photos.reduce((sum, p) => sum + p.settings.quantity, 0); // В печать - сумма quantity
    const inSizeCount = AppState.photos.filter(p => !needsCropping(p)).length;
    const needsReviewCount = AppState.photos.filter(p => needsCropping(p)).length;
    
    document.getElementById('filter-total').textContent = toPrintCount;
    document.getElementById('filter-loaded').textContent = loadedCount;
    document.getElementById('filter-sized').textContent = inSizeCount;
    document.getElementById('filter-review').textContent = needsReviewCount;
    
    // Фильтрация
    let photos = [...AppState.photos];
    if (filter === 'sized') {
        photos = photos.filter(p => !needsCropping(p));
    } else if (filter === 'review') {
        photos = photos.filter(p => needsCropping(p));
    }
    
    // Группировка
    if (groupBy === 'size') {
        const groups = {};
        photos.forEach(photo => {
            const size = photo.settings.size;
            if (!groups[size]) groups[size] = [];
            groups[size].push(photo);
        });
        
        grid.innerHTML = Object.entries(groups).map(([size, groupPhotos]) => `
            <div class="preview-group">
                <div class="preview-group-title">${size} | ${groupPhotos.length} фото</div>
                <div class="preview-photos">
                    ${groupPhotos.map(photo => renderPreviewPhoto(photo)).join('')}
                </div>
            </div>
        `).join('');
    } else {
        grid.innerHTML = `
            <div class="preview-group">
                <div class="preview-photos">
                    ${photos.map(photo => renderPreviewPhoto(photo)).join('')}
                </div>
            </div>
        `;
    }
    
    // Обработчики
    grid.querySelectorAll('.preview-photo-edit').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openEditor(link.dataset.id);
        });
    });
    
    grid.querySelectorAll('.preview-photo-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => openEditor(thumb.dataset.id));
    });
}

function renderPreviewPhoto(photo) {
    const needsReview = needsCropping(photo);
    
    // Стили для фильтров
    let filterStyle = '';
    if (photo.settings.filter === 'grayscale') {
        filterStyle = 'filter: grayscale(100%);';
    } else if (photo.settings.filter === 'sepia') {
        filterStyle = 'filter: sepia(100%);';
    }
    
    // Иконка редактирования (показываем если было изменено что-то кроме wasEdited)
    const isModified = photo.settings.filter !== 'original' || 
                       photo.settings.rotation !== 0 || 
                       photo.settings.fullImage ||
                       photo.settings.crop.zoom !== 100 ||
                       photo.settings.crop.x !== 0 ||
                       photo.settings.crop.y !== 0;
    
    const editedIcon = isModified ? '<div class="edited-icon" title="Фото изменено">✎</div>' : '';
    const fullImageIcon = photo.settings.fullImage ? '<div class="fullimage-icon" title="С полями">▢</div>' : '';
    
    // Режим 1: Фото НЕ было в редакторе - показываем в исходном соотношении
    if (!photo.settings.wasEdited) {
        // Определяем индикаторы обрезки
        let cropIndicator = '';
        if (needsReview) {
            const photoRatio = photo.width / photo.height;
            const [sizeA, sizeB] = photo.settings.size.split('x').map(Number);
            const sizeRatio = sizeA / sizeB;
            
            if (photoRatio > sizeRatio) {
                cropIndicator = `
                    <div class="crop-indicator crop-left"></div>
                    <div class="crop-indicator crop-right"></div>
                `;
            } else {
                cropIndicator = `
                    <div class="crop-indicator crop-top"></div>
                    <div class="crop-indicator crop-bottom"></div>
                `;
            }
        }
        
        return `
            <div class="preview-photo-item">
                <div class="preview-photo-thumb preview-original" data-id="${photo.id}">
                    <img src="${photo.url}" alt="${photo.name}" style="${filterStyle}">
                    ${cropIndicator}
                    ${editedIcon}
                    ${fullImageIcon}
                </div>
                <div class="preview-photo-name">${photo.name}</div>
                <a href="#" class="preview-photo-edit" data-id="${photo.id}">редактировать</a>
            </div>
        `;
    }
    
    // Режим 2: Фото БЫЛО в редакторе - показываем в соотношении размера печати
    const [sizeA, sizeB] = photo.settings.size.split('x').map(Number);
    const frameRatio = sizeA / sizeB;
    
    // Базовые размеры превью
    const previewMaxWidth = 180;
    const previewMaxHeight = 200;
    
    let frameWidth, frameHeight;
    if (previewMaxWidth / previewMaxHeight > frameRatio) {
        frameHeight = previewMaxHeight;
        frameWidth = frameHeight * frameRatio;
    } else {
        frameWidth = previewMaxWidth;
        frameHeight = frameWidth / frameRatio;
    }
    
    // Рассчитываем размеры и позицию изображения
    const imgRatio = photo.width / photo.height;
    const zoom = photo.settings.crop.zoom / 100;
    
    let imgWidth, imgHeight, imgLeft, imgTop;
    
    if (photo.settings.fullImage) {
        // Вписываем целиком с полями
        if (imgRatio > frameRatio) {
            imgWidth = frameWidth;
            imgHeight = frameWidth / imgRatio;
        } else {
            imgHeight = frameHeight;
            imgWidth = frameHeight * imgRatio;
        }
        // Центрируем
        imgLeft = (frameWidth - imgWidth) / 2;
        imgTop = (frameHeight - imgHeight) / 2;
    } else {
        // Заполняем с обрезкой
        if (imgRatio > frameRatio) {
            imgHeight = frameHeight * zoom;
            imgWidth = imgHeight * imgRatio;
        } else {
            imgWidth = frameWidth * zoom;
            imgHeight = imgWidth / imgRatio;
        }
        // Применяем смещение пропорционально размеру рамки
        // Используем сохранённый размер рамки редактора или рассчитываем масштаб
        const editorFrameWidth = photo.settings.editorFrameWidth || 400;
        const scale = frameWidth / editorFrameWidth;
        imgLeft = photo.settings.crop.x * scale;
        imgTop = photo.settings.crop.y * scale;
    }
    
    const rotateStyle = photo.settings.rotation !== 0 ? `transform: rotate(${photo.settings.rotation}deg);` : '';
    const bgColor = photo.settings.fullImage ? '#fff' : 'transparent';
    
    return `
        <div class="preview-photo-item">
            <div class="preview-photo-thumb preview-cropped ${needsReview && !photo.settings.fullImage ? 'needs-review' : ''}" 
                 data-id="${photo.id}"
                 style="width: ${frameWidth}px; height: ${frameHeight}px; background: ${bgColor};">
                <img src="${photo.url}" alt="${photo.name}" 
                     style="width: ${imgWidth}px; height: ${imgHeight}px; left: ${imgLeft}px; top: ${imgTop}px; ${filterStyle} ${rotateStyle}">
                ${editedIcon}
                ${fullImageIcon}
            </div>
            <div class="preview-photo-name">${photo.name}</div>
            <a href="#" class="preview-photo-edit" data-id="${photo.id}">редактировать</a>
        </div>
    `;
}

// ==================== EDITOR MODAL ====================
let currentEditorPhotoIndex = 0;
let editorDragState = { isDragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };

function initEditorModal() {
    const modal = document.getElementById('editor-modal');
    const closeBtn = modal?.querySelector('.modal-close');
    const prevBtn = document.getElementById('editor-prev');
    const nextBtn = document.getElementById('editor-next');
    const applyBtn = document.getElementById('btn-apply-editor');
    const applyCropAll = document.getElementById('apply-crop-all');
    const zoomSlider = document.getElementById('editor-zoom');
    const sizeSelect = document.getElementById('editor-size');
    const fullImageCheck = document.getElementById('editor-full-image');
    const colorRadios = document.querySelectorAll('input[name="color-filter"]');
    const rotateFrameBtn = document.getElementById('rotate-frame-left');
    const rotatePhotoBtn = document.getElementById('rotate-photo-right');
    
    closeBtn?.addEventListener('click', () => closeEditor());
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeEditor(); });
    
    prevBtn?.addEventListener('click', () => navigateEditor(-1));
    nextBtn?.addEventListener('click', () => navigateEditor(1));
    
    applyBtn?.addEventListener('click', () => applyEditorChanges());
    applyCropAll?.addEventListener('click', (e) => { e.preventDefault(); applyCropToAll(); });
    
    zoomSlider?.addEventListener('input', (e) => updateEditorZoom(parseInt(e.target.value)));
    sizeSelect?.addEventListener('change', (e) => updateEditorSize(e.target.value));
    
    fullImageCheck?.addEventListener('change', (e) => {
        if (e.target.checked && !AppState.fullImageWarningShown) {
            showFullImageWarning(() => {
                updateEditorFullImage(true);
                AppState.fullImageWarningShown = true;
            }, () => {
                e.target.checked = false;
            });
        } else {
            updateEditorFullImage(e.target.checked);
        }
    });
    
    colorRadios.forEach(radio => {
        radio.addEventListener('change', (e) => updateEditorFilter(e.target.value));
    });
    
    rotateFrameBtn?.addEventListener('click', () => rotateFrame());
    rotatePhotoBtn?.addEventListener('click', () => rotatePhoto());
    
    // Drag для кадрирования
    initEditorDrag();
}

function initEditorDrag() {
    const editorCanvas = document.getElementById('editor-canvas');
    if (!editorCanvas) return;
    
    editorCanvas.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
    
    editorCanvas.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', endDrag);
}

function openEditor(photoId) {
    const index = AppState.photos.findIndex(p => p.id === photoId);
    if (index === -1) return;
    
    currentEditorPhotoIndex = index;
    
    // Помечаем что фото было открыто в редакторе
    AppState.photos[index].settings.wasEdited = true;
    
    // Сбрасываем состояние редактора перед рендером
    const cropFrame = document.getElementById('crop-frame');
    const img = document.getElementById('editor-image');
    if (cropFrame) {
        cropFrame.classList.remove('with-padding');
        cropFrame.style.background = 'transparent';
        cropFrame.style.width = '';
        cropFrame.style.height = '';
    }
    if (img) {
        img.src = '';
        img.style.width = '';
        img.style.height = '';
        img.style.left = '0';
        img.style.top = '0';
        img.style.transform = '';
        img.style.filter = '';
    }
    
    // Сначала показываем модалку, потом рендерим (чтобы canvas имел размеры)
    document.getElementById('editor-modal').classList.add('active');
    
    // Ждём пока модалка отрендерится и canvas получит размеры
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            renderEditor();
        });
    });
}

function closeEditor() {
    // Сохраняем размер рамки редактора перед закрытием
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (photo) {
        const cropFrame = document.getElementById('crop-frame');
        if (cropFrame && cropFrame.offsetWidth > 0) {
            photo.settings.editorFrameWidth = cropFrame.offsetWidth;
            photo.settings.editorFrameHeight = cropFrame.offsetHeight;
        }
    }
    
    document.getElementById('editor-modal').classList.remove('active');
}

function navigateEditor(direction) {
    // Сохраняем размер рамки текущего фото перед переключением
    const currentPhoto = AppState.photos[currentEditorPhotoIndex];
    if (currentPhoto) {
        const cropFrame = document.getElementById('crop-frame');
        if (cropFrame && cropFrame.offsetWidth > 0) {
            currentPhoto.settings.editorFrameWidth = cropFrame.offsetWidth;
            currentPhoto.settings.editorFrameHeight = cropFrame.offsetHeight;
        }
    }
    
    currentEditorPhotoIndex += direction;
    if (currentEditorPhotoIndex < 0) currentEditorPhotoIndex = AppState.photos.length - 1;
    if (currentEditorPhotoIndex >= AppState.photos.length) currentEditorPhotoIndex = 0;
    
    // Сбрасываем состояние img перед рендером нового фото
    const img = document.getElementById('editor-image');
    if (img) {
        img.src = '';
        img.style.width = '';
        img.style.height = '';
        img.style.left = '0';
        img.style.top = '0';
        img.style.transform = '';
    }
    
    // Помечаем новое фото как редактированное
    AppState.photos[currentEditorPhotoIndex].settings.wasEdited = true;
    
    renderEditor();
}

function renderEditor() {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;
    
    // Счётчик и имя
    document.getElementById('editor-current').textContent = currentEditorPhotoIndex + 1;
    document.getElementById('editor-total').textContent = AppState.photos.length;
    document.getElementById('editor-filename').textContent = photo.name;
    
    // Размеры в селекте
    const sizeSelect = document.getElementById('editor-size');
    sizeSelect.innerHTML = AppState.sizes.map(s => {
        const [sa, sb] = s.value.split('x').map(Number);
        const [pa, pb] = photo.settings.size.split('x').map(Number);
        const match = (sa === pa && sb === pb) || (sa === pb && sb === pa);
        return `<option value="${s.value}" ${match ? 'selected' : ''}>${s.label}</option>`;
    }).join('');
    
    // Зум
    document.getElementById('editor-zoom').value = photo.settings.crop.zoom;
    
    // Полное изображение
    document.getElementById('editor-full-image').checked = photo.settings.fullImage;
    
    // Цветовой фильтр
    document.querySelectorAll('input[name="color-filter"]').forEach(radio => {
        radio.checked = radio.value === photo.settings.filter;
    });
    
    // Рендерим canvas с рамкой
    renderEditorCanvas();
}

function renderEditorCanvas() {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;
    
    const canvas = document.getElementById('editor-canvas');
    const cropFrame = document.getElementById('crop-frame');
    const img = document.getElementById('editor-image');
    
    // Сбрасываем стили img перед рендером
    img.style.width = '';
    img.style.height = '';
    img.style.left = '0';
    img.style.top = '0';
    img.style.transform = '';
    img.style.filter = '';
    
    // Размеры печати из настроек фото
    const [sizeA, sizeB] = photo.settings.size.split('x').map(Number);
    
    // Ориентация рамки определяется порядком чисел в size
    const frameWidth = sizeA;
    const frameHeight = sizeB;
    const frameRatio = frameWidth / frameHeight;
    
    // Размеры canvas
    const canvasRect = canvas.getBoundingClientRect();
    const maxWidth = canvasRect.width - 40;
    const maxHeight = canvasRect.height - 40;
    
    // Масштабируем рамку под canvas
    let displayFrameWidth, displayFrameHeight;
    if (maxWidth / maxHeight > frameRatio) {
        displayFrameHeight = maxHeight;
        displayFrameWidth = displayFrameHeight * frameRatio;
    } else {
        displayFrameWidth = maxWidth;
        displayFrameHeight = displayFrameWidth / frameRatio;
    }
    
    // Устанавливаем размер рамки (фиксированная!)
    cropFrame.style.width = `${displayFrameWidth}px`;
    cropFrame.style.height = `${displayFrameHeight}px`;
    
    // Функция для применения стилей к изображению
    const applyImageStyles = () => {
        const imgNaturalRatio = photo.width / photo.height;
        const zoom = photo.settings.crop.zoom / 100;
        
        let imgWidth, imgHeight;
        
        if (photo.settings.fullImage) {
            // Вписываем целиком с полями
            if (imgNaturalRatio > frameRatio) {
                imgWidth = displayFrameWidth;
                imgHeight = displayFrameWidth / imgNaturalRatio;
            } else {
                imgHeight = displayFrameHeight;
                imgWidth = displayFrameHeight * imgNaturalRatio;
            }
            cropFrame.classList.add('with-padding');
            cropFrame.style.background = '#fff';
            
            // Центрируем - поля равномерно с обеих сторон
            const offsetX = (displayFrameWidth - imgWidth) / 2;
            const offsetY = (displayFrameHeight - imgHeight) / 2;
            
            img.style.width = `${imgWidth}px`;
            img.style.height = `${imgHeight}px`;
            img.style.left = `${offsetX}px`;
            img.style.top = `${offsetY}px`;
            img.style.transform = `rotate(${photo.settings.rotation}deg)`;
            
        } else {
            // Заполняем рамку (с обрезкой)
            if (imgNaturalRatio > frameRatio) {
                imgHeight = displayFrameHeight * zoom;
                imgWidth = imgHeight * imgNaturalRatio;
            } else {
                imgWidth = displayFrameWidth * zoom;
                imgHeight = imgWidth / imgNaturalRatio;
            }
            cropFrame.classList.remove('with-padding');
            cropFrame.style.background = 'transparent';
            
            img.style.width = `${imgWidth}px`;
            img.style.height = `${imgHeight}px`;
            img.style.left = `${photo.settings.crop.x}px`;
            img.style.top = `${photo.settings.crop.y}px`;
            img.style.transform = `rotate(${photo.settings.rotation}deg)`;
        }
        
        // Фильтр
        if (photo.settings.filter === 'grayscale') {
            img.style.filter = 'grayscale(100%)';
        } else if (photo.settings.filter === 'sepia') {
            img.style.filter = 'sepia(100%)';
        } else {
            img.style.filter = 'none';
        }
    };
    
    // Принудительно перезагружаем изображение
    // Сбрасываем src чтобы onload гарантированно сработал
    img.onload = null;
    const currentSrc = img.src;
    img.src = '';
    
    img.onload = () => {
        // Проверяем что это всё ещё нужное фото
        const currentPhoto = AppState.photos[currentEditorPhotoIndex];
        if (currentPhoto && currentPhoto.id === photo.id) {
            applyImageStyles();
        }
    };
    
    // Устанавливаем src (если тот же URL - всё равно сработает onload из-за сброса)
    img.src = photo.url;
    
    // Если изображение уже в кэше, onload может не сработать - вызываем вручную
    if (img.complete && img.naturalWidth > 0) {
        applyImageStyles();
    }
}

function updateEditorZoom(zoom) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo || photo.settings.fullImage) return;
    
    photo.settings.crop.zoom = zoom;
    renderEditorCanvas();
}

function updateEditorSize(size) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (photo) {
        photo.settings.size = size;
        // Сбрасываем crop при смене размера
        photo.settings.crop = { x: 0, y: 0, zoom: 100 };
        document.getElementById('editor-zoom').value = 100;
        renderEditorCanvas();
    }
}

function updateEditorFullImage(fullImage) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (photo) {
        photo.settings.fullImage = fullImage;
        // Сбрасываем crop при переключении
        photo.settings.crop = { x: 0, y: 0, zoom: 100 };
        document.getElementById('editor-zoom').value = 100;
        renderEditorCanvas();
    }
}

function updateEditorFilter(filter) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (photo) {
        photo.settings.filter = filter;
        renderEditorCanvas();
    }
}

function rotateFrame() {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;
    
    // Меняем местами числа в размере (10x15 -> 15x10)
    const [a, b] = photo.settings.size.split('x').map(Number);
    photo.settings.size = `${b}x${a}`;
    
    // Сбрасываем crop при повороте рамки
    photo.settings.crop = { x: 0, y: 0, zoom: 100 };
    document.getElementById('editor-zoom').value = 100;
    
    // Обновляем селект (показываем новый размер)
    const sizeSelect = document.getElementById('editor-size');
    // Ищем опцию с таким же базовым размером (без учёта порядка)
    const baseSize = [a, b].sort((x, y) => x - y).join('x');
    let found = false;
    Array.from(sizeSelect.options).forEach(opt => {
        const [oa, ob] = opt.value.split('x').map(Number);
        const optBase = [oa, ob].sort((x, y) => x - y).join('x');
        if (optBase === baseSize) {
            // Нашли базовый размер - обновляем value в опции под текущую ориентацию
            found = true;
        }
    });
    
    renderEditorCanvas();
}

function rotatePhoto() {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;
    
    photo.settings.rotation = (photo.settings.rotation + 90) % 360;
    renderEditorCanvas();
}

// Drag для перемещения фото внутри рамки
function startDrag(e) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo || photo.settings.fullImage) return;
    
    e.preventDefault();
    editorDragState.isDragging = true;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    editorDragState.startX = clientX;
    editorDragState.startY = clientY;
    editorDragState.offsetX = photo.settings.crop.x;
    editorDragState.offsetY = photo.settings.crop.y;
}

function onDrag(e) {
    if (!editorDragState.isDragging) return;
    
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;
    
    e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - editorDragState.startX;
    const deltaY = clientY - editorDragState.startY;
    
    photo.settings.crop.x = editorDragState.offsetX + deltaX;
    photo.settings.crop.y = editorDragState.offsetY + deltaY;
    
    const img = document.getElementById('editor-image');
    img.style.left = `${photo.settings.crop.x}px`;
    img.style.top = `${photo.settings.crop.y}px`;
}

function endDrag() {
    editorDragState.isDragging = false;
}

function applyEditorChanges() {
    // Сохраняем размер рамки редактора для правильного отображения в превью
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (photo) {
        const cropFrame = document.getElementById('crop-frame');
        if (cropFrame) {
            photo.settings.editorFrameWidth = cropFrame.offsetWidth;
            photo.settings.editorFrameHeight = cropFrame.offsetHeight;
        }
    }
    
    closeEditor();
    renderPreviewPage();
    updateTotalPrice();
}

function applyCropToAll() {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;
    
    // Применяем только fullImage и filter
    // НЕ применяем: rotation, size (ориентация рамки), zoom, позицию
    const fullImage = photo.settings.fullImage;
    const filter = photo.settings.filter;
    
    // Получаем размер рамки редактора для корректного отображения в превью
    const cropFrame = document.getElementById('crop-frame');
    const editorFrameWidth = cropFrame ? cropFrame.offsetWidth : 400;
    const editorFrameHeight = cropFrame ? cropFrame.offsetHeight : 300;
    
    AppState.photos.forEach(p => {
        p.settings.fullImage = fullImage;
        p.settings.filter = filter;
        p.settings.wasEdited = true; // Помечаем как обработанное для превью
        p.settings.editorFrameWidth = editorFrameWidth;
        p.settings.editorFrameHeight = editorFrameHeight;
        // Сбрасываем позицию если включен режим с полями
        if (fullImage) {
            p.settings.crop.x = 0;
            p.settings.crop.y = 0;
        }
    });
    
    alert('Настройки применены ко всем фото');
}

// ==================== FULL IMAGE WARNING MODAL ====================
function initFullImageWarningModal() {
    // Добавляем модалку в DOM если её нет
    if (!document.getElementById('full-image-warning-modal')) {
        const modalHtml = `
        <div class="modal" id="full-image-warning-modal">
            <div class="modal-content">
                <button class="modal-close">&times;</button>
                <h2 class="modal-title">Информация</h2>
                <div class="info-content">
                    <p>При выборе «Полное изображение» фотография будет напечатана так, чтобы заполнить как минимум две стороны отпечатка, но на двух других сторонах могут появиться белые поля (см. ниже).</p>
                    <div class="full-image-examples">
                        <div class="full-image-example">
                            <div class="example-box cropped">
                                <div class="example-img"></div>
                            </div>
                            <span>С обрезкой</span>
                        </div>
                        <div class="full-image-example">
                            <div class="example-box with-fields">
                                <div class="example-img small"></div>
                                <div class="padding-indicator">×</div>
                            </div>
                            <span>С полями</span>
                        </div>
                    </div>
                </div>
                <button class="btn-apply-warning" id="btn-apply-warning">Применить</button>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
}

function showFullImageWarning(onConfirm, onCancel) {
    const modal = document.getElementById('full-image-warning-modal');
    const closeBtn = modal.querySelector('.modal-close');
    const applyBtn = document.getElementById('btn-apply-warning');
    
    modal.classList.add('active');
    
    const close = (confirmed) => {
        modal.classList.remove('active');
        if (confirmed) {
            onConfirm();
        } else {
            onCancel();
        }
    };
    
    closeBtn.onclick = () => close(false);
    applyBtn.onclick = () => close(true);
    modal.onclick = (e) => { if (e.target === modal) close(false); };
}

// ==================== INFO MODAL ====================
function initInfoModal() {
    const modal = document.getElementById('crop-info-modal');
    const closeBtn = modal?.querySelector('.modal-close');
    
    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
}

// ==================== ORDER MODAL ====================
function initOrderModal() {
    const modal = document.getElementById('order-modal');
    const closeBtn = modal?.querySelector('.modal-close');
    const orderBtn = document.getElementById('btn-order');
    const editLink = modal?.querySelector('.edit-order-link');
    
    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    
    editLink?.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.remove('active');
        goToStep(2);
    });
    
    orderBtn?.addEventListener('click', () => submitOrder());
}

function showOrderModal() {
    const modal = document.getElementById('order-modal');
    
    const projectName = document.getElementById('project-name')?.value || 'Проект печати';
    document.getElementById('order-project-name').textContent = projectName;
    
    // Группируем фото по размерам и считаем количество
    const sizeGroups = {};
    AppState.photos.forEach(p => {
        const size = p.settings.size;
        if (!sizeGroups[size]) {
            sizeGroups[size] = 0;
        }
        sizeGroups[size] += p.settings.quantity;
    });
    
    // Формируем строку с размерами
    const sizesInfo = Object.entries(sizeGroups)
        .map(([size, count]) => `${count} × ${size}`)
        .join(', ');
    
    // Общее количество фото
    const totalPhotos = AppState.photos.reduce((sum, p) => sum + p.settings.quantity, 0);
    
    document.getElementById('order-photos-count').textContent = `${totalPhotos} фото`;
    document.getElementById('order-size').textContent = sizesInfo;
    
    document.getElementById('order-cost').textContent = AppState.totalPrice;
    
    if (AppState.photos[0]) {
        document.getElementById('order-preview-thumb').style.backgroundImage = `url(${AppState.photos[0].url})`;
        document.getElementById('order-preview-thumb').style.backgroundSize = 'cover';
    }
    
    modal.classList.add('active');
}

async function submitOrder() {
    const token = localStorage.getItem('access');
    
    if (!token) {
        alert('Для оформления заказа необходимо войти в аккаунт');
        window.location.href = '/frontend/index.html';
        return;
    }
    
    const btnOrder = document.getElementById('btn-order');
    const originalText = btnOrder?.textContent;
    
    try {
        if (btnOrder) {
            btnOrder.textContent = 'Оформление...';
            btnOrder.disabled = true;
        }
        
        // Сохраняем имя проекта
        const projectName = document.getElementById('project-name')?.value || 'Проект печати';
        AppState.projectName = projectName;
        
        // Создаём заказ через API
        const order = await createOrderFromProject();
        
        alert(`Заказ ${order.order_number} успешно оформлен! Вы можете отслеживать его в личном кабинете.`);
        
        document.getElementById('order-modal').classList.remove('active');
        
        // Очистка
        AppState.photos = [];
        AppState.projectId = null;
        AppState.fullImageWarningShown = false;
        updatePhotosCount();
        goToStep(1);
        document.getElementById('upload-sources').style.display = 'flex';
        document.getElementById('uploaded-photos').style.display = 'none';
        document.getElementById('photos-grid').innerHTML = '';
        
    } catch (e) {
        console.error('Order failed:', e);
        alert('Ошибка при оформлении заказа. Попробуйте ещё раз.');
    } finally {
        if (btnOrder) {
            btnOrder.textContent = originalText;
            btnOrder.disabled = false;
        }
    }
}

// ==================== FOOTER BUTTONS ====================
function initFooterButtons() {
    const btnSave = document.getElementById('btn-save');
    const btnContinue = document.getElementById('btn-continue');
    
    btnSave?.addEventListener('click', () => handleSaveProject());
    
    btnContinue?.addEventListener('click', () => {
        if (AppState.currentStep === 3) {
            if (AppState.photos.length === 0) {
                alert('Добавьте фотографии для заказа');
                return;
            }
            showOrderModal();
        } else {
            if (AppState.photos.length === 0) {
                alert('Сначала загрузите фотографии');
                return;
            }
            goToStep(AppState.currentStep + 1);
        }
    });
}

async function handleSaveProject() {
    const projectName = document.getElementById('project-name')?.value || 'Проект печати';
    AppState.projectName = projectName;
    
    const btnSave = document.getElementById('btn-save');
    const originalText = btnSave?.textContent;
    
    try {
        if (btnSave) {
            btnSave.textContent = 'Сохранение...';
            btnSave.disabled = true;
        }
        
        await saveProject();
        alert('Проект сохранён!');
        
    } catch (e) {
        console.error('Save failed:', e);
        alert('Ошибка сохранения. Попробуйте позже.');
    } finally {
        if (btnSave) {
            btnSave.textContent = originalText;
            btnSave.disabled = false;
        }
    }
}
