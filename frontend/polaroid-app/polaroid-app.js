// ==================== POLAROID APP ====================

// API URL
const API_URL = 'http://127.0.0.1:8000/api';

// Polaroid frame specifications (all measurements in mm)
// Динамическое вычисление: 5.5мм сверху/слева/справа, 20% высоты снизу
const POLAROID_FRAME_PADDING = {
    top: 5.5,    // мм
    left: 5.5,   // мм
    right: 5.5,  // мм
    bottomPercent: 0.20  // 20% от высоты внешней рамки
};

// Состояние приложения
const AppState = {
    currentStep: 1,
    photos: [], // { id, file, url, name, width, height, aspectRatio, orientation, settings: {...} }
    sizes: [], // { value, label, price, ratio } - загружаются с API
    papers: [], // { value, label, coefficient } - загружаются с API
    projectId: null, // UUID проекта в БД
    projectName: 'Проект полароид-печати',
    totalPrice: 0,
    fullImageWarningShown: false, // показано ли предупреждение о полях
    sortOrder: 'asc', // 'asc' или 'desc'
    defaultSize: null, // размер из URL-параметров (со страницы polaroid-print.html)
    defaultPaper: null
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

// ==================== POLAROID SPEC HELPERS ====================

// Нормализует строку размера: русская "х" → латинская "x", запятые → точки
function normalizeSize(sizeValue) {
    if (!sizeValue || typeof sizeValue !== 'string') return sizeValue;
    return sizeValue.replace(/х/g, 'x').replace(/,/g, '.');
}

// Парсит размер и возвращает {w, h} или null если не удалось
function parseSize(sizeValue) {
    const normalized = normalizeSize(sizeValue);
    if (!normalized) return null;
    
    const parts = normalized.split('x');
    if (parts.length !== 2) return null;
    
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    
    if (isNaN(w) || isNaN(h)) return null;
    
    return { w, h };
}

// Форматирует размер с учётом ориентации фото.
// Возвращает размер в формате "ШxВ" где Ш и В корректно расположены для ориентации.
// Если парсинг не удался - возвращает исходное значение.
function formatSizeForOrientation(sizeValue, orientation) {
    const parsed = parseSize(sizeValue);
    if (!parsed) return sizeValue;
    
    const { w, h } = parsed;
    const smaller = Math.min(w, h);
    const larger = Math.max(w, h);
    
    if (orientation === 'landscape') {
        // Горизонтальное фото - большее число первым (ширина > высота)
        return `${larger}x${smaller}`;
    } else if (orientation === 'portrait') {
        // Вертикальное фото - меньшее число первым (ширина < высота)
        return `${smaller}x${larger}`;
    }
    // Квадратное или неизвестное - возвращаем нормализованное значение
    return normalizeSize(sizeValue);
}

// Динамически вычисляет спецификацию рамки полароида для любого размера.
// Размер в формате "ШИРИНАxВЫСОТА" (в см), например "9x16" = 90мм x 160мм
// Рамка: 5.5мм сверху/слева/справа, 20% высоты снизу
function getPolaroidSpec(sizeValue) {
    const parsed = parseSize(sizeValue);
    if (!parsed) return null;

    const { w: widthCm, h: heightCm } = parsed;

    if (widthCm <= 0 || heightCm <= 0) {
        return null;
    }

    // Конвертируем см в мм
    const outerW = widthCm * 10;
    const outerH = heightCm * 10;

    // Паддинги по правилам: 5.5мм сверху/слева/справа, 20% высоты снизу
    const padTop = POLAROID_FRAME_PADDING.top;
    const padLeft = POLAROID_FRAME_PADDING.left;
    const padRight = POLAROID_FRAME_PADDING.right;
    const padBottom = outerH * POLAROID_FRAME_PADDING.bottomPercent;

    // Область фото = внешний размер минус паддинги
    const photoW = outerW - padLeft - padRight;
    const photoH = outerH - padTop - padBottom;

    // Проверяем что область фото не отрицательная
    if (photoW <= 0 || photoH <= 0) {
        console.warn(`Invalid polaroid spec for size ${sizeValue}: photo area is negative`);
        return null;
    }

    return {
        outerW,
        outerH,
        photoW,
        photoH,
        padTop,
        padLeft,
        padRight,
        padBottom
    };
}

// ==================== LOAD PRINT OPTIONS ====================
async function loadPrintOptions() {
    try {
        // Загружаем конфиг с API для polaroid
        const res = await fetch(`${API_URL}/config/polaroid/`);
        if (!res.ok) throw new Error('Failed to load config');

        const config = await res.json();

        // Парсим размеры - используем width_cm и height_cm из API
        if (config.sizes && config.sizes.length > 0) {
            AppState.sizes = config.sizes.map(s => {
                const w = parseFloat(s.width_cm);
                const h = parseFloat(s.height_cm);
                // Формируем code из width_cm x height_cm если нужно
                const code = `${w}x${h}`;
                return {
                    value: code,
                    label: s.name,
                    price: parseFloat(s.price),
                    width: w,
                    height: h,
                    ratio: (isNaN(w) || isNaN(h)) ? 1 : Math.max(w, h) / Math.min(w, h)
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

        console.log('Loaded polaroid sizes from API:', AppState.sizes);
        console.log('Loaded papers from API:', AppState.papers);

    } catch (e) {
        console.error('Failed to load polaroid options from API:', e);
        // Fallback - дефолтные значения размеров
        AppState.sizes = [
            { value: '9x16', label: '9 x 16 см', price: 30, width: 9, height: 16, ratio: 16 / 9 },
            { value: '12x15', label: '12 x 15 см', price: 35, width: 12, height: 15, ratio: 15 / 12 },
            { value: '7.5x13', label: '7.5 x 13 см', price: 25, width: 7.5, height: 13, ratio: 13 / 7.5 },
            { value: '8.8x10.7', label: '8.8 x 10.7 см', price: 28, width: 8.8, height: 10.7, ratio: 10.7 / 8.8 },
            { value: '7x10', label: '7 x 10 см', price: 20, width: 7, height: 10, ratio: 10 / 7 },
            { value: '6x9', label: '6 x 9 см', price: 18, width: 6, height: 9, ratio: 9 / 6 },
            { value: '5.5x7.5', label: '5.5 x 7.5 см', price: 15, width: 5.5, height: 7.5, ratio: 7.5 / 5.5 }
        ];
        AppState.papers = [
            { value: 'glossy', label: 'Глянцевая', coefficient: 1.0 },
            { value: 'matte', label: 'Матовая', coefficient: 1.0 }
        ];
    }

    // Применяем параметры из URL (размер/бумага со страницы polaroid-print.html)
    applyUrlParams();
}

// Читаем URL-параметры и сохраняем выбранный размер/бумагу
function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const size = params.get('size');
    const paper = params.get('paper');

    if (size) {
        // Ищем размер в загруженных
        const sizeData = AppState.sizes.find(s => {
            const parts = size.split('x');
            if (parts.length !== 2) return false;
            const w = parseFloat(parts[0]);
            const h = parseFloat(parts[1]);
            return (Math.abs(s.width - w) < 0.01 && Math.abs(s.height - h) < 0.01) ||
                   (Math.abs(s.width - h) < 0.01 && Math.abs(s.height - w) < 0.01);
        });
        if (sizeData) {
            AppState.defaultSize = sizeData.value;
        }
    }

    if (paper) {
        const paperData = AppState.papers.find(p => p.value === paper);
        if (paperData) {
            AppState.defaultPaper = paper;
        }
    }

    console.log('URL params applied:', { defaultSize: AppState.defaultSize, defaultPaper: AppState.defaultPaper });
}

// Поиск данных размера с учётом ориентации (9x16 и 16x9 — один размер)
function findSizeData(sizeValue) {
    if (!sizeValue) return null;
    
    // Пробуем прямое совпадение
    let data = AppState.sizes.find(s => s.value === sizeValue);
    if (data) return data;

    // Парсим входной размер
    const parts = sizeValue.split('x');
    if (parts.length !== 2) return null;
    
    const a = parseFloat(parts[0]);
    const b = parseFloat(parts[1]);
    
    if (isNaN(a) || isNaN(b)) return null;
    
    // Ищем по width/height с учётом ориентации
    return AppState.sizes.find(s => {
        const sw = s.width;
        const sh = s.height;
        // Сравниваем оба варианта ориентации
        return (Math.abs(sw - a) < 0.01 && Math.abs(sh - b) < 0.01) ||
               (Math.abs(sw - b) < 0.01 && Math.abs(sh - a) < 0.01);
    });
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
                serverId: p.serverId || null,
                name: p.name,
                width: p.width,
                height: p.height,
                url: p.url,
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
                product_type: 4, // polaroid
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
    // For polaroid, the ratio is based on the photo area, not the outer frame
    const spec = getPolaroidSpec(sizeValue);
    if (spec) {
        return Math.max(spec.photoW, spec.photoH) / Math.min(spec.photoW, spec.photoH);
    }
    const parsed = parseSize(sizeValue);
    if (!parsed) return 1;
    return Math.max(parsed.w, parsed.h) / Math.min(parsed.w, parsed.h);
}

function getSizeDimensions(sizeValue, photoOrientation) {
    const parsed = parseSize(sizeValue);
    if (!parsed) return { width: 0, height: 0 };
    
    const { w, h } = parsed;
    // Если фото горизонтальное, большая сторона - ширина
    if (photoOrientation === 'landscape') {
        return { width: Math.max(w, h), height: Math.min(w, h) };
    }
    // Если вертикальное - большая сторона - высота
    return { width: Math.min(w, h), height: Math.max(w, h) };
}

function getPhotoAreaRatio(sizeValue) {
    // Returns the photo area ratio (width/height) for the given size, considering orientation
    const spec = getPolaroidSpec(sizeValue);
    if (spec) {
        return spec.photoW / spec.photoH;
    }
    const parsed = parseSize(sizeValue);
    if (!parsed) return 1;
    return parsed.w / parsed.h;
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

    // Скрываем кнопку "добавить" на шагах 2 и 3
    const btnAddMore = document.getElementById('btn-add-more');
    if (btnAddMore) {
        btnAddMore.style.display = step === 1 ? '' : 'none';
    }

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
    // Выбираем размер: сначала из URL-параметров, потом первый из списка
    const defaultSize = AppState.defaultSize || AppState.sizes[0]?.value || '9x16';
    const size = formatSizeForOrientation(defaultSize, orientation);

    return {
        size: size,
        paper: AppState.defaultPaper || AppState.papers[0]?.value || 'glossy',
        quantity: 1,
        crop: { x: 0, y: 0, zoom: 100 },
        rotation: 0,
        filter: 'original',
        fullImage: false,
        wasEdited: false
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
            <span class="photo-check">\u2713</span>
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

        // Размеры для отображения берём из sizeData или парсим из size
        let sizeWidth, sizeHeight;
        if (sizeData && sizeData.width && sizeData.height) {
            // Используем готовые данные из API
            if (photo.orientation === 'landscape') {
                sizeWidth = Math.max(sizeData.width, sizeData.height);
                sizeHeight = Math.min(sizeData.width, sizeData.height);
            } else {
                sizeWidth = Math.min(sizeData.width, sizeData.height);
                sizeHeight = Math.max(sizeData.width, sizeData.height);
            }
        } else {
            // Fallback - парсим из строки
            const parts = photo.settings.size.split('x');
            sizeWidth = parseFloat(parts[0]) || 0;
            sizeHeight = parseFloat(parts[1]) || 0;
        }

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
                                // Сравниваем по width/height с учётом ориентации
                                const sw = s.width;
                                const sh = s.height;
                                const match = (Math.abs(sw - sizeWidth) < 0.01 && Math.abs(sh - sizeHeight) < 0.01) ||
                                              (Math.abs(sw - sizeHeight) < 0.01 && Math.abs(sh - sizeWidth) < 0.01);
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
                        <label>Кол-во</label>
                        <input type="number" class="setting-quantity" data-id="${photo.id}"
                            value="${photo.settings.quantity}" min="1">
                    </div>
                    <div class="photo-settings-price">
                        <label>Цена</label>
                        <span>${price} руб.</span>
                    </div>
                    <button class="photo-settings-delete" data-id="${photo.id}">\uD83D\uDDD1\uFE0F</button>
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
            renderSettingsPage();
        });
    });

    list.querySelectorAll('.setting-paper').forEach(select => {
        select.addEventListener('change', (e) => {
            updatePhotoSetting(e.target.dataset.id, 'paper', e.target.value);
            renderSettingsPage();
        });
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
        if (key === 'size') {
            // Форматируем размер с учётом ориентации фото
            photo.settings.size = formatSizeForOrientation(value, photo.orientation);
            // Сбрасываем crop при смене размера
            photo.settings.crop = { x: 0, y: 0, zoom: 100 };
        } else {
            photo.settings[key] = value;
        }
        updateTotalPrice();
    }
}

function applySettingsFromPhoto(photoId) {
    const photo = AppState.photos.find(p => p.id === photoId);
    if (!photo) return;

    // Копируем настройки с выбранного фото на все остальные
    const settings = {
        paper: photo.settings.paper,
        quantity: photo.settings.quantity
    };

    // Базовый размер для применения ко всем
    const baseSize = photo.settings.size;

    AppState.photos.forEach(p => {
        // Применяем общие настройки
        p.settings.paper = settings.paper;
        p.settings.quantity = settings.quantity;

        // Размер применяем с учётом ориентации каждого фото
        p.settings.size = formatSizeForOrientation(baseSize, p.orientation);
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
    const loadedCount = AppState.photos.length;
    const toPrintCount = AppState.photos.reduce((sum, p) => sum + p.settings.quantity, 0);
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

    grid.querySelectorAll('.preview-photo-polaroid').forEach(thumb => {
        thumb.addEventListener('click', () => openEditor(thumb.dataset.id));
    });
}

function renderPreviewPhoto(photo) {
    const needsReview = needsCropping(photo);
    const spec = getPolaroidSpec(photo.settings.size);

    // Стили для фильтров
    let filterStyle = '';
    if (photo.settings.filter === 'grayscale') {
        filterStyle = 'filter: grayscale(100%);';
    } else if (photo.settings.filter === 'sepia') {
        filterStyle = 'filter: sepia(100%);';
    }

    // Иконка редактирования
    const isModified = photo.settings.filter !== 'original' ||
                       photo.settings.rotation !== 0 ||
                       photo.settings.fullImage ||
                       photo.settings.crop.zoom !== 100 ||
                       photo.settings.crop.x !== 0 ||
                       photo.settings.crop.y !== 0;

    const editedIcon = isModified ? '<div class="edited-icon" title="Фото изменено">\u270E</div>' : '';
    const fullImageIcon = photo.settings.fullImage ? '<div class="fullimage-icon" title="С полями">\u25A2</div>' : '';

    if (!spec) {
        // Fallback if no polaroid spec found - render as simple preview
        return `
            <div class="preview-photo-item">
                <div class="preview-photo-thumb preview-original" data-id="${photo.id}" style="cursor: pointer;">
                    <img src="${photo.url}" alt="${photo.name}" style="${filterStyle}">
                    ${editedIcon}
                    ${fullImageIcon}
                </div>
                <div class="preview-photo-name">${photo.name}</div>
                <a href="#" class="preview-photo-edit" data-id="${photo.id}">редактировать</a>
            </div>
        `;
    }

    // Polaroid preview card
    // Scale the polaroid frame to fit in preview area
    const previewMaxWidth = 180;
    const previewMaxHeight = 220;

    const outerRatio = spec.outerW / spec.outerH;
    let outerDisplayW, outerDisplayH;

    if (previewMaxWidth / previewMaxHeight > outerRatio) {
        outerDisplayH = previewMaxHeight;
        outerDisplayW = outerDisplayH * outerRatio;
    } else {
        outerDisplayW = previewMaxWidth;
        outerDisplayH = outerDisplayW / outerRatio;
    }

    // Scale factor from mm to display pixels
    const scale = outerDisplayW / spec.outerW;

    const padTop = spec.padTop * scale;
    const padLeft = spec.padLeft * scale;
    const padRight = spec.padRight * scale;
    const padBottom = spec.padBottom * scale;
    const photoDisplayW = spec.photoW * scale;
    const photoDisplayH = spec.photoH * scale;

    // Calculate image sizing within the photo area
    const imgRatio = photo.width / photo.height;
    const photoAreaRatio = spec.photoW / spec.photoH;
    const zoom = photo.settings.crop.zoom / 100;

    let imgWidth, imgHeight, imgLeft, imgTop;

    if (photo.settings.fullImage) {
        // Fit entire image with letterboxing
        if (imgRatio > photoAreaRatio) {
            imgWidth = photoDisplayW;
            imgHeight = photoDisplayW / imgRatio;
        } else {
            imgHeight = photoDisplayH;
            imgWidth = photoDisplayH * imgRatio;
        }
        imgLeft = (photoDisplayW - imgWidth) / 2;
        imgTop = (photoDisplayH - imgHeight) / 2;
    } else {
        // Fill with cropping
        if (imgRatio > photoAreaRatio) {
            imgHeight = photoDisplayH * zoom;
            imgWidth = imgHeight * imgRatio;
        } else {
            imgWidth = photoDisplayW * zoom;
            imgHeight = imgWidth / imgRatio;
        }
        // Apply crop offset proportionally
        const editorFrameWidth = photo.settings.editorFrameWidth || 400;
        const cropScale = photoDisplayW / editorFrameWidth;
        imgLeft = photo.settings.crop.x * cropScale;
        imgTop = photo.settings.crop.y * cropScale;
    }

    const rotateStyle = photo.settings.rotation !== 0 ? `transform: rotate(${photo.settings.rotation}deg);` : '';
    const bgColor = photo.settings.fullImage ? '#f0f0f0' : 'transparent';

    // Crop indicators for photos not yet edited
    let cropIndicator = '';
    if (!photo.settings.wasEdited && needsReview) {
        if (imgRatio > photoAreaRatio) {
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

    // Build the polaroid card HTML
    // If not yet edited, show image filling the photo area with center crop
    let photoInnerHtml;
    if (!photo.settings.wasEdited) {
        // Simple img covering the photo area
        photoInnerHtml = `
            <div class="polaroid-inner" style="width: ${photoDisplayW}px; height: ${photoDisplayH}px; background: ${bgColor};">
                <img src="${photo.url}" alt="${photo.name}" style="width: 100%; height: 100%; object-fit: cover; ${filterStyle} ${rotateStyle}">
                ${cropIndicator}
                ${editedIcon}
                ${fullImageIcon}
            </div>
        `;
    } else {
        // Positioned img based on editor crop settings
        photoInnerHtml = `
            <div class="polaroid-inner" style="width: ${photoDisplayW}px; height: ${photoDisplayH}px; background: ${bgColor};">
                <img src="${photo.url}" alt="${photo.name}"
                     style="position: absolute; width: ${imgWidth}px; height: ${imgHeight}px; left: ${imgLeft}px; top: ${imgTop}px; ${filterStyle} ${rotateStyle}">
                ${editedIcon}
                ${fullImageIcon}
            </div>
        `;
    }

    const reviewBorder = needsReview && !photo.settings.fullImage ? 'border: 2px solid #f39c12;' : '';

    return `
        <div class="preview-photo-item">
            <div class="preview-photo-polaroid" data-id="${photo.id}"
                 style="padding: ${padTop}px ${padRight}px ${padBottom}px ${padLeft}px; ${reviewBorder}">
                ${photoInnerHtml}
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
    const polaroidFrame = document.getElementById('polaroid-frame');
    const cropFrame = document.getElementById('crop-frame');
    const img = document.getElementById('editor-image');
    if (polaroidFrame) {
        polaroidFrame.style.width = '';
        polaroidFrame.style.height = '';
        polaroidFrame.style.padding = '';
    }
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

    // Размеры в селекте - находим текущий размер фото
    const sizeSelect = document.getElementById('editor-size');
    const currentSizeData = findSizeData(photo.settings.size);
    
    sizeSelect.innerHTML = AppState.sizes.map(s => {
        // Сравниваем по width/height
        let match = false;
        if (currentSizeData) {
            match = (Math.abs(s.width - currentSizeData.width) < 0.01 && 
                     Math.abs(s.height - currentSizeData.height) < 0.01);
        }
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
    const polaroidFrame = document.getElementById('polaroid-frame');
    const cropFrame = document.getElementById('crop-frame');
    const img = document.getElementById('editor-image');

    // Сбрасываем стили img перед рендером
    img.style.width = '';
    img.style.height = '';
    img.style.left = '0';
    img.style.top = '0';
    img.style.transform = '';
    img.style.filter = '';

    // Get the polaroid spec for the current size
    const spec = getPolaroidSpec(photo.settings.size);

    if (!spec) {
        // Fallback: render without polaroid frame (shouldn't happen normally)
        polaroidFrame.style.padding = '0';
        polaroidFrame.style.background = 'transparent';
        polaroidFrame.style.boxShadow = 'none';

        const parsed = parseSize(photo.settings.size);
        const frameWidth = parsed?.w || 10;
        const frameHeight = parsed?.h || 10;
        const frameRatio = frameWidth / frameHeight;

        const canvasRect = canvas.getBoundingClientRect();
        const maxWidth = canvasRect.width - 40;
        const maxHeight = canvasRect.height - 40;

        let displayFrameWidth, displayFrameHeight;
        if (maxWidth / maxHeight > frameRatio) {
            displayFrameHeight = maxHeight;
            displayFrameWidth = displayFrameHeight * frameRatio;
        } else {
            displayFrameWidth = maxWidth;
            displayFrameHeight = displayFrameWidth / frameRatio;
        }

        polaroidFrame.style.width = `${displayFrameWidth}px`;
        polaroidFrame.style.height = `${displayFrameHeight}px`;
        cropFrame.style.width = `${displayFrameWidth}px`;
        cropFrame.style.height = `${displayFrameHeight}px`;

        renderImageInCropFrame(photo, displayFrameWidth, displayFrameHeight, frameRatio);
        return;
    }

    // Outer polaroid dimensions in mm
    const outerW = spec.outerW;
    const outerH = spec.outerH;
    const outerRatio = outerW / outerH;

    // Canvas available space
    const canvasRect = canvas.getBoundingClientRect();
    const maxWidth = canvasRect.width - 40;
    const maxHeight = canvasRect.height - 40;

    // Scale the outer frame to fit the canvas
    let displayOuterW, displayOuterH;
    if (maxWidth / maxHeight > outerRatio) {
        displayOuterH = maxHeight;
        displayOuterW = displayOuterH * outerRatio;
    } else {
        displayOuterW = maxWidth;
        displayOuterH = displayOuterW / outerRatio;
    }

    // Scale factor from mm to display pixels
    const scale = displayOuterW / outerW;

    // Calculate display padding
    const displayPadTop = spec.padTop * scale;
    const displayPadLeft = spec.padLeft * scale;
    const displayPadRight = spec.padRight * scale;
    const displayPadBottom = spec.padBottom * scale;

    // Photo area dimensions
    const displayPhotoW = spec.photoW * scale;
    const displayPhotoH = spec.photoH * scale;

    // Set the polaroid frame dimensions and padding
    polaroidFrame.style.width = `${displayOuterW}px`;
    polaroidFrame.style.height = `${displayOuterH}px`;
    polaroidFrame.style.padding = `${displayPadTop}px ${displayPadRight}px ${displayPadBottom}px ${displayPadLeft}px`;
    polaroidFrame.style.background = '#fff';
    polaroidFrame.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';

    // Set the crop-frame (photo area) dimensions
    cropFrame.style.width = `${displayPhotoW}px`;
    cropFrame.style.height = `${displayPhotoH}px`;

    // Photo area ratio for image fitting
    const photoAreaRatio = spec.photoW / spec.photoH;

    // Render the image inside the crop-frame
    renderImageInCropFrame(photo, displayPhotoW, displayPhotoH, photoAreaRatio);
}

function renderImageInCropFrame(photo, displayFrameWidth, displayFrameHeight, frameRatio) {
    const cropFrame = document.getElementById('crop-frame');
    const img = document.getElementById('editor-image');

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

            // Центрируем
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

            // Центрируем изображение, затем применяем смещение пользователя
            const centerOffsetX = (displayFrameWidth - imgWidth) / 2;
            const centerOffsetY = (displayFrameHeight - imgHeight) / 2;

            img.style.width = `${imgWidth}px`;
            img.style.height = `${imgHeight}px`;
            img.style.left = `${centerOffsetX + photo.settings.crop.x}px`;
            img.style.top = `${centerOffsetY + photo.settings.crop.y}px`;
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
    img.onload = null;
    img.src = '';

    img.onload = () => {
        const currentPhoto = AppState.photos[currentEditorPhotoIndex];
        if (currentPhoto && currentPhoto.id === photo.id) {
            applyImageStyles();
        }
    };

    img.src = photo.url;

    // Если изображение уже в кэше
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
        // Форматируем размер с учётом ориентации фото
        photo.settings.size = formatSizeForOrientation(size, photo.orientation);

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

    // Меняем местами числа в размере (9x16 -> 16x9)
    const parts = photo.settings.size.split('x');
    const a = parseFloat(parts[0]);
    const b = parseFloat(parts[1]);
    photo.settings.size = `${b}x${a}`;

    // Сбрасываем crop при повороте рамки
    photo.settings.crop = { x: 0, y: 0, zoom: 100 };
    document.getElementById('editor-zoom').value = 100;

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
    const fullImage = photo.settings.fullImage;
    const filter = photo.settings.filter;

    // Получаем размер рамки редактора для корректного отображения в превью
    const cropFrame = document.getElementById('crop-frame');
    const editorFrameWidth = cropFrame ? cropFrame.offsetWidth : 400;
    const editorFrameHeight = cropFrame ? cropFrame.offsetHeight : 300;

    AppState.photos.forEach(p => {
        p.settings.fullImage = fullImage;
        p.settings.filter = filter;
        p.settings.wasEdited = true;
        p.settings.editorFrameWidth = editorFrameWidth;
        p.settings.editorFrameHeight = editorFrameHeight;
        if (fullImage) {
            p.settings.crop.x = 0;
            p.settings.crop.y = 0;
        }
    });

    alert('Настройки применены ко всем фото');
}

// ==================== FULL IMAGE WARNING MODAL ====================
function initFullImageWarningModal() {
    if (!document.getElementById('full-image-warning-modal')) {
        const modalHtml = `
        <div class="modal" id="full-image-warning-modal">
            <div class="modal-content">
                <button class="modal-close">&times;</button>
                <h2 class="modal-title">Информация</h2>
                <div class="info-content">
                    <p>При выборе \u00ABПолное изображение\u00BB фотография будет напечатана так, чтобы заполнить как минимум две стороны отпечатка, но на двух других сторонах могут появиться белые поля (см. ниже).</p>
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
                                <div class="padding-indicator">\u00D7</div>
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

    const projectName = document.getElementById('project-name')?.value || 'Проект полароид-печати';
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
        .map(([size, count]) => `${count} \u00D7 ${size}`)
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
        const projectName = document.getElementById('project-name')?.value || 'Проект полароид-печати';
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
    const projectName = document.getElementById('project-name')?.value || 'Проект полароид-печати';
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
