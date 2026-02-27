// ==================== APP HEADER MODULE ====================
// Общий хэдер для всех приложений с авторизацией
// Стилизован как на основном сайте

const AppHeader = {
    currentUser: null,
    isAuthenticated: false,
    API_BASE: 'http://127.0.0.1:8000/api',
    
    // Инициализация хэдера
    init() {
        this.renderHeader();
        this.bindEvents();
        this.checkAuth();
    },
    
    // Рендер хэдера
    renderHeader() {
        const headerContainer = document.getElementById('app-header-container');
        if (!headerContainer) return;
        
        headerContainer.innerHTML = `
            <header class="app-header">
                <a href="/frontend/index.html" class="app-logo">
                    <img src="/frontend/images/logo_photobond.png" alt="Photobond">
                </a>
                <div class="app-user">
                    <a href="#" class="app-auth-link" id="app-auth-toggle">
                        <img src="/frontend/images/icon-user.png" alt="Пользователь" class="app-auth-icon">
                        <span class="app-auth-text" id="app-auth-text">Регистрация/Войти</span>
                    </a>
                </div>
                
                <!-- Auth dropdown - форма входа/регистрации -->
                <div class="app-auth-dropdown" id="app-auth-dropdown">
                    <!-- Форма входа -->
                    <form class="app-auth-form app-login-form active" id="app-login-form">
                        <h3>Вход</h3>
                        <label>
                            Логин:
                            <input type="text" name="username" placeholder="Имя пользователя" required>
                        </label>
                        <label>
                            Пароль:
                            <input type="password" name="password" placeholder="Пароль" required>
                        </label>
                        <button type="submit" class="app-btn">Войти</button>
                        <p class="app-switch-text">Впервые на нашем сайте? <span class="app-switch-link" id="app-show-register"><b>Зарегистрируйтесь</b></span></p>
                    </form>
                  
                    <!-- Форма регистрации -->
                    <form class="app-auth-form app-register-form" id="app-register-form">
                        <h3>Регистрация</h3>
                        <label>
                            Имя пользователя:
                            <input type="text" name="username" placeholder="Имя пользователя" required>
                        </label>
                        <label>
                            E-mail:
                            <input type="email" name="email" placeholder="Введите email" required>
                        </label>
                        <label>
                            Пароль:
                            <input type="password" name="password" placeholder="Введите пароль" required>
                        </label>
                        <button type="submit" class="app-btn">Зарегистрироваться</button>
                        <p class="app-switch-text">Есть аккаунт? <span class="app-switch-link" id="app-show-login">Войдите</span></p>
                    </form>
                    
                    <!-- Сообщение для заказа -->
                    <div class="app-auth-message" id="app-auth-message">
                        <p>Для оформления заказа необходимо войти или зарегистрироваться</p>
                    </div>
                  
                    <button class="app-close-btn" id="app-auth-close">
                        <img src="/frontend/images/icon-cross.png" alt="Закрыть" class="app-close-icon">
                    </button>
                </div>
                
                <!-- User menu dropdown - меню для авторизованного пользователя -->
                <div class="app-auth-dropdown app-user-menu-dropdown" id="app-user-menu-dropdown">
                    <h3 id="app-user-menu-greeting">Личный кабинет</h3>
                    <nav class="app-user-menu-nav">
                        <a href="/frontend/account/index.html" class="app-user-menu-item">Обзор</a>
                        <a href="/frontend/account/projects.html" class="app-user-menu-item">Мои проекты</a>
                        <a href="/frontend/account/orders.html" class="app-user-menu-item">Заказы</a>
                        <a href="/frontend/account/galleries.html" class="app-user-menu-item">Галереи</a>
                        <a href="/frontend/account/settings.html" class="app-user-menu-item">Настройки</a>
                    </nav>
                    <div class="app-user-menu-divider"></div>
                    <button class="app-user-menu-logout" id="app-logout-btn">Выйти</button>
                    <button class="app-close-btn" id="app-user-menu-close">
                        <img src="/frontend/images/icon-cross.png" alt="Закрыть" class="app-close-icon">
                    </button>
                </div>
            </header>
        `;
        
        // Добавляем модалку авторизации
        this.renderAuthModal();
    },
    
    // Рендер модалки авторизации (для кнопки в модалке заказа)
    renderAuthModal() {
        // Проверяем, не существует ли уже модалка
        if (document.getElementById('app-auth-modal')) return;
        
        const modal = document.createElement('div');
        modal.className = 'app-auth-modal';
        modal.id = 'app-auth-modal';
        modal.innerHTML = `
            <div class="app-auth-modal-content">
                <!-- Форма входа -->
                <form class="app-auth-form app-login-form active" id="app-modal-login-form">
                    <h3>Вход</h3>
                    <label>
                        Логин:
                        <input type="text" name="username" placeholder="Имя пользователя" required>
                    </label>
                    <label>
                        Пароль:
                        <input type="password" name="password" placeholder="Пароль" required>
                    </label>
                    <button type="submit" class="app-btn">Войти</button>
                    <p class="app-switch-text">Впервые на нашем сайте? <span class="app-switch-link" id="app-modal-show-register"><b>Зарегистрируйтесь</b></span></p>
                </form>
              
                <!-- Форма регистрации -->
                <form class="app-auth-form app-register-form" id="app-modal-register-form">
                    <h3>Регистрация</h3>
                    <label>
                        Имя пользователя:
                        <input type="text" name="username" placeholder="Имя пользователя" required>
                    </label>
                    <label>
                        E-mail:
                        <input type="email" name="email" placeholder="Введите email" required>
                    </label>
                    <label>
                        Пароль:
                        <input type="password" name="password" placeholder="Введите пароль" required>
                    </label>
                    <button type="submit" class="app-btn">Зарегистрироваться</button>
                    <p class="app-switch-text">Есть аккаунт? <span class="app-switch-link" id="app-modal-show-login">Войдите</span></p>
                </form>
              
                <button class="app-close-btn" id="app-modal-close">
                    <img src="/frontend/images/icon-cross.png" alt="Закрыть" class="app-close-icon">
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    // Привязка событий
    bindEvents() {
        // Клик по ссылке авторизации
        document.getElementById('app-auth-toggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (this.isAuthenticated) {
                // Показываем меню пользователя
                this.hideAuthDropdown();
                this.toggleUserMenu();
            } else {
                // Показываем форму входа
                this.hideUserMenu();
                this.toggleAuthDropdown();
            }
        });
        
        // Закрытие по клику вне dropdown
        document.addEventListener('click', (e) => {
            const authDropdown = document.getElementById('app-auth-dropdown');
            const userMenu = document.getElementById('app-user-menu-dropdown');
            const authToggle = document.getElementById('app-auth-toggle');
            
            if (!authDropdown?.contains(e.target) && !authToggle?.contains(e.target)) {
                this.hideAuthDropdown();
            }
            if (!userMenu?.contains(e.target) && !authToggle?.contains(e.target)) {
                this.hideUserMenu();
            }
        });
        
        // Кнопки закрытия
        document.getElementById('app-auth-close')?.addEventListener('click', () => {
            this.hideAuthDropdown();
        });
        
        document.getElementById('app-user-menu-close')?.addEventListener('click', () => {
            this.hideUserMenu();
        });
        
        // Кнопка выхода
        document.getElementById('app-logout-btn')?.addEventListener('click', () => {
            this.logout();
        });
        
        // Переключение форм
        document.getElementById('app-show-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchAuthForm('register');
        });
        
        document.getElementById('app-show-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchAuthForm('login');
        });
        
        // Отправка форм (dropdown)
        document.getElementById('app-login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.login(e.target);
        });
        
        document.getElementById('app-register-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.register(e.target);
        });
        
        // === МОДАЛКА АВТОРИЗАЦИИ ===
        
        // Закрытие модалки
        document.getElementById('app-modal-close')?.addEventListener('click', () => {
            this.hideAuthModal();
        });
        
        document.getElementById('app-auth-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'app-auth-modal') {
                this.hideAuthModal();
            }
        });
        
        // Переключение форм в модалке
        document.getElementById('app-modal-show-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchModalForm('register');
        });
        
        document.getElementById('app-modal-show-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchModalForm('login');
        });
        
        // Отправка форм (модалка)
        document.getElementById('app-modal-login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.login(e.target, true);
        });
        
        document.getElementById('app-modal-register-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.register(e.target, true);
        });
    },
    
    // Проверка авторизации - просто читаем из localStorage
    checkAuth() {
        const token = localStorage.getItem('access');
        const username = localStorage.getItem('username');
        
        if (token && username) {
            this.currentUser = { username };
            this.isAuthenticated = true;
            this.updateUI({ username });
        } else {
            this.currentUser = null;
            this.isAuthenticated = false;
            this.updateUI(null);
        }
    },
    
    // Обновление UI
    updateUI(user) {
        const authText = document.getElementById('app-auth-text');
        const userGreeting = document.getElementById('app-user-menu-greeting');
        
        if (user) {
            this.isAuthenticated = true;
            this.currentUser = user;
            if (authText) {
                authText.textContent = user.username;
            }
            if (userGreeting) {
                userGreeting.textContent = `Привет, ${user.username}!`;
            }
        } else {
            this.isAuthenticated = false;
            this.currentUser = null;
            if (authText) {
                authText.textContent = 'Регистрация/Войти';
            }
        }
    },
    
    // Показать/скрыть dropdown авторизации
    toggleAuthDropdown() {
        const dropdown = document.getElementById('app-auth-dropdown');
        dropdown?.classList.toggle('active');
    },
    
    hideAuthDropdown() {
        const dropdown = document.getElementById('app-auth-dropdown');
        dropdown?.classList.remove('active');
    },
    
    showAuthDropdown(showMessage = false) {
        const dropdown = document.getElementById('app-auth-dropdown');
        const message = document.getElementById('app-auth-message');
        
        if (message) {
            message.style.display = showMessage ? 'block' : 'none';
        }
        
        dropdown?.classList.add('active');
        this.switchAuthForm('login');
    },
    
    // Показать/скрыть меню пользователя
    toggleUserMenu() {
        const menu = document.getElementById('app-user-menu-dropdown');
        menu?.classList.toggle('active');
    },
    
    hideUserMenu() {
        const menu = document.getElementById('app-user-menu-dropdown');
        menu?.classList.remove('active');
    },
    
    // Переключение форм (dropdown)
    switchAuthForm(form) {
        const loginForm = document.getElementById('app-login-form');
        const registerForm = document.getElementById('app-register-form');
        
        if (form === 'register') {
            loginForm?.classList.remove('active');
            registerForm?.classList.add('active');
        } else {
            registerForm?.classList.remove('active');
            loginForm?.classList.add('active');
        }
    },
    
    // === МОДАЛКА АВТОРИЗАЦИИ ===
    
    showAuthModal() {
        const modal = document.getElementById('app-auth-modal');
        modal?.classList.add('active');
        this.switchModalForm('login');
    },
    
    hideAuthModal() {
        const modal = document.getElementById('app-auth-modal');
        modal?.classList.remove('active');
    },
    
    // Переключение форм (модалка)
    switchModalForm(form) {
        const loginForm = document.getElementById('app-modal-login-form');
        const registerForm = document.getElementById('app-modal-register-form');
        
        if (form === 'register') {
            loginForm?.classList.remove('active');
            registerForm?.classList.add('active');
        } else {
            registerForm?.classList.remove('active');
            loginForm?.classList.add('active');
        }
    },
    
    // Вход
    async login(form, isModal = false) {
        const formData = new FormData(form);
        const username = formData.get('username');
        const password = formData.get('password');
        
        try {
            const res = await fetch(`${this.API_BASE}/auth/login/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                localStorage.setItem('access', data.access);
                localStorage.setItem('refresh', data.refresh);
                localStorage.setItem('username', username);
                this.checkAuth();
                
                if (isModal) {
                    this.hideAuthModal();
                    // Обновляем состояние модалки заказа если она открыта
                    if (typeof updateOrderModalAuthState === 'function') {
                        updateOrderModalAuthState();
                    }
                } else {
                    this.hideAuthDropdown();
                }
                form.reset();
                
                // Переносим проект из localStorage в БД
                if (typeof window.onUserLogin === 'function') {
                    window.onUserLogin();
                }
            } else {
                alert(data.detail || 'Ошибка входа');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Ошибка соединения');
        }
    },
    
    // Регистрация
    async register(form, isModal = false) {
        const formData = new FormData(form);
        const username = formData.get('username');
        const email = formData.get('email');
        const password = formData.get('password');
        
        try {
            const res = await fetch(`${this.API_BASE}/auth/register/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                // Автоматический вход после регистрации
                const loginRes = await fetch(`${this.API_BASE}/auth/login/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const loginData = await loginRes.json();
                
                if (loginRes.ok) {
                    localStorage.setItem('access', loginData.access);
                    localStorage.setItem('refresh', loginData.refresh);
                    localStorage.setItem('username', username);
                    this.checkAuth();
                    
                    if (isModal) {
                        this.hideAuthModal();
                        // Обновляем состояние модалки заказа если она открыта
                        if (typeof updateOrderModalAuthState === 'function') {
                            updateOrderModalAuthState();
                        }
                    } else {
                        this.hideAuthDropdown();
                    }
                    form.reset();
                    
                    // Переносим проект из localStorage в БД
                    if (typeof window.onUserLogin === 'function') {
                        window.onUserLogin();
                    }
                }
            } else {
                alert(data.detail || data.username?.[0] || data.email?.[0] || 'Ошибка регистрации');
            }
        } catch (error) {
            console.error('Register error:', error);
            alert('Ошибка соединения');
        }
    },
    
    // Выход
    logout() {
        localStorage.removeItem('access');
        localStorage.removeItem('refresh');
        localStorage.removeItem('username');
        this.currentUser = null;
        this.isAuthenticated = false;
        this.updateUI(null);
        this.hideUserMenu();
    },
    
    // Публичные методы для использования в приложениях
    isLoggedIn() {
        return this.isAuthenticated;
    },
    
    getUser() {
        return this.currentUser;
    },
    
    // Показать форму авторизации (для заказа)
    requireAuth() {
        if (!this.isAuthenticated) {
            this.showAuthDropdown(true);
            return false;
        }
        return true;
    }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    AppHeader.init();
});

// Экспорт для использования в других модулях
window.AppHeader = AppHeader;
