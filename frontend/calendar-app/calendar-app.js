// ==================== CALENDAR APP ====================

const API_URL = 'http://127.0.0.1:8000/api';

// Состояние приложения
const CalendarState = {
    projectId: null,
    projectName: 'Календарь',
    style: 'custom',
    year: 2026,
    startMonth: 1,
    currentPage: 'cover', // cover, 1-12
    zoom: 100,
    
    // Фотографии пользователя
    photos: [],
    
    // Страницы календаря (cover + 12 месяцев)
    pages: {
        cover: { photo: null, elements: [] },
        1: { photo: null, elements: [], grid: null },
        2: { photo: null, elements: [], grid: null },
        3: { photo: null, elements: [], grid: null },
        4: { photo: null, elements: [], grid: null },
        5: { photo: null, elements: [], grid: null },
        6: { photo: null, elements: [], grid: null },
        7: { photo: null, elements: [], grid: null },
        8: { photo: null, elements: [], grid: null },
        9: { photo: null, elements: [], grid: null },
        10: { photo: null, elements: [], grid: null },
        11: { photo: null, elements: [], grid: null },
        12: { photo: null, elements: [], grid: null }
    },
    
    // Праздники пользователя
    holidays: [],
    
    // Выбранная сетка
    gridStyle: 'default',
    
    // История для undo/redo
    history: [],
    historyIndex: -1
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initSidebarTabs();
    initMonthTabs();
    initToolbar();
    initModals();
    initZoom();
    initFileUpload();
    initRulers();
    loadUrlParams();
    renderCurrentPage();
    renderCalendarGrid();
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
        const res = await fetch(`${API_URL}/auth/me/`, {
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

// ==================== URL PARAMS ====================
function loadUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const style = params.get('style');
    const projectId = params.get('project');
    
    if (style) {
        CalendarState.style = style;
    }
    
    if (projectId) {
        loadProject(projectId);
    }
}

// ==================== SIDEBAR TABS ====================
function initSidebarTabs() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    const panels = document.querySelectorAll('.sidebar-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const panelId = tab.dataset.panel;
            
            // Переключаем табы
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Переключаем панели
            panels.forEach(p => p.classList.remove('active'));
            document.getElementById(`panel-${panelId}`)?.classList.add('active');
        });
    });
}

// ==================== MONTH TABS ====================
function initMonthTabs() {
    const tabs = document.querySelectorAll('.month-tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const month = tab.dataset.month;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            CalendarState.currentPage = month;
            renderCurrentPage();
            renderCalendarGrid();
        });
    });
}

// ==================== TOOLBAR ====================
function initToolbar() {
    document.getElementById('btn-undo')?.addEventListener('click', undo);
    document.getElementById('btn-redo')?.addEventListener('click', redo);
    document.getElementById('btn-delete')?.addEventListener('click', deleteSelected);
    
    // Название проекта
    document.getElementById('project-name')?.addEventListener('change', (e) => {
        CalendarState.projectName = e.target.value;
        saveProject();
    });
}

// ==================== MODALS ====================
function initModals() {
    // Upload modal
    const uploadModal = document.getElementById('upload-modal');
    const uploadBtn = document.getElementById('btn-upload-photos');
    const uploadClose = document.getElementById('upload-modal-close');
    
    uploadBtn?.addEventListener('click', () => uploadModal?.classList.add('active'));
    uploadClose?.addEventListener('click', () => uploadModal?.classList.remove('active'));
    uploadModal?.addEventListener('click', (e) => {
        if (e.target === uploadModal) uploadModal.classList.remove('active');
    });
    
    // Upload from local
    document.getElementById('upload-local')?.addEventListener('click', () => {
        document.getElementById('file-input')?.click();
    });
    
    // Autofill modal
    const autofillModal = document.getElementById('autofill-modal');
    const autofillBtn = document.getElementById('btn-autofill');
    const autofillClose = document.getElementById('autofill-modal-close');
    const autofillCancel = document.getElementById('autofill-cancel');
    const autofillApply = document.getElementById('autofill-apply');
    
    autofillBtn?.addEventListener('click', () => autofillModal?.classList.add('active'));
    autofillClose?.addEventListener('click', () => autofillModal?.classList.remove('active'));
    autofillCancel?.addEventListener('click', () => autofillModal?.classList.remove('active'));
    autofillApply?.addEventListener('click', () => {
        applyAutofill();
        autofillModal?.classList.remove('active');
    });
    
    // Autofill options
    document.querySelectorAll('.autofill-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.autofill-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        });
    });
    
    // Holiday modal
    const holidayModal = document.getElementById('holiday-modal');
    const holidayBtn = document.getElementById('btn-add-holiday');
    const holidayClose = document.getElementById('holiday-modal-close');
    const holidayCancel = document.getElementById('holiday-cancel');
    const holidaySave = document.getElementById('holiday-save');
    
    holidayBtn?.addEventListener('click', () => holidayModal?.classList.add('active'));
    holidayClose?.addEventListener('click', () => holidayModal?.classList.remove('active'));
    holidayCancel?.addEventListener('click', () => holidayModal?.classList.remove('active'));
    holidaySave?.addEventListener('click', () => {
        saveHoliday();
        holidayModal?.classList.remove('active');
    });
}

// ==================== ZOOM ====================
function initZoom() {
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const zoomValue = document.getElementById('zoom-value');
    
    zoomIn?.addEventListener('click', () => {
        if (CalendarState.zoom < 200) {
            CalendarState.zoom += 10;
            updateZoom();
        }
    });
    
    zoomOut?.addEventListener('click', () => {
        if (CalendarState.zoom > 50) {
            CalendarState.zoom -= 10;
            updateZoom();
        }
    });
}

function updateZoom() {
    const canvas = document.getElementById('canvas');
    const zoomValue = document.getElementById('zoom-value');

    if (canvas) {
        canvas.style.transform = `scale(${CalendarState.zoom / 100})`;
    }
    if (zoomValue) {
        zoomValue.textContent = `${CalendarState.zoom}%`;
    }
    requestAnimationFrame(renderRulers);
}

// ==================== FILE UPLOAD ====================
function initFileUpload() {
    const fileInput = document.getElementById('file-input');
    
    fileInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        
        for (const file of files) {
            await addPhoto(file);
        }
        
        renderPhotosGrid();
        document.getElementById('upload-modal')?.classList.remove('active');
        fileInput.value = '';
    });
}

async function addPhoto(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                CalendarState.photos.push({
                    id: Date.now() + Math.random(),
                    file: file,
                    url: e.target.result,
                    name: file.name,
                    width: img.width,
                    height: img.height
                });
                resolve();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function renderPhotosGrid() {
    const grid = document.getElementById('photos-grid');
    const count = document.getElementById('photos-count');
    
    if (!grid) return;
    
    if (CalendarState.photos.length === 0) {
        grid.innerHTML = '<p style="color:#999;text-align:center;grid-column:1/-1">Нет фотографий</p>';
    } else {
        grid.innerHTML = CalendarState.photos.map(photo => `
            <div class="photo-item" data-id="${photo.id}" draggable="true">
                <img src="${photo.url}" alt="${photo.name}">
                <div class="photo-name">${photo.name}</div>
            </div>
        `).join('');
        
        // Drag and drop
        grid.querySelectorAll('.photo-item').forEach(item => {
            item.addEventListener('dragstart', handlePhotoDragStart);
        });
    }
    
    if (count) {
        count.textContent = CalendarState.photos.length;
    }
}

// ==================== DRAG & DROP ====================
function handlePhotoDragStart(e) {
    const photoId = e.target.dataset.id;
    e.dataTransfer.setData('text/plain', photoId);
}

// ==================== RENDER PAGE ====================
function renderCurrentPage() {
    const photoArea = document.getElementById('photo-area');
    const page = CalendarState.pages[CalendarState.currentPage];
    
    if (!photoArea || !page) return;
    
    if (page.photo) {
        photoArea.innerHTML = `<img src="${page.photo.url}" style="width:100%;height:100%;object-fit:cover;">`;
        photoArea.style.border = 'none';
    } else {
        photoArea.innerHTML = '<span class="placeholder-text">Перетащите фото сюда</span>';
        photoArea.style.border = '2px dashed #ccc';
    }
    
    // Drop zone
    photoArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        photoArea.style.background = '#e0f7fa';
    });
    
    photoArea.addEventListener('dragleave', () => {
        photoArea.style.background = '#fafafa';
    });
    
    photoArea.addEventListener('drop', (e) => {
        e.preventDefault();
        photoArea.style.background = '#fafafa';
        
        const photoId = e.dataTransfer.getData('text/plain');
        const photo = CalendarState.photos.find(p => p.id == photoId);
        
        if (photo) {
            page.photo = photo;
            renderCurrentPage();
        }
    });
}

// ==================== CALENDAR GRID ====================
function renderCalendarGrid() {
    const gridArea = document.getElementById('grid-area');
    const currentPage = CalendarState.currentPage;
    
    if (!gridArea || currentPage === 'cover') {
        if (gridArea) gridArea.innerHTML = '';
        return;
    }
    
    const month = parseInt(currentPage);
    const year = CalendarState.year;
    
    gridArea.innerHTML = generateCalendarHTML(year, month);
}

function generateCalendarHTML(year, month) {
    const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    
    // День недели первого числа (0 = Вс, 1 = Пн, ...)
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1; // Преобразуем в Пн = 0
    
    let html = `
        <div class="calendar-grid-month">
            <div class="grid-month-name">${monthNames[month - 1]} ${year}</div>
            <div class="grid-days-header">
                ${dayNames.map((d, i) => `<div class="grid-day-name ${i >= 5 ? 'weekend' : ''}">${d}</div>`).join('')}
            </div>
            <div class="grid-days">
    `;
    
    // Пустые ячейки до первого числа
    for (let i = 0; i < startDay; i++) {
        html += '<div class="grid-day empty"></div>';
    }
    
    // Дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        // Проверяем праздники
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const holiday = CalendarState.holidays.find(h => h.date === dateStr);
        
        const classes = ['grid-day'];
        if (isWeekend) classes.push('weekend');
        if (holiday) classes.push('holiday');
        
        html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${day}</div>`;
    }
    
    html += '</div></div>';
    
    // Список праздников этого месяца
    const monthHolidays = CalendarState.holidays.filter(h => {
        const d = new Date(h.date);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
    });
    
    if (monthHolidays.length > 0) {
        html += '<div class="grid-holidays-list">';
        monthHolidays.forEach(h => {
            const d = new Date(h.date);
            html += `<div class="grid-holiday-item">🎂 ${d.getDate()} — ${h.name}</div>`;
        });
        html += '</div>';
    }
    
    return html;
}

// ==================== HOLIDAYS ====================
function saveHoliday() {
    const dateInput = document.getElementById('holiday-date');
    const nameInput = document.getElementById('holiday-name');
    
    if (!dateInput?.value || !nameInput?.value) {
        alert('Заполните все поля');
        return;
    }
    
    CalendarState.holidays.push({
        date: dateInput.value,
        name: nameInput.value
    });
    
    renderHolidaysList();
    renderCalendarGrid();
    
    // Очищаем форму
    dateInput.value = '';
    nameInput.value = '';
}

function renderHolidaysList() {
    const list = document.getElementById('holidays-list');
    if (!list) return;
    
    if (CalendarState.holidays.length === 0) {
        list.innerHTML = '<p style="color:#999;text-align:center">Нет праздников</p>';
        return;
    }
    
    list.innerHTML = CalendarState.holidays.map((h, i) => {
        const d = new Date(h.date);
        const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        return `
            <div class="holiday-item">
                <span class="holiday-date">${dateStr}</span>
                <span class="holiday-name">${h.name}</span>
                <button class="holiday-delete" data-index="${i}">×</button>
            </div>
        `;
    }).join('');
    
    // Удаление
    list.querySelectorAll('.holiday-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            CalendarState.holidays.splice(index, 1);
            renderHolidaysList();
            renderCalendarGrid();
        });
    });
}

// ==================== AUTOFILL ====================
function applyAutofill() {
    const activeOption = document.querySelector('.autofill-option.active');
    const layout = activeOption?.dataset.layout || 'single';
    
    // Простое автозаполнение: одно фото на месяц
    if (layout === 'single') {
        for (let i = 1; i <= 12; i++) {
            if (CalendarState.photos[i - 1]) {
                CalendarState.pages[i].photo = CalendarState.photos[i - 1];
            }
        }
    }
    
    renderCurrentPage();
}

// ==================== UNDO / REDO ====================
function undo() {
    if (CalendarState.historyIndex > 0) {
        CalendarState.historyIndex--;
        // Восстановить состояние
        console.log('Undo');
    }
}

function redo() {
    if (CalendarState.historyIndex < CalendarState.history.length - 1) {
        CalendarState.historyIndex++;
        // Восстановить состояние
        console.log('Redo');
    }
}

function deleteSelected() {
    console.log('Delete selected');
}

// ==================== SAVE / LOAD PROJECT ====================
async function saveProject() {
    // TODO: Сохранение на сервер
    document.getElementById('save-status').textContent = '✓ Сохранено';
    console.log('Project saved:', CalendarState);
}

async function loadProject(projectId) {
    // TODO: Загрузка с сервера
    console.log('Loading project:', projectId);
}

// ==================== SETTINGS ====================
document.getElementById('calendar-year')?.addEventListener('change', (e) => {
    CalendarState.year = parseInt(e.target.value);
    renderCalendarGrid();
});

document.getElementById('start-month')?.addEventListener('change', (e) => {
    CalendarState.startMonth = parseInt(e.target.value);
});

// ==================== RULERS ====================
function initRulers() {
    requestAnimationFrame(renderRulers);

    const canvasWrapper = document.getElementById('canvas-wrapper');
    canvasWrapper?.addEventListener('scroll', renderRulers);
    window.addEventListener('resize', renderRulers);
}

function renderRulers() {
    const canvasPage = document.getElementById('canvas-page');
    const rulerH = document.getElementById('ruler-h');
    const rulerV = document.getElementById('ruler-v');

    if (!canvasPage || !rulerH || !rulerV) return;

    const PAGE_WIDTH_CM = 30;
    const PAGE_HEIGHT_CM = 42;

    const pageRect = canvasPage.getBoundingClientRect();
    const rulerHRect = rulerH.getBoundingClientRect();
    const rulerVRect = rulerV.getBoundingClientRect();

    const pxPerCmH = pageRect.width / PAGE_WIDTH_CM;
    const pxPerCmV = pageRect.height / PAGE_HEIGHT_CM;

    const hStartX = pageRect.left - rulerHRect.left;
    const vStartY = pageRect.top - rulerVRect.top;

    // Horizontal ruler
    let hHTML = '';
    for (let cm = 0; cm <= PAGE_WIDTH_CM; cm++) {
        const x = hStartX + cm * pxPerCmH;
        if (x < -10 || x > rulerHRect.width + 10) continue;

        const isMajor = cm % 5 === 0;
        hHTML += `<div class="ruler-mark ruler-mark-h${isMajor ? ' major' : ''}" style="left:${x.toFixed(1)}px">`;
        if (isMajor) {
            hHTML += `<span class="ruler-num">${cm}</span>`;
        }
        hHTML += '</div>';
    }
    rulerH.innerHTML = hHTML;

    // Vertical ruler
    let vHTML = '';
    for (let cm = 0; cm <= PAGE_HEIGHT_CM; cm++) {
        const y = vStartY + cm * pxPerCmV;
        if (y < -10 || y > rulerVRect.height + 10) continue;

        const isMajor = cm % 5 === 0;
        vHTML += `<div class="ruler-mark ruler-mark-v${isMajor ? ' major' : ''}" style="top:${y.toFixed(1)}px">`;
        if (isMajor) {
            vHTML += `<span class="ruler-num">${cm}</span>`;
        }
        vHTML += '</div>';
    }
    rulerV.innerHTML = vHTML;
}

// ==================== CSS STYLES FOR CALENDAR GRID ====================
const gridStyles = document.createElement('style');
gridStyles.textContent = `
    .calendar-grid-month {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 20px;
    }
    
    .grid-month-name {
        font-size: 24px;
        font-weight: 500;
        text-align: center;
        margin-bottom: 20px;
        color: #333;
    }
    
    .grid-days-header {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 5px;
        margin-bottom: 10px;
    }
    
    .grid-day-name {
        text-align: center;
        font-size: 12px;
        font-weight: 500;
        color: #666;
        padding: 5px;
    }
    
    .grid-day-name.weekend {
        color: #e74c3c;
    }
    
    .grid-days {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 5px;
    }
    
    .grid-day {
        text-align: center;
        padding: 8px;
        font-size: 14px;
        color: #333;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.2s;
    }
    
    .grid-day:hover:not(.empty) {
        background: #f0f0f0;
    }
    
    .grid-day.empty {
        cursor: default;
    }
    
    .grid-day.weekend {
        color: #e74c3c;
    }
    
    .grid-day.holiday {
        background: #fff3cd;
        font-weight: 500;
    }
    
    .grid-holidays-list {
        margin-top: 20px;
        padding-top: 15px;
        border-top: 1px solid #eee;
    }
    
    .grid-holiday-item {
        font-size: 12px;
        color: #666;
        padding: 5px 0;
    }
`;
document.head.appendChild(gridStyles);
