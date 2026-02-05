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
    
    // Загружаем данные в зависимости от страницы
    if (document.getElementById('projects-list')) {
        loadProjects();
    }
    if (document.getElementById('orders-list')) {
        loadOrders();
    }
    // Страница обзора
    if (document.getElementById('projects-preview')) {
        loadDashboardData();
    }
});

// ==================== AUTH CHECK ====================
async function checkAccountAuth() {
    const token = localStorage.getItem('access');
    
    if (!token) {
        window.location.href = '/frontend/index.html';
        return;
    }
    
    try {
        const res = await fetch('http://127.0.0.1:8000/api/auth/me/', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!res.ok) throw new Error('Unauthorized');
        
        const user = await res.json();
        updateAccountUI(user);
        
    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.clear();
        window.location.href = '/frontend/index.html';
    }
}

function updateAccountUI(user) {
    // Обновляем email в настройках
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.value = user.email || '';
    }
    
    const firstNameInput = document.getElementById('first-name');
    if (firstNameInput && user.first_name) {
        firstNameInput.value = user.first_name;
    }
    
    const lastNameInput = document.getElementById('last-name');
    if (lastNameInput && user.last_name) {
        lastNameInput.value = user.last_name;
    }
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

// ==================== GALLERY MODAL ====================
function initGalleryModal() {
    const createCard = document.getElementById('create-gallery-card');
    const createFirstBtn = document.getElementById('create-first-gallery');
    const modal = document.getElementById('create-gallery-modal');
    const closeBtn = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('cancel-create');
    const form = document.getElementById('create-gallery-form');
    
    function openModal() {
        if (modal) modal.classList.add('active');
    }
    
    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
            if (form) form.reset();
            const preview = document.getElementById('upload-preview');
            if (preview) preview.innerHTML = '';
        }
    }
    
    if (createCard) createCard.addEventListener('click', openModal);
    if (createFirstBtn) createFirstBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('gallery-name').value;
            const files = document.getElementById('gallery-files').files;
            
            console.log('Creating gallery:', { name, filesCount: files.length });
            
            // TODO: Отправка на сервер
            alert('Галерея "' + name + '" создана!');
            closeModal();
        });
    }
}

// ==================== PASSWORD MODAL ====================
function initPasswordModal() {
    const openBtn = document.getElementById('change-password-btn');
    const modal = document.getElementById('password-modal');
    const closeBtn = document.getElementById('password-modal-close');
    const cancelBtn = document.getElementById('cancel-password');
    const form = document.getElementById('password-form');
    
    function openModal() {
        if (modal) modal.classList.add('active');
    }
    
    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
            if (form) form.reset();
        }
    }
    
    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            
            if (newPassword !== confirmPassword) {
                alert('Пароли не совпадают');
                return;
            }
            
            if (newPassword.length < 8) {
                alert('Пароль должен содержать минимум 8 символов');
                return;
            }
            
            // TODO: Отправка на сервер
            alert('Пароль изменён!');
            closeModal();
        });
    }
}

// ==================== UPLOAD AREA ====================
function initUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('gallery-files');
    const preview = document.getElementById('upload-preview');
    
    if (!uploadArea || !fileInput) return;
    
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
    });
    
    function handleFiles(files) {
        if (!preview) return;
        
        preview.innerHTML = '';
        preview.style.display = 'flex';
        preview.style.flexWrap = 'wrap';
        preview.style.gap = '10px';
        preview.style.marginTop = '15px';
        
        Array.from(files).slice(0, 10).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.width = '60px';
                img.style.height = '60px';
                img.style.objectFit = 'cover';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
        
        if (files.length > 10) {
            const more = document.createElement('span');
            more.textContent = `+${files.length - 10}`;
            more.style.cssText = 'width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: #f0f0f0; font-size: 14px; color: #666;';
            preview.appendChild(more);
        }
    }
}

// ==================== CATEGORY FILTER ====================
function initCategoryFilter() {
    const categoryItems = document.querySelectorAll('.category-item');
    
    categoryItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            categoryItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const category = item.dataset.category;
            loadProjects(category);
        });
    });
}

// ==================== SETTINGS FORM ====================
function initSettingsForm() {
    const form = document.getElementById('settings-form');
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const data = {
                first_name: document.getElementById('first-name')?.value,
                last_name: document.getElementById('last-name')?.value,
                phone: document.getElementById('phone')?.value,
                city: document.getElementById('city')?.value,
                address: document.getElementById('address')?.value,
                postal_code: document.getElementById('postal-code')?.value,
                user_type: document.getElementById('user-type')?.value,
                notify_orders: document.getElementById('notify-orders')?.checked,
                notify_promo: document.getElementById('notify-promo')?.checked,
                notify_news: document.getElementById('notify-news')?.checked
            };
            
            console.log('Saving settings:', data);
            
            // TODO: Отправка на сервер
            alert('Настройки сохранены!');
        });
    }
}

// ==================== LOAD DATA ====================
function getAuthHeaders() {
    const token = localStorage.getItem('access');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Получить количество фото из JSON data проекта
function getPhotosCountFromProject(project) {
    if (project.data && project.data.photos) {
        return project.data.photos.length;
    }
    return project.photos_count || 0;
}

// ==================== DASHBOARD (ОБЗОР) ====================
async function loadDashboardData() {
    try {
        // Загружаем проекты
        const projectsRes = await fetch(`${API_URL}/projects/`, {
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        
        let projects = [];
        if (projectsRes.ok) {
            projects = await projectsRes.json();
        }
        
        // Загружаем заказы
        const ordersRes = await fetch(`${API_URL}/orders/`, {
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        
        let orders = [];
        if (ordersRes.ok) {
            orders = await ordersRes.json();
        }
        
        // Рендерим проекты (последние 3)
        renderDashboardProjects(projects.slice(0, 3), projects.length);
        
        // Рендерим заказы (последние 3)
        renderDashboardOrders(orders.slice(0, 3), orders.length);
        
        // Обновляем счётчик в сайдбаре
        const navCount = document.getElementById('projects-count');
        if (navCount) navCount.textContent = projects.length;
        
    } catch (e) {
        console.error('Failed to load dashboard data:', e);
    }
}

function renderDashboardProjects(projects, total) {
    const container = document.getElementById('projects-preview');
    const emptyState = document.getElementById('projects-empty');
    const countText = document.getElementById('projects-count-text');
    
    if (!container) return;
    
    if (countText) {
        countText.textContent = `${projects.length} из ${total}`;
    }
    
    if (projects.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    const html = projects.map(project => {
        const date = new Date(project.updated_at).toLocaleDateString('ru-RU');
        const photosCount = getPhotosCountFromProject(project);
        
        return `
            <div class="project-card-small">
                <div class="project-card-preview">
                    <img src="${project.preview_url || '/frontend/images/placeholder.jpg'}" alt="${project.name}">
                </div>
                <div class="project-card-info">
                    <div class="project-card-title">${project.name}</div>
                    <div class="project-card-meta">${project.product_type_name} • ${photosCount} фото</div>
                    <div class="project-card-date">${date}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

function renderDashboardOrders(orders, total) {
    const container = document.getElementById('orders-preview');
    const emptyState = document.getElementById('orders-empty');
    
    if (!container) return;
    
    if (orders.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    const html = orders.map(order => renderOrderCard(order)).join('');
    container.innerHTML = html;
}

async function loadProjects(category = 'all') {
    const container = document.getElementById('projects-list');
    const emptyState = document.getElementById('projects-empty');
    if (!container) return;
    
    try {
        let url = `${API_URL}/projects/`;
        if (category !== 'all') {
            url += `?product_type=${category}`;
        }
        
        const res = await fetch(url, {
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        
        if (!res.ok) throw new Error('Failed to load projects');
        
        const projects = await res.json();
        
        // Обновляем счётчики
        updateProjectCounts(projects);
        
        // Очищаем список (кроме empty state)
        container.querySelectorAll('.project-list-item').forEach(el => el.remove());
        
        if (projects.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        
        if (emptyState) emptyState.style.display = 'none';
        
        // Рендерим проекты
        projects.forEach(project => {
            const html = renderProjectItem(project);
            container.insertAdjacentHTML('beforeend', html);
        });
        
        // Добавляем обработчики
        initProjectActions();
        
    } catch (e) {
        console.error('Failed to load projects:', e);
    }
}

function updateProjectCounts(projects) {
    const counts = {
        all: projects.length,
        prints: 0,
        photobook: 0,
        calendar: 0,
        polaroid: 0,
        canvas: 0,
        postcard: 0
    };
    
    projects.forEach(p => {
        if (counts.hasOwnProperty(p.product_type_code)) {
            counts[p.product_type_code]++;
        }
    });
    
    // Обновляем UI
    const countAll = document.getElementById('count-all');
    if (countAll) countAll.textContent = counts.all;
    
    const countPrints = document.getElementById('count-prints');
    if (countPrints) countPrints.textContent = counts.prints;
    
    const countPhotobooks = document.getElementById('count-photobooks');
    if (countPhotobooks) countPhotobooks.textContent = counts.photobook;
    
    const countCalendars = document.getElementById('count-calendars');
    if (countCalendars) countCalendars.textContent = counts.calendar;
    
    // Счётчик в сайдбаре
    const navCount = document.getElementById('projects-count');
    if (navCount) navCount.textContent = counts.all;
}

function renderProjectItem(project) {
    const date = new Date(project.updated_at).toLocaleDateString('ru-RU');
    const createdDate = new Date(project.created_at).toLocaleDateString('ru-RU');
    
    const statusText = project.status === 'draft' ? 'Черновик' : 
                       project.status === 'ready' ? 'Готов' : 
                       project.status === 'ordered' ? 'Заказан' : project.status;
    
    const photosCount = getPhotosCountFromProject(project);
    
    return `
        <div class="project-list-item" data-id="${project.id}">
            <div class="project-list-preview">
                <img src="${project.preview_url || '/frontend/images/placeholder.jpg'}" alt="Превью">
            </div>
            <div class="project-list-details">
                <h3 class="project-list-title">
                    ${project.name}
                    <span>ID: ${project.short_id}</span>
                </h3>
                <dl class="project-list-meta">
                    <dt>Продукт</dt>
                    <dd>${project.product_type_name}</dd>
                    <dt>Фото</dt>
                    <dd>${photosCount} шт.</dd>
                    <dt>Создан</dt>
                    <dd>${createdDate}</dd>
                    <dt>Изменён</dt>
                    <dd>${date}</dd>
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
                <button class="btn-outline btn-edit-project" data-id="${project.id}">Редактировать</button>
            </div>
        </div>
    `;
}

function initProjectActions() {
    // Удаление проекта
    document.querySelectorAll('.btn-delete-project').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Удалить проект?')) return;
            
            const id = btn.dataset.id;
            try {
                const res = await fetch(`${API_URL}/projects/${id}/`, {
                    method: 'DELETE',
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                
                if (res.ok) {
                    btn.closest('.project-list-item').remove();
                    loadProjects(); // Обновляем счётчики
                }
            } catch (e) {
                console.error('Failed to delete project:', e);
            }
        });
    });
    
    // Редактирование проекта
    document.querySelectorAll('.btn-edit-project').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            // Переходим в приложение печати с ID проекта
            window.location.href = `/frontend/print-app/?project=${id}`;
        });
    });
}

async function loadOrders() {
    const container = document.getElementById('orders-list');
    const emptyState = document.getElementById('orders-empty');
    if (!container) return;
    
    try {
        const res = await fetch(`${API_URL}/orders/`, {
            headers: getAuthHeaders(),
            credentials: 'include'
        });
        
        if (!res.ok) throw new Error('Failed to load orders');
        
        const orders = await res.json();
        
        // Очищаем список (кроме empty state)
        container.querySelectorAll('.order-card').forEach(el => el.remove());
        
        if (orders.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        
        if (emptyState) emptyState.style.display = 'none';
        
        // Рендерим заказы
        orders.forEach(order => {
            const html = renderOrderCard(order);
            container.insertAdjacentHTML('beforeend', html);
        });
        
    } catch (e) {
        console.error('Failed to load orders:', e);
    }
}

function renderOrderCard(order) {
    const date = new Date(order.created_at).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    const statusMap = {
        'processing': { text: 'В обработке', class: 'status-processing' },
        'accepted': { text: 'Принят в работу', class: 'status-production' },
        'ready': { text: 'Готов', class: 'status-delivered' }
    };
    
    const status = statusMap[order.status] || { text: order.status, class: '' };
    const summary = order.items_summary ? order.items_summary.join(', ') : 'Фотопечать';
    
    return `
        <div class="order-card" data-id="${order.id}">
            <div class="order-preview">
                <img src="/frontend/images/placeholder.jpg" alt="Заказ">
            </div>
            <div class="order-details">
                <div class="order-number">Заказ #${order.order_number}</div>
                <div class="order-items-summary">${summary}</div>
                <div class="order-date">${date}</div>
            </div>
            <span class="order-status ${status.class}">${status.text}</span>
            <div class="order-total">${order.total_price} ₽</div>
            <div class="order-actions">
                <button class="btn-outline btn-order-details" data-id="${order.id}">Подробнее</button>
            </div>
        </div>
    `;
}
