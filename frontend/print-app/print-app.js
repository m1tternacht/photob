// ==================== PRINT APP ====================

// API URL
const API_URL = 'http://127.0.0.1:8000/api';

// Конфигурация приложения
const APP_CONFIG = {
    prefix: 'print_',           // Префикс для ID проекта
    productType: 'prints',      // Тип продукта для API
    defaultProjectName: 'Проект печати',
    localStorageKey: 'print_app_draft',
    autoSaveInterval: 60000,    // 60 секунд
    maxFileSize: 200 * 1024 * 1024, // 200 МБ
    allowedFormats: ['jpg', 'jpeg', 'png', 'bmp', 'heic', 'webp', 'tiff', 'tif']
};

// Состояние приложения
const AppState = {
    currentStep: 1,
    photos: [], // { id, file, url, name, width, height, aspectRatio, orientation, settings: {...} }
    sizes: [], // { value, label, price, ratio } - загружаются с API
    papers: [], // { value, label, coefficient } - загружаются с API
    productTypeId: null, // ID типа продукта из API
    projectId: null, // UUID проекта в БД
    projectName: APP_CONFIG.defaultProjectName,
    totalPrice: 0,
    fullImageWarningShown: false, // показано ли предупреждение о полях
    sortOrder: 'asc', // 'asc' или 'desc'
    defaultSize: null, // размер из URL-параметров (со standard-photos.html)
    defaultPaper: null,
    
    // Автосохранение
    hasUnsavedChanges: false,
    lastSavedData: null,
    saveStatus: 'none', // 'none', 'saving', 'saved', 'not-saved'
    autoSaveTimer: null,
    projectStartTime: null
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

// ==================== AUTO SAVE ====================

function initAutoSave() {
    // Предупреждение при закрытии страницы с несохранёнными изменениями
    // Временно отключено для диагностики
    // window.addEventListener('beforeunload', (e) => {
    //     if (AppState.hasUnsavedChanges && AppState.photos.length > 0) {
    //         e.preventDefault();
    //         e.returnValue = 'У вас есть несохранённые изменения. Вы уверены, что хотите покинуть страницу?';
    //         return e.returnValue;
    //     }
    // });
    
    // Запускаем автосохранение
    startAutoSaveTimer();
}

function initProjectNameInput() {
    const input = document.getElementById('project-name');
    if (input) {
        input.value = AppState.projectName;
        input.addEventListener('input', (e) => {
            AppState.projectName = e.target.value || APP_CONFIG.defaultProjectName;
            markAsChanged();
        });
    }
}

function startAutoSaveTimer() {
    // Очищаем предыдущий таймер
    if (AppState.autoSaveTimer) {
        clearInterval(AppState.autoSaveTimer);
    }
    
    // Запускаем новый таймер
    AppState.autoSaveTimer = setInterval(() => {
        autoSave();
    }, APP_CONFIG.autoSaveInterval);
}

async function autoSave() {
    // Не сохраняем если нет фото
    if (AppState.photos.length === 0) {
        return;
    }
    
    // Не сохраняем если нет изменений
    if (!AppState.hasUnsavedChanges) {
        return;
    }
    
    // Первое автосохранение только через минуту после начала работы
    if (!AppState.projectStartTime) {
        return;
    }
    
    const timeSinceStart = Date.now() - AppState.projectStartTime;
    if (timeSinceStart < APP_CONFIG.autoSaveInterval) {
        return;
    }
    
    await saveProject(true); // true = автосохранение (тихое)
}

// Пометить что есть несохранённые изменения
function markAsChanged() {
    AppState.hasUnsavedChanges = true;
    updateSaveStatus('not-saved');
    
    // Запоминаем время начала работы
    if (!AppState.projectStartTime && AppState.photos.length > 0) {
        AppState.projectStartTime = Date.now();
    }
}

// Обновить статус сохранения в UI
function updateSaveStatus(status) {
    console.log('updateSaveStatus:', status);
    AppState.saveStatus = status;
    const statusEl = document.getElementById('save-status');
    if (!statusEl) {
        console.warn('save-status element not found!');
        return;
    }
    
    statusEl.className = 'save-status ' + status;
    
    const iconEl = statusEl.querySelector('.save-status-icon');
    const textEl = statusEl.querySelector('.save-status-text');
    
    switch (status) {
        case 'saved':
            if (iconEl) iconEl.textContent = '✓';
            if (textEl) textEl.textContent = 'Сохранено';
            break;
        case 'not-saved':
            if (iconEl) iconEl.textContent = '○';
            if (textEl) textEl.textContent = 'Не сохранено';
            break;
        case 'saving':
            if (iconEl) iconEl.textContent = '↻';
            if (textEl) textEl.textContent = 'Сохранение...';
            break;
        default:
            if (iconEl) iconEl.textContent = '○';
            if (textEl) textEl.textContent = 'Не сохранено';
    }
    console.log('Status updated, element class:', statusEl.className);
}

// Сохранить проект
async function saveProject(isAutoSave = false) {
    console.log('saveProject called, isAutoSave:', isAutoSave);
    
    const token = localStorage.getItem('access');
    
    // Для гостей - сохраняем в localStorage
    if (!token) {
        console.log('No token, saving to localStorage');
        if (isAutoSave) {
            saveToLocalStorage();
            return;
        }
        // При ручном сохранении - показываем модалку авторизации
        if (window.AppHeader) {
            AppHeader.showAuthModal();
        }
        return;
    }
    
    // Для авторизованных - сохраняем в БД
    console.log('Saving to DB...');
    updateSaveStatus('saving');
    
    try {
        // Обновляем общую стоимость перед сохранением
        updateTotalPrice();
        
        // ШАГ 1: Если нет projectId - сначала создаём проект (чтобы фото сохранились в правильную папку)
        if (!AppState.projectId) {
            const initialProjectData = {
                name: AppState.projectName,
                product_type: AppState.productTypeId || 1,
                data: { photos: [] },
                total_price: 0
            };
            
            const createResponse = await fetch(`${API_URL}/projects/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(initialProjectData)
            });
            
            if (!createResponse.ok) {
                throw new Error('Failed to create project');
            }
            
            const createdProject = await createResponse.json();
            AppState.projectId = createdProject.id;
            console.log('Project created:', AppState.projectId);
        }
        
        // ШАГ 2: Загружаем фото на сервер (теперь с projectId)
        await uploadPhotosToServer(token);
        
        // ШАГ 3: Обновляем проект с данными фото
        const projectData = {
            name: AppState.projectName,
            product_type: AppState.productTypeId || 1,
            data: {
                photos: AppState.photos.map(p => ({
                    id: p.id,
                    name: p.name,
                    width: p.width,
                    height: p.height,
                    url: p.serverUrl || p.url,
                    settings: p.settings
                }))
            },
            total_price: AppState.totalPrice,
            preview_url: AppState.photos[0]?.serverUrl || AppState.photos[0]?.url || null
        };
        
        console.log('Saving project data:', projectData);
        
        const response = await fetch(`${API_URL}/projects/${AppState.projectId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(projectData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', response.status, errorText);
            throw new Error(`Failed to save project: ${response.status}`);
        }
        
        const savedProject = await response.json();
        AppState.hasUnsavedChanges = false;
        AppState.lastSavedData = JSON.stringify(projectData);
        
        updateSaveStatus('saved');
        console.log('Project saved successfully:', savedProject.id);
        
        // Сохраняем projectId в localStorage для восстановления после обновления
        localStorage.setItem(APP_CONFIG.localStorageKey + '_projectId', savedProject.id);
        
        // Очищаем черновик из localStorage (фото уже в БД)
        localStorage.removeItem(APP_CONFIG.localStorageKey);
        console.log('Draft cleared, projectId saved');
        
        if (!isAutoSave) {
            console.log('Manual save completed, NO NAVIGATION SHOULD HAPPEN');
        }
        
    } catch (error) {
        console.error('Save error:', error);
        updateSaveStatus('not-saved');
        
        // При ошибке сохраняем в localStorage как backup
        saveToLocalStorage();
        
        if (!isAutoSave) {
            alert('Не удалось сохранить проект. Изменения сохранены локально.');
        }
        }
    }


// Загрузить фото на сервер (для фото с blob URL)
async function uploadPhotosToServer(token) {
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
            
            // Отправляем сконвертированный файл (JPEG) если есть, иначе оригинал
            // photo.file - сконвертированный blob (JPEG)
            // photo.originalFile - оригинальный файл (может быть HEIC/TIFF)
            const fileToUpload = photo.file || photo.originalFile;
            
            // Имя файла - используем .jpg если файл был сконвертирован
            let fileName = photo.name;
            if (photo.file && photo.originalFile && photo.file !== photo.originalFile) {
                // Был сконвертирован - меняем расширение на .jpg
                fileName = photo.name.replace(/\.(heic|heif|tiff|tif)$/i, '.jpg');
            }
            
            formData.append('file', fileToUpload, fileName);
            
            if (AppState.projectId) {
                formData.append('project_id', AppState.projectId);
            }
            
            const response = await fetch(`${API_URL}/photos/upload/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            if (response.ok) {
                const uploadedPhoto = await response.json();
                // Сохраняем серверный URL
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

// Сохранить в localStorage (для гостей или как backup)
function saveToLocalStorage() {
    console.log('saveToLocalStorage called');
    try {
        const data = {
            projectId: AppState.projectId,
            projectName: AppState.projectName,
            photos: AppState.photos.map(p => ({
                id: p.id,
                name: p.name,
                width: p.width,
                height: p.height,
                url: p.url, // Может быть blob URL - не сохранится между сессиями
                settings: p.settings
            })),
            totalPrice: AppState.totalPrice,
            savedAt: Date.now()
        };
        
        localStorage.setItem(APP_CONFIG.localStorageKey, JSON.stringify(data));
        AppState.hasUnsavedChanges = false;
        updateSaveStatus('saved');
        console.log('Saved to localStorage successfully');
        
    } catch (error) {
        console.error('localStorage save error:', error);
    }
}

// Загрузить черновик
function loadDraft() {
    // Проверяем URL на наличие project_id для загрузки из БД
    const urlParams = new URLSearchParams(window.location.search);
    const projectIdFromUrl = urlParams.get('project_id');
    
    if (projectIdFromUrl) {
        loadProjectFromDB(projectIdFromUrl);
        return;
    }
    
    // Проверяем сохранённый projectId в localStorage (для авторизованных)
    const savedProjectId = localStorage.getItem(APP_CONFIG.localStorageKey + '_projectId');
    const token = localStorage.getItem('access');
    
    if (savedProjectId && token) {
        console.log('Found saved projectId, loading from DB:', savedProjectId);
        loadProjectFromDB(savedProjectId);
        return;
    }
    
    // Пробуем загрузить черновик из localStorage (для гостей)
    loadFromLocalStorage();
}

// Загрузить проект из БД
async function loadProjectFromDB(projectId) {
    const token = localStorage.getItem('access');
    if (!token) {
        console.log('Not authenticated, cannot load project from DB');
        // Очищаем сохранённый projectId если не авторизованы
        localStorage.removeItem(APP_CONFIG.localStorageKey + '_projectId');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            // Проект не найден - очищаем сохранённый ID
            localStorage.removeItem(APP_CONFIG.localStorageKey + '_projectId');
            throw new Error('Failed to load project');
        }
        
        const project = await response.json();
        console.log('Loaded project:', project);
        
        // Восстанавливаем состояние
        AppState.projectId = project.id;
        AppState.projectName = project.name;
        AppState.totalPrice = parseFloat(project.total_price) || 0;
        
        // Обновляем поле названия
        const nameInput = document.getElementById('project-name');
        if (nameInput) nameInput.value = AppState.projectName;
        
        // Восстанавливаем фото из данных проекта
        if (project.data && project.data.photos && project.data.photos.length > 0) {
            // Фильтруем фото - оставляем только те у которых есть валидный URL (не blob)
            const validPhotos = project.data.photos.filter(p => p.url && !p.url.startsWith('blob:'));
            const blobPhotos = project.data.photos.filter(p => p.url && p.url.startsWith('blob:'));
            
            if (validPhotos.length > 0) {
                AppState.photos = validPhotos.map(p => ({
                    ...p,
                    url: p.url
                }));
            }
            
            // Если были blob URL - предупреждаем что нужно перезагрузить фото
            if (blobPhotos.length > 0 && validPhotos.length === 0) {
                console.log('Project has blob URLs, photos need to be re-uploaded');
                // Восстанавливаем настройки без URL для удобства
                AppState.photos = [];
            }
            
            updatePhotosCount();
            renderUploadedPhotos();
            updateTotalPrice();
            
            if (AppState.photos.length > 0) {
                document.getElementById('upload-sources').style.display = 'none';
                document.getElementById('uploaded-photos').style.display = 'block';
            }
        }
        
        AppState.hasUnsavedChanges = false;
        updateSaveStatus('saved');
        console.log('Project loaded from DB:', projectId, 'Photos:', AppState.photos.length);
        
    } catch (error) {
        console.error('Load project error:', error);
        // Не показываем alert при ошибке загрузки - просто начинаем новый проект
    }
}

// Загрузить из localStorage
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem(APP_CONFIG.localStorageKey);
        if (!saved) return;
        
        const data = JSON.parse(saved);
        
        // Проверяем не слишком ли старые данные (больше 7 дней)
        if (data.savedAt && Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
            clearLocalStorage();
            return;
        }
        
        // Автоматически восстанавливаем проект без подтверждения
        if (data.photos && data.photos.length > 0) {
            AppState.projectId = data.projectId;
            AppState.projectName = data.projectName;
            AppState.totalPrice = data.totalPrice || 0;
            
            const nameInput = document.getElementById('project-name');
            if (nameInput) nameInput.value = AppState.projectName;
            
            // Примечание: blob URL не сохраняются между сессиями
            // Восстанавливаем только фото с серверными URL
            AppState.photos = data.photos.filter(p => p.url && !p.url.startsWith('blob:'));
            
            if (AppState.photos.length > 0) {
                updatePhotosCount();
                renderUploadedPhotos();
                document.getElementById('upload-sources').style.display = 'none';
                document.getElementById('uploaded-photos').style.display = 'block';
                updateSaveStatus('saved');
                console.log(`Восстановлен проект: ${data.projectName} (${AppState.photos.length} фото)`);
            }
        }
        
    } catch (error) {
        console.error('localStorage load error:', error);
        clearLocalStorage();
    }
}

function clearLocalStorage() {
    try {
        localStorage.removeItem(APP_CONFIG.localStorageKey);
    } catch (error) {
        console.error('localStorage clear error:', error);
    }
}

// Перенос проекта из localStorage в БД после авторизации
// Вызывается из app-header.js после успешного логина
window.onUserLogin = async function() {
    const token = localStorage.getItem('access');
    if (!token) return;
    
    // Проверяем есть ли несохранённый проект в localStorage
    const saved = localStorage.getItem(APP_CONFIG.localStorageKey);
    if (!saved) return;
    
    try {
        const data = JSON.parse(saved);
        if (!data.photos || data.photos.length === 0) return;
        
        // Если текущий проект пустой - восстанавливаем из localStorage
        if (AppState.photos.length === 0) {
            AppState.projectName = data.projectName;
            AppState.photos = data.photos.filter(p => p.url && !p.url.startsWith('blob:'));
            
            const nameInput = document.getElementById('project-name');
            if (nameInput) nameInput.value = AppState.projectName;
            
            if (AppState.photos.length > 0) {
                updatePhotosCount();
                renderUploadedPhotos();
                document.getElementById('upload-sources').style.display = 'none';
                document.getElementById('uploaded-photos').style.display = 'block';
            }
        }
        
        // Сохраняем в БД
        if (AppState.photos.length > 0) {
            await saveProject(true);
            console.log('Project transferred from localStorage to DB');
        }
        
    } catch (error) {
        console.error('Failed to transfer project to DB:', error);
    }
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== print-app.js DOMContentLoaded ===');
    console.log('Current URL:', window.location.href);
    
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
    initAutoSave();
    initProjectNameInput();
    loadDraft(); // Загружаем черновик если есть
    
    console.log('=== Initialization complete ===');
});

// ==================== LOAD PRINT OPTIONS ====================
async function loadPrintOptions() {
    try {
        // Загружаем конфиг с API
        const res = await fetch(`${API_URL}/config/prints/`);
        if (!res.ok) throw new Error('Failed to load config');
        
        const config = await res.json();
        
        // Сохраняем ID типа продукта для отправки при сохранении
        if (config.product_type && config.product_type.id) {
            AppState.productTypeId = config.product_type.id;
        }
        
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
        console.log('Product type ID:', AppState.productTypeId);
        
    } catch (e) {
        console.error('Failed to load print options from API:', e);
        // Fallback - дефолтные значения
        AppState.productTypeId = 1; // prints
        AppState.sizes = [
            { value: '10x15', label: '10 × 15 см', price: 15, width: 10, height: 15, ratio: 1.5 },
            { value: '15x21', label: '15 × 21 см', price: 35, width: 15, height: 21, ratio: 1.4 },
            { value: '21x30', label: '21 × 30 см', price: 60, width: 21, height: 30, ratio: 1.43 }
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
        const parts = size.split('x');
        const w = parseFloat(parts[0]);
        const h = parseFloat(parts[1]);
        if (w > 0 && h > 0 && !isNaN(w) && !isNaN(h)) {
            // Добавляем только если такого размера ещё нет в стандартных
            const exists = AppState.sizes.some(s => {
                return (Math.abs(s.width - w) < 0.01 && Math.abs(s.height - h) < 0.01) ||
                       (Math.abs(s.width - h) < 0.01 && Math.abs(s.height - w) < 0.01);
            });
            if (!exists) {
                const price = customPrice || Math.round(w * h * 0.1);
                AppState.sizes.unshift({
                    value: size,
                    label: `${w} × ${h} см (нестанд.)`,
                    price: price,
                    width: w,
                    height: h,
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

// Загрузить фото на сервер (старая функция для совместимости)
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
        const url = URL.createObjectURL(fileOrBlob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve({ width: 0, height: 0 });
        };
        img.src = url;
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
    console.log('goToStep called:', step, 'from:', new Error().stack);
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
        if (AppState.currentStep !== 1) {
            goToStep(1);
        }
        openAddMoreModal();
    });
    
    // Модалка "Добавить"
    initAddMoreModal();

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
    const errors = [];
    
    for (const file of Array.from(files)) {
        // Проверяем формат
        const ext = file.name.split('.').pop().toLowerCase();
        if (!APP_CONFIG.allowedFormats.includes(ext) && !file.type.startsWith('image/')) {
            errors.push(`${file.name}: неподдерживаемый формат`);
            continue;
        }
        
        // Проверяем размер
        if (file.size > APP_CONFIG.maxFileSize) {
            errors.push(`${file.name}: файл больше 200 МБ`);
            continue;
        }
        
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
                file: processedFile.blob,
                originalFile: file, // Сохраняем оригинал для загрузки на сервер
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
            errors.push(`${file.name}: не удалось обработать файл`);
        }
    }
    
    // Показываем ошибки если есть
    if (errors.length > 0) {
        alert('Некоторые файлы не были загружены:\n' + errors.join('\n'));
    }
    
    if (AppState.photos.length > 0) {
        updatePhotosCount();
        renderUploadedPhotos();
        showUploadedPhotos();
        markAsChanged();
    }
}

// Обработка файла - конвертация HEIC/TIFF в отображаемый формат
async function processImageFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    // HEIC/HEIF - конвертируем через heic2any
    if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
        // Сначала пробуем heic2any
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
                console.warn('heic2any failed, trying canvas fallback:', e.message);
            }
        }
        
        // Fallback: пробуем через canvas (Safari иногда поддерживает HEIC нативно)
        try {
            const canvasBlob = await convertViaCanvas(file);
            if (canvasBlob) {
                console.log('HEIC converted via canvas');
                return { blob: canvasBlob, converted: true };
            }
        } catch (e) {
            console.warn('Canvas fallback failed:', e.message);
        }
        
        // Последний fallback - возвращаем оригинал, может браузер поддержит
        console.warn('HEIC: returning original file, browser may not display it');
        return { blob: file, converted: false };
    }
    
    // TIFF - конвертируем через UTIF
    if (ext === 'tiff' || ext === 'tif' || file.type === 'image/tiff') {
        if (typeof UTIF !== 'undefined') {
            try {
                const convertedBlob = await convertTiffWithUTIF(file);
                console.log('TIFF converted successfully');
                return { blob: convertedBlob, converted: true };
            } catch (e) {
                console.warn('UTIF conversion failed:', e.message);
            }
        }
        
        // Fallback через canvas
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
    
    // Остальные форматы - возвращаем как есть
    return { blob: file, converted: false };
}

// Конвертация через canvas (fallback)
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

// Конвертация TIFF через UTIF библиотеку
async function convertTiffWithUTIF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const buffer = e.target.result;
                const ifds = UTIF.decode(buffer);
                
                if (ifds.length === 0) {
                    reject(new Error('No pages in TIFF'));
                    return;
                }
                
                // Декодируем первую страницу
                UTIF.decodeImage(buffer, ifds[0]);
                const rgba = UTIF.toRGBA8(ifds[0]);
                
                const width = ifds[0].width;
                const height = ifds[0].height;
                
                // Создаём canvas и рисуем
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                const imageData = ctx.createImageData(width, height);
                imageData.data.set(new Uint8ClampedArray(rgba));
                ctx.putImageData(imageData, 0, 0);
                
                // Конвертируем в JPEG blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas toBlob failed'));
                    }
                }, 'image/jpeg', 0.92);
                
            } catch (e) {
                reject(e);
            }
        };
        
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsArrayBuffer(file);
    });
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
        markAsChanged();
        
        if (AppState.photos.length === 0) {
            document.getElementById('upload-sources').style.display = 'flex';
            document.getElementById('uploaded-photos').style.display = 'none';
        }
    }
}

// ==================== GALLERY PICKER ====================
function initGalleryPicker() {
    GalleryPicker.init();

    // tab «Загрузить» → открыть file input
    document.getElementById('tab-upload')
        ?.addEventListener('click', () => document.getElementById('file-input').click());

    // Колбэк: фото выбраны из галереи → добавить в AppState
    window.onGalleryPhotosSelected = async function(photos) {
        for (const p of photos) {
            const id  = Date.now() + Math.random().toString(36).substr(2, 9);
            const url = URL.createObjectURL(p.blob);
            const dimensions = p.width && p.height
                ? { width: p.width, height: p.height }
                : await getImageDimensions(p.blob);
            AppState.photos.push({
                id,
                file: p.blob,
                originalFile: p.blob,
                url,
                name: p.name,
                width:  dimensions.width,
                height: dimensions.height,
                aspectRatio: calculateAspectRatio(dimensions.width, dimensions.height),
                orientation: getOrientation(dimensions.width, dimensions.height),
                settings: getDefaultSettings(getOrientation(dimensions.width, dimensions.height))
            });
        }
        updatePhotosCount();
        renderUploadedPhotos();
        showUploadedPhotos();
        markAsChanged();
    };
}


// ==================== ADD-MORE MODAL ====================

function initAddMoreModal() {
    const modal    = document.getElementById('add-more-modal');
    const closeBtn = document.getElementById('add-more-modal-close');
    const fileInputMore = document.getElementById('file-input-more');
    const btnGallery    = document.getElementById('add-more-gallery');

    if (!modal) return;

    // Закрытие
    closeBtn?.addEventListener('click', closeAddMoreModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAddMoreModal(); });

    // Загрузить файлы — label сам открывает диалог нативно
    fileInputMore?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            closeAddMoreModal();
            handleFileUpload(e.target.files);
            e.target.value = '';
        }
    });

    // Галерея
    btnGallery?.addEventListener('click', () => {
        closeAddMoreModal();
        GalleryPicker.show();
    });
}

function openAddMoreModal() {
    document.getElementById('add-more-modal')?.classList.add('active');
}

function closeAddMoreModal() {
    document.getElementById('add-more-modal')?.classList.remove('active');
}

function showGalleryPicker() {
    GalleryPicker.show();
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
        input.addEventListener('input', (e) => {
            if (parseInt(e.target.value) > 10) e.target.value = 10;
            if (parseInt(e.target.value) < 1)  e.target.value = 1;
        });
        input.addEventListener('change', (e) => {
            const val = Math.min(10, Math.max(1, parseInt(e.target.value) || 3));
            e.target.value = val;
            updatePhotoSetting(e.target.dataset.id, 'frameSize', val);
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
        markAsChanged();
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
    markAsChanged();
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


// Строит overlay белой рамки поверх фото через inset box-shadow
// previewSide — меньшая сторона превью-контейнера в px (для пересчёта мм→px)
function buildFrameOverlay(photo, previewSide) {
    if (photo.settings.frame !== 'white' || !(photo.settings.frameSize > 0)) return '';
    const [printA, printB] = (photo.settings.size || '10x15').split('x').map(Number);
    const printMinMm = Math.min(printA, printB) * 10; // см→мм
    const borderPx = Math.max(2, Math.round(photo.settings.frameSize / printMinMm * previewSide));
    return `<div class="preview-frame-overlay" style="box-shadow: inset 0 0 0 ${borderPx}px #fff;"></div>`;
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
        
        // Рамка режим 1: inset box-shadow поверх фото (не ломает layout)
        const frameOverlay1 = buildFrameOverlay(photo, 120);
        return `
            <div class="preview-photo-item">
                <div class="preview-photo-thumb preview-original" data-id="${photo.id}">
                    <img src="${photo.url}" alt="${photo.name}" style="${filterStyle}">
                    ${cropIndicator}
                    ${editedIcon}
                    ${fullImageIcon}
                    ${frameOverlay1}
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
    
    // Рамка режим 2: inset box-shadow overlay — не трогает позиционирование img
    const frameOverlay2 = buildFrameOverlay(photo, Math.min(frameWidth, frameHeight));
    const containerStyle2 = `width: ${frameWidth}px; height: ${frameHeight}px; background: ${bgColor};`;

    return `
        <div class="preview-photo-item">
            <div class="preview-photo-thumb preview-cropped ${needsReview && !photo.settings.fullImage ? 'needs-review' : ''}" 
                 data-id="${photo.id}"
                 style="${containerStyle2}">
                <img src="${photo.url}" alt="${photo.name}" 
                     style="width: ${imgWidth}px; height: ${imgHeight}px; left: ${imgLeft}px; top: ${imgTop}px; ${filterStyle} ${rotateStyle}">
                ${editedIcon}
                ${fullImageIcon}
                ${frameOverlay2}
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

    // Рамка в редакторе — live preview
    document.getElementById('editor-frame')?.addEventListener('change', (e) => {
        const wrap = document.getElementById('editor-frame-size-wrap');
        if (wrap) wrap.style.display = e.target.value === 'white' ? 'flex' : 'none';
        // Обновляем overlay сразу
        const photo = AppState.photos[currentEditorPhotoIndex];
        if (photo) {
            photo.settings.frame = e.target.value;
            const cropFrame = document.getElementById('crop-frame');
            const fw = parseFloat(cropFrame?.style.width)  || 400;
            const fh = parseFloat(cropFrame?.style.height) || 300;
            updateEditorFrameOverlay(cropFrame, photo, fw, fh);
        }
    });
    document.getElementById('editor-frame-size')?.addEventListener('input', (e) => {
        let v = parseInt(e.target.value);
        if (v > 10) { e.target.value = 10; v = 10; }
        if (v < 1)  { e.target.value = 1;  v = 1;  }
        // Обновляем overlay сразу
        const photo = AppState.photos[currentEditorPhotoIndex];
        if (photo) {
            photo.settings.frameSize = v;
            const cropFrame = document.getElementById('crop-frame');
            const fw = parseFloat(cropFrame?.style.width)  || 400;
            const fh = parseFloat(cropFrame?.style.height) || 300;
            updateEditorFrameOverlay(cropFrame, photo, fw, fh);
        }
    });
    
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
    
    // Рамка
    const editorFrame = document.getElementById('editor-frame');
    const editorFrameSizeWrap = document.getElementById('editor-frame-size-wrap');
    const editorFrameSize = document.getElementById('editor-frame-size');
    if (editorFrame) {
        editorFrame.value = photo.settings.frame || 'none';
        if (editorFrameSize) editorFrameSize.value = Math.min(10, photo.settings.frameSize || 3);
        if (editorFrameSizeWrap) editorFrameSizeWrap.style.display =
            photo.settings.frame === 'white' ? 'flex' : 'none';
    }

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
    // Сбрасываем src чтобы onload гарантированно сработал
    img.onload = null;
    const currentSrc = img.src;
    img.src = '';
    
    img.onload = () => {
        // Проверяем что это всё ещё нужное фото
        const currentPhoto = AppState.photos[currentEditorPhotoIndex];
        if (currentPhoto && currentPhoto.id === photo.id) {
            applyImageStyles();
            updateEditorFrameOverlay(cropFrame, photo, displayFrameWidth, displayFrameHeight);
        }
    };
    
    // Устанавливаем src (если тот же URL - всё равно сработает onload из-за сброса)
    img.src = photo.url;
    
    // Если изображение уже в кэше, onload может не сработать - вызываем вручную
    if (img.complete && img.naturalWidth > 0) {
        applyImageStyles();
        updateEditorFrameOverlay(cropFrame, photo, displayFrameWidth, displayFrameHeight);
    }
}

// Обновляет (или создаёт) overlay белой рамки поверх crop-frame в редакторе
function updateEditorFrameOverlay(cropFrame, photo, frameW, frameH) {
    let overlay = document.getElementById('editor-frame-overlay');

    if (photo.settings.frame !== 'white' || !(photo.settings.frameSize > 0)) {
        // Рамки нет — скрываем overlay если был
        if (overlay) overlay.style.display = 'none';
        return;
    }

    // Создаём overlay один раз
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'editor-frame-overlay';
        overlay.style.cssText = [
            'position:absolute', 'inset:0', 'pointer-events:none',
            'z-index:5', 'transition:box-shadow 0.1s'
        ].join(';');
        cropFrame.appendChild(overlay);
    }
    overlay.style.display = 'block';

    // Пересчитываем толщину рамки из мм → px превью
    const [printA, printB] = (photo.settings.size || '10x15').split('x').map(Number);
    const printMinMm  = Math.min(printA, printB) * 10;          // см→мм
    const previewSide = Math.min(frameW, frameH);
    const borderPx    = Math.max(2, Math.round(photo.settings.frameSize / printMinMm * previewSide));

    overlay.style.boxShadow = `inset 0 0 0 ${borderPx}px #fff`;
}

function updateEditorZoom(newZoom) {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (!photo) return;

    // fullImage-режим: зум не ниже 100% (иначе появятся поля)
    const clampedZoom = photo.settings.fullImage ? Math.max(100, newZoom) : Math.max(50, newZoom);
    photo.settings.crop.zoom = clampedZoom;

    // Синхронизируем слайдер на случай если зум был зажат
    const slider = document.getElementById('editor-zoom');
    if (slider && parseInt(slider.value) !== clampedZoom) slider.value = clampedZoom;

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
    if (!photo) return;

    e.preventDefault();
    editorDragState.isDragging = true;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    editorDragState.startX  = clientX;
    editorDragState.startY  = clientY;
    editorDragState.offsetX = photo.settings.crop.x;
    editorDragState.offsetY = photo.settings.crop.y;

    // Запоминаем размеры рамки и CSS-размеры img для clamping в onDrag
    const cropFrame = document.getElementById('crop-frame');
    const imgEl     = document.getElementById('editor-image');
    editorDragState.frameW  = cropFrame ? cropFrame.offsetWidth  : 400;
    editorDragState.frameH  = cropFrame ? cropFrame.offsetHeight : 300;
    editorDragState.imgCssW = imgEl     ? imgEl.offsetWidth      : 200;
    editorDragState.imgCssH = imgEl     ? imgEl.offsetHeight     : 200;
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

    const newX = editorDragState.offsetX + deltaX;
    const newY = editorDragState.offsetY + deltaY;

    // Clamping: минимум 1/3 фото должна оставаться внутри рамки.
    // Формула: maxCrop = frameSize/2 + imgCssSize/6
    // (выводится из условия overlap >= 1/3 * imgSize)
    const maxCropX = editorDragState.frameW / 2 + editorDragState.imgCssW / 6;
    const maxCropY = editorDragState.frameH / 2 + editorDragState.imgCssH / 6;

    photo.settings.crop.x = Math.max(-maxCropX, Math.min(maxCropX, newX));
    photo.settings.crop.y = Math.max(-maxCropY, Math.min(maxCropY, newY));

    // Перерисовываем для корректного обновления позиций
    renderEditorCanvas();
}

function endDrag() {
    editorDragState.isDragging = false;
}

function applyEditorChanges() {
    const photo = AppState.photos[currentEditorPhotoIndex];
    if (photo) {
        const cropFrame = document.getElementById('crop-frame');
        if (cropFrame) {
            photo.settings.editorFrameWidth  = cropFrame.offsetWidth;
            photo.settings.editorFrameHeight = cropFrame.offsetHeight;
        }
        // Сохраняем рамку из редактора
        const editorFrame     = document.getElementById('editor-frame');
        const editorFrameSize = document.getElementById('editor-frame-size');
        if (editorFrame) {
            photo.settings.frame = editorFrame.value;
            if (editorFrameSize) {
                photo.settings.frameSize = Math.min(10, Math.max(1, parseInt(editorFrameSize.value) || 3));
            }
        }
    }

    closeEditor();
    renderPreviewPage();
    updateTotalPrice();
    markAsChanged();
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
    
    markAsChanged();
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
    
    // Если гость - обновляем состояние модалки (на случай если что-то изменилось)
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
        AppState.projectName = document.getElementById('project-name')?.value || APP_CONFIG.defaultProjectName;
        
        // Создаём заказ через API
        const order = await createOrderFromProject();
        
        alert(`Заказ ${order.order_number} успешно оформлен! Вы можете отслеживать его в личном кабинете.`);
        
        document.getElementById('order-modal').classList.remove('active');
        
        // Очистка состояния
        AppState.photos = [];
        AppState.projectId = null;
        AppState.projectName = APP_CONFIG.defaultProjectName;
        AppState.fullImageWarningShown = false;
        AppState.hasUnsavedChanges = false;
        AppState.projectStartTime = null;
        
        // Очищаем localStorage (черновик и projectId)
        clearLocalStorage();
        localStorage.removeItem(APP_CONFIG.localStorageKey + '_projectId');
        
        // Обновляем UI
        updatePhotosCount();
        updateSaveStatus('none');
        document.getElementById('project-name').value = APP_CONFIG.defaultProjectName;
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
    
    btnSave?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Save button clicked');
        handleSaveProject();
    });
    
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
    console.log('handleSaveProject started, photos count:', AppState.photos.length);
    AppState.projectName = document.getElementById('project-name')?.value || APP_CONFIG.defaultProjectName;
    
    const btnSave = document.getElementById('btn-save');
    const originalText = btnSave?.textContent;
    
    try {
        if (btnSave) {
            btnSave.textContent = 'Сохранение...';
            btnSave.disabled = true;
        }
        
        await saveProject(false); // false = ручное сохранение
        console.log('handleSaveProject completed, photos count:', AppState.photos.length);
        
    } finally {
        if (btnSave) {
            btnSave.textContent = originalText;
            btnSave.disabled = false;
        }
    }
}
