// ==================== CANVAS APP ====================

// API URL
const API_URL = 'http://127.0.0.1:8000/api';

// Quality constants for DPI check
const MIN_DPI = 150;  // good quality
const WARN_DPI = 100; // acceptable but warning

// Состояние приложения
const AppState = {
    currentStep: 1,
    photos: [], // { id, file, url, name, width, height, aspectRatio, orientation, settings: {...} }
    sizes: [], // { value, label, price, ratio } - загружаются с API
    papers: [], // { value, label, coefficient } - загружаются с API
    projectId: null, // UUID проекта в БД
    projectName: 'Проект печати на холсте',
    totalPrice: 0,
    fullImageWarningShown: false, // показано ли предупреждение о полях
    sortOrder: 'asc' // 'asc' или 'desc'
};

// Стандартные соотношения сторон для холста
const PRINT_RATIOS = {
    '30x40': 1.333,
    '40x60': 1.5,
    '50x70': 1.4,
    '60x80': 1.333,
    '60x90': 1.5,
    '80x120': 1.5,
    '50x50': 1,
    '60x60': 1,
    '80x80': 1
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
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

// ==================== LOAD PRINT OPTIONS ====================
async function loadPrintOptions() {
    try {
        // Загружаем конфиг с API
        const res = await fetch(`${API_URL}/config/canvas/`);
        if (!res.ok) throw new Error('Failed to load config');

        const config = await res.json();

        // Парсим размеры - используем width_cm и height_cm из API
        if (config.sizes && config.sizes.length > 0) {
            AppState.sizes = config.sizes.map(s => {
                const w = parseFloat(s.width_cm);
                const h = parseFloat(s.height_cm);
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

        console.log('Loaded sizes from API:', AppState.sizes);
        console.log('Loaded papers from API:', AppState.papers);

    } catch (e) {
        console.error('Failed to load canvas options from API:', e);
        // Fallback - дефолтные значения для холста
        AppState.sizes = [
            { value: '30x40', label: '30 × 40 см', price: 2500, width: 30, height: 40, ratio: 1.333 },
            { value: '40x60', label: '40 × 60 см', price: 3500, width: 40, height: 60, ratio: 1.5 },
            { value: '50x70', label: '50 × 70 см', price: 4500, width: 50, height: 70, ratio: 1.4 },
            { value: '60x80', label: '60 × 80 см', price: 5500, width: 60, height: 80, ratio: 1.333 },
            { value: '60x90', label: '60 × 90 см', price: 6500, width: 60, height: 90, ratio: 1.5 }
        ];
        AppState.papers = [
            { value: 'cotton', label: 'Хлопок', coefficient: 1.0 },
            { value: 'synthetic', label: 'Синтетика', coefficient: 0.8 }
        ];
    }
}

// ==================== QUALITY CHECK ====================
// Helper: get size dimensions from sizeData or parse from string
function getSizeDimensionsCm(sizeValue) {
    const sizeData = findSizeData(sizeValue);
    if (sizeData && sizeData.width && sizeData.height) {
        return { width: sizeData.width, height: sizeData.height };
    }
    // Fallback - parse from string
    const parts = sizeValue.split('x');
    const a = parseFloat(parts[0]) || 0;
    const b = parseFloat(parts[1]) || 0;
    return { width: a, height: b };
}

// Check photo quality (DPI) for the current canvas size
function checkPhotoQuality(photo) {
    const sizeCm = getSizeDimensionsCm(photo.settings.size);

    // Calculate DPI for each dimension
    const dpiWidth = photo.width / (sizeCm.width / 2.54);
    const dpiHeight = photo.height / (sizeCm.height / 2.54);
    const effectiveDPI = Math.min(dpiWidth, dpiHeight);

    let level, message;

    if (effectiveDPI >= MIN_DPI) {
        level = 'good';
        message = 'Отличное качество (' + Math.round(effectiveDPI) + ' DPI)';
    } else if (effectiveDPI >= WARN_DPI) {
        level = 'warning';
        message = 'Приемлемое качество (' + Math.round(effectiveDPI) + ' DPI). Рекомендуется выбрать меньший размер.';
    } else {
        level = 'bad';
        message = 'Низкое качество (' + Math.round(effectiveDPI) + ' DPI). Фото может быть размытым при печати.';
    }

    return { dpi: Math.round(effectiveDPI), level: level, message: message };
}

// Поиск данных размера с учётом ориентации (30x40 и 40x30 — один размер)
function findSizeData(sizeValue) {
    if (!sizeValue) return null;
    
    // Прямое совпадение
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
        return (Math.abs(s.width - a) < 0.01 && Math.abs(s.height - b) < 0.01) ||
               (Math.abs(s.width - b) < 0.01 && Math.abs(s.height - a) < 0.01);
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

        const token = localStorage.getItem('access');
        if (!token) {
            console.log('No token, cannot save to server');
            return null;
        }

        // ШАГ 1: Если нет projectId - сначала создаём проект
        if (!AppState.projectId) {
            const initialProjectData = {
                name: AppState.projectName,
                product_type: 5, // canvas
                data: { photos: [] },
                total_price: 0
            };
            
            const createRes = await fetch(`${API_URL}/projects/`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify(initialProjectData)
            });
            
            if (!createRes.ok) {
                throw new Error('Failed to create project');
            }
            
            const createdProject = await createRes.json();
            AppState.projectId = createdProject.id;
            console.log('Project created:', AppState.projectId);
        }

        // ШАГ 2: Загружаем фото на сервер (теперь с projectId)
        await uploadPhotosToServer();

        // ШАГ 3: Обновляем проект с данными фото
        const projectData = {
            photos: AppState.photos.map(p => ({
                id: p.id,
                serverId: p.serverId || null,
                name: p.name,
                width: p.width,
                height: p.height,
                url: p.serverUrl || p.url,
                settings: p.settings
            }))
        };

        const body = {
            name: AppState.projectName,
            data: projectData,
            total_price: AppState.totalPrice,
            preview_url: AppState.photos[0]?.serverUrl || AppState.photos[0]?.url || null
        };
        
        const res = await fetch(`${API_URL}/projects/${AppState.projectId}/`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Server response:', err);
            throw new Error('Failed to save project');
        }

        const project = await res.json();
        console.log('Project saved:', project);
        return project;

    } catch (e) {
        console.error('Failed to save project:', e);
        throw e;
    }
}

// Загрузить все фото на сервер
async function uploadPhotosToServer() {
    const token = localStorage.getItem('access');
    if (!token) return;

    const photosToUpload = AppState.photos.filter(p => 
        p.url && p.url.startsWith('blob:') && !p.serverUrl && (p.file || p.originalFile)
    );
    
    if (photosToUpload.length === 0) {
        console.log('No photos to upload');
        return;
    }
    
    console.log(`Uploading ${photosToUpload.length} photos to server...`);
    
    for (const photo of photosToUpload) {
        try {
            const formData = new FormData();
            
            // Отправляем сконвертированный файл (JPEG) если есть
            const fileToUpload = photo.file || photo.originalFile;
            
            // Имя файла - меняем расширение на .jpg если был сконвертирован
            let fileName = photo.name;
            if (photo.file && photo.originalFile && photo.file !== photo.originalFile) {
                fileName = photo.name.replace(/\.(heic|heif|tiff|tif)$/i, '.jpg');
            }
            
            formData.append('file', fileToUpload, fileName);
            
            if (AppState.projectId) {
                formData.append('project_id', AppState.projectId);
            }
            
            const res = await fetch(`${API_URL}/photos/upload/`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include',
                body: formData
            });
            
            if (res.ok) {
                const uploadedPhoto = await res.json();
                photo.serverUrl = uploadedPhoto.url;
                photo.serverId = uploadedPhoto.id;
                console.log('Photo uploaded:', fileName, uploadedPhoto.url);
            } else {
                console.error('Failed to upload photo:', photo.name);
            }
        } catch (error) {
            console.error('Photo upload error:', photo.name, error);
        }
    }
}

// Загрузить одно фото на сервер (legacy)
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
function getImageDimensions(fileOrBlob) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            resolve({ width: 0, height: 0 });
        };
        img.src = URL.createObjectURL(fileOrBlob);
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
        // Проверяем формат
        const ext = file.name.split('.').pop().toLowerCase();
        const allowedFormats = ['jpg', 'jpeg', 'png', 'bmp', 'heic', 'heif', 'webp', 'tiff', 'tif'];
        if (!allowedFormats.includes(ext) && !file.type.startsWith('image/')) continue;

        try {
            // Обрабатываем файл (конвертируем HEIC/TIFF если нужно)
            const processedFile = await processImageFile(file);
            
            const id = Date.now() + Math.random().toString(36).substr(2, 9);
            const url = URL.createObjectURL(processedFile.blob);

            // Получаем размеры изображения
            const dimensions = await getImageDimensions(processedFile.blob);
            const aspectRatio = calculateAspectRatio(dimensions.width, dimensions.height);
            const orientation = getOrientation(dimensions.width, dimensions.height);

            AppState.photos.push({
                id,
                file: processedFile.blob,          // Сконвертированный файл
                originalFile: file,                 // Оригинальный файл
                url,
                name: file.name,
                width: dimensions.width,
                height: dimensions.height,
                aspectRatio,
                orientation,
                settings: getDefaultSettings(orientation)
            });
        } catch (e) {
            console.error(`Error processing ${file.name}:`, e);
        }
    }

    updatePhotosCount();
    renderUploadedPhotos();
    showUploadedPhotos();
}

// Обработка файла - конвертация HEIC/TIFF в отображаемый формат
async function processImageFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    // HEIC/HEIF
    if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
        if (typeof heic2any !== 'undefined') {
            try {
                const result = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.92
                });
                const convertedBlob = Array.isArray(result) ? result[0] : result;
                console.log('HEIC converted successfully');
                return { blob: convertedBlob, converted: true };
            } catch (e) {
                console.warn('heic2any failed:', e.message);
            }
        }
        
        try {
            const canvasBlob = await convertViaCanvas(file);
            if (canvasBlob) {
                return { blob: canvasBlob, converted: true };
            }
        } catch (e) {
            console.warn('Canvas fallback failed');
        }
        
        return { blob: file, converted: false };
    }
    
    // TIFF
    if (ext === 'tiff' || ext === 'tif' || file.type === 'image/tiff') {
        if (typeof UTIF !== 'undefined') {
            try {
                const convertedBlob = await convertTiffWithUTIF(file);
                return { blob: convertedBlob, converted: true };
            } catch (e) {
                console.warn('UTIF conversion failed:', e.message);
            }
        }
        
        try {
            const canvasBlob = await convertViaCanvas(file);
            if (canvasBlob) {
                return { blob: canvasBlob, converted: true };
            }
        } catch (e) {
            console.warn('Canvas fallback for TIFF failed');
        }
        
        return { blob: file, converted: false };
    }
    
    return { blob: file, converted: false };
}

// Конвертация через canvas
function convertViaCanvas(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                
                if (canvas.width === 0 || canvas.height === 0) {
                    URL.revokeObjectURL(url);
                    resolve(null);
                    return;
                }
                
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    resolve(blob);
                }, 'image/jpeg', 0.92);
            } catch (e) {
                URL.revokeObjectURL(url);
                resolve(null);
            }
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        
        img.src = url;
    });
}

// Конвертация TIFF через UTIF.js
async function convertTiffWithUTIF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const ifds = UTIF.decode(e.target.result);
                UTIF.decodeImage(e.target.result, ifds[0]);
                const rgba = UTIF.toRGBA8(ifds[0]);
                
                const canvas = document.createElement('canvas');
                canvas.width = ifds[0].width;
                canvas.height = ifds[0].height;
                const ctx = canvas.getContext('2d');
                const imageData = ctx.createImageData(canvas.width, canvas.height);
                imageData.data.set(rgba);
                ctx.putImageData(imageData, 0, 0);
                
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.92);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function getDefaultSettings(orientation) {
    // Выбираем первый доступный размер
    const defaultSize = AppState.sizes[0]?.value || '30x40';
    const [a, b] = defaultSize.split('x').map(Number);

    let size;
    if (orientation === 'landscape') {
        // Горизонтальное фото - большее число первым
        size = `${Math.max(a, b)}x${Math.min(a, b)}`;
    } else if (orientation === 'portrait') {
        // Вертикальное фото - меньшее число первым
        size = `${Math.min(a, b)}x${Math.max(a, b)}`;
    } else {
        // Квадратное - как есть
        size = defaultSize;
    }

    return {
        size: size,
        paper: AppState.papers[0]?.value || 'cotton',
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

        const basePrice = sizeData?.price || 2500;
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

        const basePrice = sizeData?.price || 2500;
        const coefficient = paperData?.coefficient || 1.0;
        const price = Math.round(basePrice * coefficient * photo.settings.quantity);

        // Размеры для отображения берём из sizeData
        let sizeWidth, sizeHeight;
        if (sizeData && sizeData.width && sizeData.height) {
            if (photo.orientation === 'landscape') {
                sizeWidth = Math.max(sizeData.width, sizeData.height);
                sizeHeight = Math.min(sizeData.width, sizeData.height);
            } else {
                sizeWidth = Math.min(sizeData.width, sizeData.height);
                sizeHeight = Math.max(sizeData.width, sizeData.height);
            }
        } else {
            const parts = photo.settings.size.split('x');
            sizeWidth = parseFloat(parts[0]) || 0;
            sizeHeight = parseFloat(parts[1]) || 0;
        }

        // Quality check
        const quality = checkPhotoQuality(photo);

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
                                const match = sizeData && 
                                    (Math.abs(s.width - sizeData.width) < 0.01 && Math.abs(s.height - sizeData.height) < 0.01);
                                return `<option value="${s.value}" ${match ? 'selected' : ''}>${s.label}</option>`;
                            }).join('')}
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
                    <button class="photo-settings-delete" data-id="${photo.id}">🗑️</button>
                </div>
                <div class="quality-indicator">
                    <span class="quality-badge quality-${quality.level}">${quality.dpi} DPI — ${quality.level === 'good' ? 'Отлично' : quality.level === 'warning' ? 'Приемлемо' : 'Низкое качество'}</span>
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
        photo.settings[key] = value;
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

    // Получаем базовый размер (без учёта ориентации)
    const [a, b] = photo.settings.size.split('x').map(Number);
    const baseWidth = Math.min(a, b);
    const baseHeight = Math.max(a, b);

    AppState.photos.forEach(p => {
        // Применяем общие настройки
        p.settings.paper = settings.paper;
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
    const loadedCount = AppState.photos.length;
    const toPrintCount = AppState.photos.reduce((sum, p) => sum + p.settings.quantity, 0);
    const inSizeCount = AppState.photos.filter(p => !needsCropping(p)).length;
    const needsReviewCount = AppState.photos.filter(p => needsCropping(p)).length;
    const lowQualityCount = AppState.photos.filter(p => checkPhotoQuality(p).level === 'bad').length;

    const filterTotalEl = document.getElementById('filter-total');
    const filterLoadedEl = document.getElementById('filter-loaded');
    const filterSizedEl = document.getElementById('filter-sized');
    const filterReviewEl = document.getElementById('filter-review');
    const filterLowQualityEl = document.getElementById('filter-low-quality');

    if (filterTotalEl) filterTotalEl.textContent = toPrintCount;
    if (filterLoadedEl) filterLoadedEl.textContent = loadedCount;
    if (filterSizedEl) filterSizedEl.textContent = inSizeCount;
    if (filterReviewEl) filterReviewEl.textContent = needsReviewCount;
    if (filterLowQualityEl) filterLowQualityEl.textContent = lowQualityCount;

    // Фильтрация
    let photos = [...AppState.photos];
    if (filter === 'sized') {
        photos = photos.filter(p => !needsCropping(p));
    } else if (filter === 'review') {
        photos = photos.filter(p => needsCropping(p));
    } else if (filter === 'low-quality') {
        photos = photos.filter(p => checkPhotoQuality(p).level === 'bad');
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
                <div class="preview-group-title">${size} | ${groupPhotos.length} \u0444\u043e\u0442\u043e</div>
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
    const quality = checkPhotoQuality(photo);

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

    const editedIcon = isModified ? '<div class="edited-icon" title="\u0424\u043e\u0442\u043e \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u043e">\u270e</div>' : '';
    const fullImageIcon = photo.settings.fullImage ? '<div class="fullimage-icon" title="\u0421 \u043f\u043e\u043b\u044f\u043c\u0438">\u25a2</div>' : '';

    // Quality badge for preview
    const qualityBadgeHtml = `<div class="quality-indicator"><span class="quality-badge quality-${quality.level}">${quality.dpi} DPI</span></div>`;

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
                ${qualityBadgeHtml}
                <a href="#" class="preview-photo-edit" data-id="${photo.id}">\u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c</a>
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
        // Вписываем целиком с полями, но учитываем zoom и crop
        let baseWidth, baseHeight;
        if (imgRatio > frameRatio) {
            baseWidth = frameWidth;
            baseHeight = baseWidth / imgRatio;
        } else {
            baseHeight = frameHeight;
            baseWidth = baseHeight * imgRatio;
        }
        // Применяем zoom
        imgWidth = baseWidth * zoom;
        imgHeight = baseHeight * zoom;
        // Центрируем и применяем crop offset
        const centerX = (frameWidth - imgWidth) / 2;
        const centerY = (frameHeight - imgHeight) / 2;
        const editorFrameWidth = photo.settings.editorFrameWidth || 400;
        const scale = frameWidth / editorFrameWidth;
        imgLeft = centerX + photo.settings.crop.x * scale;
        imgTop = centerY + photo.settings.crop.y * scale;
    } else {
        // Заполняем с обрезкой
        let baseWidth, baseHeight;
        if (imgRatio > frameRatio) {
            baseHeight = frameHeight;
            baseWidth = baseHeight * imgRatio;
        } else {
            baseWidth = frameWidth;
            baseHeight = baseWidth / imgRatio;
        }
        // Применяем zoom
        imgWidth = baseWidth * zoom;
        imgHeight = baseHeight * zoom;
        // Центрируем и применяем смещение
        const centerX = (frameWidth - imgWidth) / 2;
        const centerY = (frameHeight - imgHeight) / 2;
        const editorFrameWidth = photo.settings.editorFrameWidth || 400;
        const scale = frameWidth / editorFrameWidth;
        imgLeft = centerX + photo.settings.crop.x * scale;
        imgTop = centerY + photo.settings.crop.y * scale;
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
            ${qualityBadgeHtml}
            <a href="#" class="preview-photo-edit" data-id="${photo.id}">\u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c</a>
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

    // Удаляем фоновое изображение
    const bgImg = document.getElementById('editor-image-bg');
    if (bgImg) {
        bgImg.remove();
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

    // Quality info in editor sidebar
    updateEditorQualityInfo();

    // Рендерим canvas с рамкой
    renderEditorCanvas();
}

function updateEditorQualityInfo() {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;

    const quality = checkPhotoQuality(photo);
    const qualityEl = document.getElementById('editor-quality-info');
    if (qualityEl) {
        qualityEl.innerHTML = `<span class="quality-badge quality-${quality.level}">${quality.dpi} DPI \u2014 ${quality.message}</span>`;
    }
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
    cropFrame.style.overflow = 'hidden';
    cropFrame.style.position = 'relative';
    
    // Создаём полупрозрачное фоновое изображение в canvas
    let bgImg = document.getElementById('editor-image-bg');
    if (!bgImg) {
        bgImg = document.createElement('img');
        bgImg.id = 'editor-image-bg';
        bgImg.style.position = 'absolute';
        bgImg.style.pointerEvents = 'none';
        bgImg.style.opacity = '0.3';
        bgImg.style.zIndex = '0';
        canvas.style.position = 'relative';
        canvas.style.overflow = 'hidden'; // Обрезаем по границе canvas
        canvas.insertBefore(bgImg, canvas.firstChild);
    }

    // Функция для применения стилей к изображению
    const applyImageStyles = () => {
        const imgNaturalRatio = photo.width / photo.height;
        const isRotated90or270 = photo.settings.rotation === 90 || photo.settings.rotation === 270;
        
        // Визуальное соотношение сторон с учётом поворота
        const visualRatio = isRotated90or270 ? (photo.height / photo.width) : imgNaturalRatio;
        
        // В режиме fullImage минимальный zoom = 100%, чтобы избежать паспарту
        const zoom = photo.settings.fullImage 
            ? Math.max(photo.settings.crop.zoom, 100) / 100
            : photo.settings.crop.zoom / 100;

        let baseWidth, baseHeight;
        
        // Рассчитываем ВИЗУАЛЬНЫЕ размеры (которые увидим после поворота)
        if (photo.settings.fullImage) {
            // Режим "с полями" - вписываем изображение (contain)
            if (visualRatio > frameRatio) {
                baseWidth = displayFrameWidth;
                baseHeight = baseWidth / visualRatio;
            } else {
                baseHeight = displayFrameHeight;
                baseWidth = baseHeight * visualRatio;
            }
            cropFrame.style.background = '#fff';
        } else {
            // Обычный режим - заполняем рамку (cover)
            if (visualRatio > frameRatio) {
                baseHeight = displayFrameHeight;
                baseWidth = baseHeight * visualRatio;
            } else {
                baseWidth = displayFrameWidth;
                baseHeight = baseWidth / visualRatio;
            }
            cropFrame.style.background = 'transparent';
        }

        // Применяем зум к визуальным размерам
        const visualWidth = baseWidth * zoom;
        const visualHeight = baseHeight * zoom;

        // Для CSS нужно задать размеры ДО поворота
        // При rotate(90/270) браузер визуально поменяет W и H местами
        const cssWidth = isRotated90or270 ? visualHeight : visualWidth;
        const cssHeight = isRotated90or270 ? visualWidth : visualHeight;

        // Центрируем по CSS размерам (rotate поворачивает вокруг центра, 
        // поэтому центрирование по CSS автоматически даёт правильный визуальный центр)
        const finalX = (displayFrameWidth - cssWidth) / 2 + photo.settings.crop.x;
        const finalY = (displayFrameHeight - cssHeight) / 2 + photo.settings.crop.y;

        // Основное изображение
        img.style.width = `${cssWidth}px`;
        img.style.height = `${cssHeight}px`;
        img.style.left = `${finalX}px`;
        img.style.top = `${finalY}px`;
        img.style.transform = `rotate(${photo.settings.rotation}deg)`;

        // Фоновое изображение (показывает часть за рамкой)
        const cropFrameRect = cropFrame.getBoundingClientRect();
        const canvasRect2 = canvas.getBoundingClientRect();
        const offsetX = cropFrameRect.left - canvasRect2.left;
        const offsetY = cropFrameRect.top - canvasRect2.top;
        
        bgImg.src = photo.url;
        bgImg.style.width = `${cssWidth}px`;
        bgImg.style.height = `${cssHeight}px`;
        bgImg.style.left = `${offsetX + finalX}px`;
        bgImg.style.top = `${offsetY + finalY}px`;
        bgImg.style.transform = `rotate(${photo.settings.rotation}deg)`;

        // Фильтр
        const filterValue = photo.settings.filter === 'grayscale' ? 'grayscale(100%)' 
                          : photo.settings.filter === 'sepia' ? 'sepia(100%)' 
                          : 'none';
        img.style.filter = filterValue;
        bgImg.style.filter = filterValue;
    };

    // Принудительно перезагружаем изображение
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

    // Устанавливаем src
    img.src = photo.url;

    // Если изображение уже в кэше, onload может не сработать - вызываем вручную
    if (img.complete && img.naturalWidth > 0) {
        applyImageStyles();
    }
}

function updateEditorZoom(newZoom) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;

    // Просто обновляем зум, позиция сохраняется
    photo.settings.crop.zoom = newZoom;
    renderEditorCanvas();
}

function updateEditorSize(size) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (photo) {
        photo.settings.size = size;
        // Сбрасываем crop при смене размера
        photo.settings.crop = { x: 0, y: 0, zoom: 100 };
        document.getElementById('editor-zoom').value = 100;
        // Update quality info when size changes
        updateEditorQualityInfo();
        renderEditorCanvas();
    }
}

function updateEditorFullImage(fullImage) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (photo) {
        photo.settings.fullImage = fullImage;
        // Сбрасываем позицию для корректного центрирования, но оставляем zoom
        photo.settings.crop.x = 0;
        photo.settings.crop.y = 0;
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

    // Меняем местами числа в размере (30x40 -> 40x30)
    const [a, b] = photo.settings.size.split('x').map(Number);
    photo.settings.size = `${b}x${a}`;

    // Сбрасываем crop при повороте рамки
    photo.settings.crop = { x: 0, y: 0, zoom: 100 };
    document.getElementById('editor-zoom').value = 100;

    // Обновляем селект (показываем новый размер)
    const sizeSelect = document.getElementById('editor-size');
    const baseSize = [a, b].sort((x, y) => x - y).join('x');
    let found = false;
    Array.from(sizeSelect.options).forEach(opt => {
        const [oa, ob] = opt.value.split('x').map(Number);
        const optBase = [oa, ob].sort((x, y) => x - y).join('x');
        if (optBase === baseSize) {
            found = true;
        }
    });

    // Update quality info when frame rotates (size changes)
    updateEditorQualityInfo();
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
    if (!photo) return;

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

    // Перерисовываем для корректного обновления позиций
    renderEditorCanvas();
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
                <h2 class="modal-title">\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f</h2>
                <div class="info-content">
                    <p>\u041f\u0440\u0438 \u0432\u044b\u0431\u043e\u0440\u0435 \u00ab\u041f\u043e\u043b\u043d\u043e\u0435 \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435\u00bb \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u044f \u0431\u0443\u0434\u0435\u0442 \u043d\u0430\u043f\u0435\u0447\u0430\u0442\u0430\u043d\u0430 \u0442\u0430\u043a, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u043a\u0430\u043a \u043c\u0438\u043d\u0438\u043c\u0443\u043c \u0434\u0432\u0435 \u0441\u0442\u043e\u0440\u043e\u043d\u044b \u043e\u0442\u043f\u0435\u0447\u0430\u0442\u043a\u0430, \u043d\u043e \u043d\u0430 \u0434\u0432\u0443\u0445 \u0434\u0440\u0443\u0433\u0438\u0445 \u0441\u0442\u043e\u0440\u043e\u043d\u0430\u0445 \u043c\u043e\u0433\u0443\u0442 \u043f\u043e\u044f\u0432\u0438\u0442\u044c\u0441\u044f \u0431\u0435\u043b\u044b\u0435 \u043f\u043e\u043b\u044f (\u0441\u043c. \u043d\u0438\u0436\u0435).</p>
                    <div class="full-image-examples">
                        <div class="full-image-example">
                            <div class="example-box cropped">
                                <div class="example-img"></div>
                            </div>
                            <span>\u0421 \u043e\u0431\u0440\u0435\u0437\u043a\u043e\u0439</span>
                        </div>
                        <div class="full-image-example">
                            <div class="example-box with-fields">
                                <div class="example-img small"></div>
                                <div class="padding-indicator">\u00d7</div>
                            </div>
                            <span>\u0421 \u043f\u043e\u043b\u044f\u043c\u0438</span>
                        </div>
                    </div>
                </div>
                <button class="btn-apply-warning" id="btn-apply-warning">\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c</button>
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

    const projectName = document.getElementById('project-name')?.value || 'Проект печати на холсте';
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

    // Проверяем авторизацию и показываем/скрываем блок для гостей
    updateOrderModalAuthState();

    modal.classList.add('active');
}

// Обновить состояние авторизации в модалке заказа
function updateOrderModalAuthState() {
    const token = localStorage.getItem('access');
    const modal = document.getElementById('order-modal');
    const btnOrder = document.getElementById('btn-order');
    
    // Находим или создаём блок для гостей
    let guestBlock = document.getElementById('order-guest-block');
    
    if (!token) {
        // Гость - показываем предупреждение
        if (!guestBlock) {
            guestBlock = document.createElement('div');
            guestBlock.id = 'order-guest-block';
            guestBlock.className = 'order-guest-block';
            guestBlock.innerHTML = `
                <div class="order-guest-message">
                    <p>Для оформления заказа необходимо войти в аккаунт или зарегистрироваться</p>
                </div>
                <button class="btn-login" id="btn-order-login">Войти / Зарегистрироваться</button>
            `;
            
            // Вставляем перед кнопкой заказа
            btnOrder?.parentNode?.insertBefore(guestBlock, btnOrder);
            
            // Добавляем обработчик
            document.getElementById('btn-order-login')?.addEventListener('click', () => {
                if (window.AppHeader) {
                    AppHeader.showAuthModal();
                }
            });
        }
        
        guestBlock.style.display = 'block';
        if (btnOrder) {
            btnOrder.style.display = 'none';
        }
    } else {
        // Авторизован - скрываем блок гостя
        if (guestBlock) {
            guestBlock.style.display = 'none';
        }
        if (btnOrder) {
            btnOrder.style.display = 'block';
        }
    }
}

async function submitOrder() {
    const token = localStorage.getItem('access');

    // Если гость - обновляем состояние модалки
    if (!token) {
        updateOrderModalAuthState();
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
        const projectName = document.getElementById('project-name')?.value || 'Проект печати на холсте';
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
    const projectName = document.getElementById('project-name')?.value || 'Проект печати на холсте';
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
