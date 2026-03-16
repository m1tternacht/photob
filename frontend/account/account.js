// ==================== ACCOUNT JS ====================

const API_URL = 'http://127.0.0.1:8000/api';

document.addEventListener('DOMContentLoaded', () => {
    checkAccountAuth();
    initLogout();
    initGalleryModal();
    initPasswordModal();
    initUploadArea();
    initCategoryFilter();
    initSettingsForm();

    if (document.getElementById('projects-list')) {
        loadProjects();
        // Сортировка проектов
        const sortBy = document.getElementById('sort-by');
        if (sortBy) sortBy.addEventListener('change', () => renderProjectList());
    }
    if (document.getElementById('orders-list')) {
        loadOrders();
        // Фильтр заказов по статусу
        const filterStatus = document.getElementById('filter-status');
        if (filterStatus) filterStatus.addEventListener('change', () => renderOrderList());
    }
    if (document.getElementById('dashboard-root')) {
        loadDashboardData();
    }
});

// ==================== AUTH CHECK ====================

async function checkAccountAuth() {
    const token = localStorage.getItem('access');
    if (!token) { window.location.href = '/frontend/index.html'; return; }

    try {
        const res = await fetch(`${API_URL}/auth/me/`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Unauthorized');

        const user = await res.json();
        localStorage.setItem('username', user.username);
        updateAccountUI(user);

        // Загружаем счётчики в навигации на всех страницах
        loadNavCounts();

    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('access');
        localStorage.removeItem('refresh');
        localStorage.removeItem('username');
        window.location.href = '/frontend/index.html';
    }
}

function updateAccountUI(user) {
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = user.email || '';
    const firstNameInput = document.getElementById('first-name');
    if (firstNameInput && user.first_name) firstNameInput.value = user.first_name;
    const lastNameInput = document.getElementById('last-name');
    if (lastNameInput && user.last_name) lastNameInput.value = user.last_name;
}

// ==================== NAV COUNTS (все страницы) ====================

async function loadNavCounts() {
    const headers = getAuthHeaders();
    try {
        const [projectsRes, ordersRes, galleriesRes] = await Promise.all([
            fetch(`${API_URL}/projects/`, { headers }),
            fetch(`${API_URL}/orders/`, { headers }),
            fetch(`${API_URL}/galleries/`, { headers }),
        ]);

        const projects  = projectsRes.ok  ? await projectsRes.json()  : [];
        const orders    = ordersRes.ok    ? await ordersRes.json()    : [];
        const galleries = galleriesRes.ok ? await galleriesRes.json() : [];

        setNavCount('projects-count',  projects.length);
        setNavCount('orders-count',    orders.length);
        setNavCount('galleries-count', galleries.length);
    } catch (e) {
        console.error('loadNavCounts error:', e);
    }
}

function setNavCount(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (value > 0) el.classList.add('loaded');
}

// ==================== LOGOUT ====================

function initLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите выйти?')) {
                localStorage.clear();
                window.location.href = '/frontend/index.html';
            }
        });
    }
}

// ==================== GALLERY MODAL (legacy — на страницах без galleries.js) ====================

function initGalleryModal() {
    // galleries.html использует свой galleries.js — здесь только fallback
    const modal = document.getElementById('create-gallery-modal');
    if (!modal) return;
    // Если подключён galleries.js — он перехватит всё сам
    if (typeof initGalleryPage === 'function') return;

    const closeBtn    = document.getElementById('modal-close');
    const cancelBtn   = document.getElementById('cancel-create');
    const createCard  = document.getElementById('create-gallery-card');
    const firstBtn    = document.getElementById('create-first-gallery');

    const open  = () => modal.classList.add('active');
    const close = () => modal.classList.remove('active');

    if (createCard) createCard.addEventListener('click', open);
    if (firstBtn)   firstBtn.addEventListener('click', open);
    if (closeBtn)   closeBtn.addEventListener('click', close);
    if (cancelBtn)  cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

// ==================== PASSWORD MODAL ====================

function initPasswordModal() {
    const openBtn   = document.getElementById('change-password-btn');
    const modal     = document.getElementById('password-modal');
    const closeBtn  = document.getElementById('password-modal-close');
    const cancelBtn = document.getElementById('cancel-password');
    const form      = document.getElementById('password-form');

    if (!modal) return;

    const open  = () => modal.classList.add('active');
    const close = () => { modal.classList.remove('active'); if (form) form.reset(); };

    if (openBtn)    openBtn.addEventListener('click', open);
    if (closeBtn)   closeBtn.addEventListener('click', close);
    if (cancelBtn)  cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPwd     = document.getElementById('new-password').value;
            const confirmPwd = document.getElementById('confirm-password').value;
            if (newPwd !== confirmPwd)    { alert('Пароли не совпадают'); return; }
            if (newPwd.length < 8)        { alert('Пароль должен содержать минимум 8 символов'); return; }
            alert('Пароль изменён!');
            close();
        });
    }
}

// ==================== UPLOAD AREA ====================

function initUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput  = document.getElementById('gallery-files');
    const preview    = document.getElementById('upload-preview');
    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));

    function handleFiles(files) {
        if (!preview) return;
        preview.innerHTML = '';
        preview.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:15px;';
        Array.from(files).slice(0, 10).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.cssText = 'width:60px;height:60px;object-fit:cover;';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
        if (files.length > 10) {
            const more = document.createElement('span');
            more.textContent = `+${files.length - 10}`;
            more.style.cssText = 'width:60px;height:60px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;font-size:14px;color:#666;';
            preview.appendChild(more);
        }
    }
}

// ==================== CATEGORY FILTER (projects.html) ====================

// Маппинг: data-category в HTML → код product_type в API
const CATEGORY_TO_API = {
    'all':        'all',
    'photobooks': 'photobook',
    'prints':     'prints',
    'calendars':  'calendar',
    'canvas':     'canvas',
    'postcards':  'postcard',
    'gifts':      'gift',
    'polaroid':   'polaroid',
};

function initCategoryFilter() {
    document.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const rawCategory = item.dataset.category;
            _currentProjectCategory = CATEGORY_TO_API[rawCategory] || rawCategory;
            renderProjectList(); // перерисовываем из кэша, без запроса
        });
    });
}

// ==================== SETTINGS FORM ====================

function initSettingsForm() {
    const form = document.getElementById('settings-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Saving settings...');
        alert('Настройки сохранены!');
    });
}

// ==================== AUTH HEADERS ====================

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access')}`
    };
}

function getPhotosCountFromProject(project) {
    if (project.data && project.data.photos) return project.data.photos.length;
    return project.photos_count || 0;
}

// ==================== DASHBOARD ====================

async function loadDashboardData() {
    const headers = getAuthHeaders();
    try {
        const [projectsRes, ordersRes, galleriesRes] = await Promise.all([
            fetch(`${API_URL}/projects/`,  { headers }),
            fetch(`${API_URL}/orders/`,    { headers }),
            fetch(`${API_URL}/galleries/`, { headers }),
        ]);

        const projects  = projectsRes.ok  ? await projectsRes.json()  : [];
        const orders    = ordersRes.ok    ? await ordersRes.json()    : [];
        const galleries = galleriesRes.ok ? await galleriesRes.json() : [];

        renderDashboardGalleries(galleries);
        renderDashboardProjects(projects);
        renderDashboardOrders(orders);

    } catch (e) {
        console.error('Failed to load dashboard data:', e);
    }
}

function renderDashboardGalleries(galleries) {
    const grid = document.getElementById('dash-galleries-grid');
    if (!grid) return;

    const total = galleries.length;
    const el = document.getElementById('dash-galleries-total');
    if (el) el.textContent = `${total} галере${total === 1 ? 'я' : total < 5 ? 'и' : 'й'}`;

    grid.innerHTML = '';

    if (total === 0) {
        grid.innerHTML = '<p class="dash-empty">Нет галерей</p>';
        return;
    }

    galleries.slice(0, 5).forEach(g => {
        const count    = g.photos_count || 0;
        const previews = g.preview_photos || [];
        let cells = '';
        for (let i = 0; i < 4; i++) {
            cells += previews[i]
                ? `<div class="gallery-preview-cell"><img src="${previews[i]}" alt="" loading="lazy"></div>`
                : `<div class="gallery-preview-cell"><div class="gallery-preview-placeholder"></div></div>`;
        }
        const card = document.createElement('div');
        card.className = 'gallery-card';
        card.innerHTML = `
            <div class="gallery-preview">
                <div class="gallery-photo-count"><span>${count}</span> фото</div>
                ${cells}
            </div>
            <div class="gallery-info">
                <div class="gallery-name">${escHtml(g.name)}</div>
                <div class="gallery-date">${fmtDate(g.created_at)}</div>
            </div>`;
        card.addEventListener('click', () => { window.location.href = 'galleries.html'; });
        grid.appendChild(card);
    });
}

function renderDashboardProjects(projects) {
    const grid = document.getElementById('dash-projects-grid');
    if (!grid) return;

    const total = projects.length;
    const el = document.getElementById('dash-projects-total');
    if (el) el.textContent = `${total} проект${total === 1 ? '' : total < 5 ? 'а' : 'ов'}`;

    grid.innerHTML = '';

    if (total === 0) {
        grid.innerHTML = '<p class="dash-empty">Нет проектов</p>';
        return;
    }

    projects.slice(0, 5).forEach(p => {
        const photoCount = getPhotosCountFromProject(p);
        const card = document.createElement('div');
        card.className = 'gallery-card';
        const imgContent = p.preview_url
            ? `<img src="${p.preview_url}" alt="">`
            : `<div class="dash-no-photo">📷</div>`;
        card.innerHTML = `
            <div class="gallery-preview dash-single-preview">
                <div class="gallery-photo-count"><span>${photoCount}</span> фото</div>
                ${imgContent}
            </div>
            <div class="gallery-info">
                <div class="gallery-name">${escHtml(p.name)}</div>
                <div class="gallery-date">${p.product_type_name || ''} · ${fmtDate(p.updated_at)}</div>
            </div>`;
        card.addEventListener('click', () => { window.location.href = 'projects.html'; });
        grid.appendChild(card);
    });
}

function renderDashboardOrders(orders) {
    const grid = document.getElementById('dash-orders-grid');
    if (!grid) return;

    const total = orders.length;
    const el = document.getElementById('dash-orders-total');
    if (el) el.textContent = `${total} заказ${total === 1 ? '' : total < 5 ? 'а' : 'ов'}`;

    grid.innerHTML = '';

    if (total === 0) {
        grid.innerHTML = '<p class="dash-empty">Нет заказов</p>';
        return;
    }

    const STATUS = {
        'processing': { text: 'В обработке', bg: 'bg-processing' },
        'accepted':   { text: 'Принят в работу', bg: 'bg-accepted' },
        'ready':      { text: 'Готов', bg: 'bg-ready' },
    };

    orders.slice(0, 5).forEach(o => {
        const s       = STATUS[o.status] || { text: o.status, bg: '' };
        const summary = (o.items_summary || []).join(', ') || '—';
        const card    = document.createElement('div');
        card.className = 'gallery-card';
        card.innerHTML = `
            <div class="gallery-preview dash-order-preview ${s.bg}">
                <div class="order-dash-status">${s.text}</div>
                <div class="order-dash-number">${o.order_number}</div>
                <div class="order-dash-summary">${escHtml(summary)}</div>
                <div class="order-dash-total">${o.total_price} ₽</div>
            </div>
            <div class="gallery-info">
                <div class="gallery-name">${o.order_number}</div>
                <div class="gallery-date">${fmtDate(o.created_at)}</div>
            </div>`;
        card.addEventListener('click', () => { window.location.href = 'orders.html'; });
        grid.appendChild(card);
    });
}

// ==================== PROJECTS ====================

// Кэш проектов для сортировки без повторных запросов
let _allProjects = [];
let _currentProjectCategory = 'all';

async function loadProjects(apiCode = 'all') {
    _currentProjectCategory = apiCode;
    try {
        const res = await fetch(`${API_URL}/projects/`, {
            headers: getAuthHeaders(), credentials: 'include'
        });
        if (!res.ok) throw new Error('Failed');
        _allProjects = await res.json();
        updateProjectCounts(_allProjects);
        renderProjectList();
    } catch (e) {
        console.error('Failed to load projects:', e);
    }
}

function renderProjectList() {
    const container  = document.getElementById('projects-list');
    const emptyState = document.getElementById('projects-empty');
    if (!container) return;

    // Фильтр по категории
    let projects = _currentProjectCategory === 'all'
        ? [..._allProjects]
        : _allProjects.filter(p => p.product_type_code === _currentProjectCategory);

    // Сортировка
    const sortVal = document.getElementById('sort-by')?.value || 'date-desc';
    if (sortVal === 'date-desc') {
        projects.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    } else if (sortVal === 'date-asc') {
        projects.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
    } else if (sortVal === 'name') {
        projects.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }

    container.querySelectorAll('.project-list-item').forEach(el => el.remove());

    if (projects.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    projects.forEach(project => {
        container.insertAdjacentHTML('beforeend', renderProjectItem(project));
    });
    initProjectActions();
}

function updateProjectCounts(projects) {
    // API коды → количество
    const counts = {};
    projects.forEach(p => {
        const code = p.product_type_code;
        counts[code] = (counts[code] || 0) + 1;
    });

    // Маппинг HTML id → API код
    const idToCode = {
        'count-all':       null,           // все
        'count-prints':    'prints',
        'count-photobooks':'photobook',
        'count-calendars': 'calendar',
        'count-canvas':    'canvas',
        'count-polaroid':  'polaroid',
        'count-postcards': 'postcard',
        'count-gifts':     'gift',
    };

    const total = projects.length;
    const allEl = document.getElementById('count-all');
    if (allEl) allEl.textContent = total;

    Object.entries(idToCode).forEach(([elId, apiCode]) => {
        if (!apiCode) return;
        const el = document.getElementById(elId);
        if (el) el.textContent = counts[apiCode] || 0;
    });

    // Счётчик в сайдбаре
    setNavCount('projects-count', total);
}

function renderProjectItem(project) {
    const updatedDate = new Date(project.updated_at).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const createdDate = new Date(project.created_at).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const statusText = { draft: 'Черновик', ready: 'Готов', ordered: 'Заказан' }[project.status] || project.status;
    const photosCount = getPhotosCountFromProject(project);

    return `
        <div class="project-list-item" data-id="${project.id}">
            <div class="project-list-preview">
                <img src="${project.preview_url || '/frontend/images/placeholder.jpg'}" alt="Превью">
            </div>
            <div class="project-list-details">
                <h3 class="project-list-title">
                    ${escHtml(project.name)}
                    <span>ID: ${project.short_id}</span>
                </h3>
                <dl class="project-list-meta">
                    <dt>Продукт</dt><dd>${project.product_type_name}</dd>
                    <dt>Фото</dt><dd>${photosCount} шт.</dd>
                    <dt>Создан</dt><dd>${createdDate}</dd>
                    <dt>Изменён</dt><dd>${updatedDate}</dd>
                </dl>
            </div>
            <div class="project-list-actions">
                <div class="project-status">
                    <span class="project-status-label">Статус</span>
                    <span class="project-status-value">${statusText}</span>
                </div>
                <div class="project-action-btns">
                    <button class="project-icon-btn btn-delete-project" data-id="${project.id}" title="Удалить">🗑️</button>
                </div>
                <button class="btn-outline btn-edit-project" data-id="${project.id}" data-type="${project.product_type_code}">Редактировать</button>
            </div>
        </div>`;
}

function initProjectActions() {
    document.querySelectorAll('.btn-delete-project').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Удалить проект?')) return;
            const id = btn.dataset.id;
            try {
                const res = await fetch(`${API_URL}/projects/${id}/`, {
                    method: 'DELETE', headers: getAuthHeaders(), credentials: 'include'
                });
                if (res.ok) loadProjects();
            } catch (e) { console.error('Failed to delete project:', e); }
        });
    });

    document.querySelectorAll('.btn-edit-project').forEach(btn => {
        btn.addEventListener('click', () => {
            const id   = btn.dataset.id;
            const type = btn.dataset.type || 'prints';
            const appUrls = {
                prints:    '/frontend/print-app/',
                polaroid:  '/frontend/polaroid-app/',
                canvas:    '/frontend/canvas-app/',
                calendar:  '/frontend/calendar-app/',
                photobook: '/frontend/photobook-app/',
            };
            window.location.href = `${appUrls[type] || '/frontend/print-app/'}?project_id=${id}`;
        });
    });
}

// ==================== ORDERS ====================

// Кэш заказов для фильтрации без повторных запросов
let _allOrders = [];

async function loadOrders() {
    try {
        const res = await fetch(`${API_URL}/orders/`, {
            headers: getAuthHeaders(), credentials: 'include'
        });
        if (!res.ok) throw new Error('Failed');
        _allOrders = await res.json();
        renderOrderList();
    } catch (e) { console.error('Failed to load orders:', e); }
}

function renderOrderList() {
    const container  = document.getElementById('orders-list');
    const emptyState = document.getElementById('orders-empty');
    if (!container) return;

    // Фильтр по статусу
    const statusVal = document.getElementById('filter-status')?.value || 'all';
    const orders = statusVal === 'all'
        ? [..._allOrders]
        : _allOrders.filter(o => o.status === statusVal);

    container.querySelectorAll('.order-card').forEach(el => el.remove());

    if (orders.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    orders.forEach(order => {
        container.insertAdjacentHTML('beforeend', renderOrderCard(order));
    });
}

function renderOrderCard(order) {
    const date = new Date(order.created_at).toLocaleString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const statusMap = {
        'processing': { text: 'В обработке',    cls: 'status-processing' },
        'accepted':   { text: 'Принят в работу', cls: 'status-production' },
        'ready':      { text: 'Готов',           cls: 'status-delivered' },
    };
    const s       = statusMap[order.status] || { text: order.status, cls: '' };
    const summary = (order.items_summary || []).join(', ') || 'Фотопечать';

    return `
        <div class="order-card" data-id="${order.id}">
            <div class="order-preview">
                <img src="/frontend/images/placeholder.jpg" alt="Заказ">
            </div>
            <div class="order-details">
                <div class="order-number">Заказ #${order.order_number}</div>
                <div class="order-items-summary">${escHtml(summary)}</div>
                <div class="order-date">${date}</div>
            </div>
            <span class="order-status ${s.cls}">${s.text}</span>
            <div class="order-total">${order.total_price} ₽</div>
            <div class="order-actions">
                <button class="btn-outline btn-order-details" data-id="${order.id}">Подробнее</button>
            </div>
        </div>`;
}

// ==================== UTILS ====================

function escHtml(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}
