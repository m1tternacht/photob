// scripts.js
let submenuData = {};

// Определяем базовый путь к frontend в зависимости от текущей страницы
function getBasePath() {
  const path = window.location.pathname;
  // Если мы в подпапке (например /frontend/account/)
  if (path.includes('/account/')) {
    return '/frontend/';
  }
  // Если мы в корне frontend
  if (path.includes('/frontend/')) {
    return '/frontend/';
  }
  // Fallback для локальной разработки
  return '';
}

document.addEventListener('DOMContentLoaded', () => {
    const basePath = getBasePath();
    
    fetch(basePath + 'header.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('header-container').innerHTML = data;
            initHeaderElements();
            extractSubmenuData();
            if (document.querySelector('.submenu-cards')) {
                initSubmenuCards();
            }
        })
        .catch(error => console.error('Ошибка загрузки шапки:', error));

    fetch(basePath + 'footer-common.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('footer-common-container').innerHTML = data;
            initFooterAccordions();
        })
        .catch(error => console.error('Ошибка загрузки нижних блоков:', error));

    if (document.getElementById('recommendations-container')) {
        fetch(basePath + 'recommendations.html')
            .then(response => response.text())
            .then(data => {
                document.getElementById('recommendations-container').innerHTML = data;
                initRecommendations();
            })
            .catch(error => console.error('Ошибка загрузки рекомендаций:', error));
    }

    if (document.querySelector('.purchase-options')) {
        // Ждём загрузки других скриптов (product-config.js)
        // Если он загружен - он сам управляет ценами
        setTimeout(() => {
            if (!window.initProductPage) {
                initPurchaseOptions();
            }
        }, 0);
    }

    if (document.querySelector('.image-stack')) {
        initSlider();
    }
});

function initHeaderElements() {

    const overlay = document.querySelector('#overlay');
    // Поиск
    const searchForm = document.querySelector('.search-form');
    const searchIconMobile = document.querySelector('.search-icon-mobile');
    const searchMobileBlock = document.querySelector('#search-mobile-block');
    const searchCloseBtn = document.querySelector('.search-close-btn');

    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Поиск:', searchForm.querySelector('.search-input').value);
        });
    }

    if (searchIconMobile && searchMobileBlock && overlay) {
        searchIconMobile.addEventListener('click', () => {
            searchMobileBlock.classList.add('active');
            overlay.classList.add('active');
        });

        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', () => {
                searchMobileBlock.classList.remove('active');
                overlay.classList.remove('active');
            });
        }

        overlay.addEventListener('click', (e) => {
            if (searchMobileBlock.classList.contains('active') && !searchMobileBlock.contains(e.target)) {
                searchMobileBlock.classList.remove('active');
                overlay.classList.remove('active');
            }
        });
    }

    // ==================== AUTH ====================
    initAuth();
    
    // ==================== КОРЗИНА ====================
    const cartToggle = document.getElementById('cart-toggle');
    const cartDropdown = document.getElementById('cart-dropdown');
    const cartCloseBtn = cartDropdown?.querySelector('.close-btn');
    const cartItems = cartDropdown?.querySelector('.cart-items');
    const cartEmpty = cartDropdown?.querySelector('.cart-empty');
    const checkoutBtn = cartDropdown?.querySelector('.checkout-btn');

    let cart = [];

    function updateCart() {
        if (!cartItems) return;
        cartItems.innerHTML = '';
        if (cart.length === 0) {
            cartEmpty?.classList.add('active');
            if (checkoutBtn) checkoutBtn.style.display = 'none';
        } else {
            cartEmpty?.classList.remove('active');
            if (checkoutBtn) checkoutBtn.style.display = 'block';
            cart.forEach((item) => {
                const li = document.createElement('li');
                li.textContent = `${item.title} - ${item.price} руб.`;
                cartItems.appendChild(li);
            });
        }
    }

    if (cartToggle && cartDropdown && overlay) {
        cartToggle.addEventListener('click', (e) => {
            e.preventDefault();
            cartDropdown.classList.toggle('active');
            if (window.innerWidth <= 1024) {
                overlay.classList.toggle('active');
            }
            updateCart();
        });

        if (cartCloseBtn) {
            cartCloseBtn.addEventListener('click', () => {
                cartDropdown.classList.remove('active');
                overlay.classList.remove('active');
            });
        }

        document.addEventListener('click', (e) => {
            if (cartDropdown.classList.contains('active') &&
                !cartDropdown.contains(e.target) &&
                !cartToggle.contains(e.target)) {
                cartDropdown.classList.remove('active');
                overlay.classList.remove('active');
            }
        });

        checkoutBtn?.addEventListener('click', () => {
            console.log('Оформление заказа:', cart);
            cartDropdown.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
    
    // Добавление в корзину через кнопку "Заказать"
    document.querySelector('.btn-order')?.addEventListener('click', () => {
        const size = document.getElementById('size-display')?.textContent;
        const paper = document.getElementById('paper-display')?.textContent || 'Матовая';
        const mode = document.getElementById('mode-display')?.textContent || 'Детальный';
        const type = document.getElementById('type-display')?.textContent;
        const pages = document.getElementById('pages-display')?.textContent;
        const price = parseInt(document.getElementById('price-display')?.textContent || '0');
        const title = type && pages 
            ? `Фотокнига ${type} ${size}, ${paper}, ${pages} стр.` 
            : `Фото ${size}, ${paper}, ${mode}`;
        const item = { title, price };
        cart.push(item);
        console.log('Добавлено в корзину:', item);
        updateCart();
    });

    // ==================== БУРГЕР-МЕНЮ ====================
    const burgerToggle = document.getElementById('burger-toggle');
    const navMenu = document.getElementById('nav-menu');
    const menuCloseBtn = navMenu?.querySelector('.menu-close-btn');
    const submenuContainer = document.getElementById('submenu-container');
    const dropdowns = navMenu?.querySelectorAll('.dropdown');

    if (burgerToggle && navMenu && overlay) {
        burgerToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            burgerToggle.classList.toggle('active');
            overlay.classList.toggle('active');
        });

        if (menuCloseBtn) {
            menuCloseBtn.addEventListener('click', () => {
                navMenu.classList.remove('active');
                burgerToggle.classList.remove('active');
                overlay.classList.remove('active');
                submenuContainer?.classList.remove('active');
                const mainMenu = navMenu.querySelector('.main-menu');
                if (mainMenu) mainMenu.style.transform = 'translateX(0)';
            });
        }

        overlay.addEventListener('click', (e) => {
            if (navMenu.classList.contains('active') && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                burgerToggle.classList.remove('active');
                overlay.classList.remove('active');
                submenuContainer?.classList.remove('active');
                const mainMenu = navMenu.querySelector('.main-menu');
                if (mainMenu) mainMenu.style.transform = 'translateX(0)';
            }
        });

        dropdowns?.forEach(dropdown => {
            const link = dropdown.querySelector('a');
            const menuName = dropdown.dataset.menu;
            
            link?.addEventListener('click', (e) => {
                if (window.innerWidth <= 1024 && menuName) {
                    e.preventDefault();
                    
                    const megaMenu = document.getElementById('mega-menu');
                    const panel = megaMenu?.querySelector(`[data-panel="${menuName}"]`);
                    const panelLinks = panel?.querySelectorAll('.mega-menu-links ul li');
                    
                    if (!panelLinks || !submenuContainer) return;
                    
                    submenuContainer.innerHTML = '';
                    const backItem = document.createElement('li');
                    backItem.innerHTML = '<a href="#" class="back-link">< Назад</a>';
                    submenuContainer.appendChild(backItem);
                    
                    panelLinks.forEach(item => {
                        submenuContainer.appendChild(item.cloneNode(true));
                    });
                    
                    submenuContainer.classList.add('active');
                    const mainMenu = navMenu.querySelector('.main-menu');
                    if (mainMenu) mainMenu.style.transform = 'translateX(-100%)';

                    const backLink = submenuContainer.querySelector('.back-link');
                    backLink?.addEventListener('click', (e) => {
                        e.preventDefault();
                        submenuContainer.classList.remove('active');
                        if (mainMenu) mainMenu.style.transform = 'translateX(0)';
                    });
                }
            });
        });
    }
    
    // ==================== MEGA MENU (Desktop) ====================
    initMegaMenu();
}

// ==================== AUTH MODULE ====================
function initAuth() {
    const authToggle = document.getElementById('auth-toggle');
    const authDropdown = document.getElementById('auth-dropdown');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const authText = document.getElementById('auth-text');
    const authCloseBtn = authDropdown?.querySelector('.close-btn');
    const userMenuCloseBtn = userMenuDropdown?.querySelector('.close-btn');
    const headerLogoutBtn = document.getElementById('header-logout-btn');
    const userMenuGreeting = document.getElementById('user-menu-greeting');

    const loginForm = authDropdown?.querySelector('.login-form');
    const registerForm = authDropdown?.querySelector('.register-form');

    const registerSwitch = authDropdown?.querySelector('.register-switch');
    const loginSwitch = authDropdown?.querySelector('.login-switch');

    // ---------- UI UPDATE ----------
    function updateAuthUI(username = null) {
        authDropdown?.classList.remove('active');
        userMenuDropdown?.classList.remove('active');

        if (username) {
            if (authText) authText.textContent = username;
            if (userMenuGreeting) userMenuGreeting.textContent = username;
        } else {
            if (authText) authText.textContent = 'Регистрация/Войти';
        }
    }

    // ---------- CHECK AUTH ----------
    async function checkAuth() {
        const token = localStorage.getItem('access');
        if (!token) return;

        try {
            const res = await fetch('http://127.0.0.1:8000/api/auth/me/', {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            });

            if (!res.ok) throw new Error();

            const user = await res.json();
            updateAuthUI(user.username);
        } catch {
            localStorage.clear();
        }
    }

    // ---------- TOGGLE ----------
    authToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        
        if (localStorage.getItem('access')) {
            // Авторизован - показываем меню ЛК
            userMenuDropdown?.classList.toggle('active');
            authDropdown?.classList.remove('active');
        } else {
            // Не авторизован - показываем форму входа
            authDropdown?.classList.toggle('active');
            userMenuDropdown?.classList.remove('active');
        }
    });

    // ---------- CLOSE ----------
    authCloseBtn?.addEventListener('click', () => {
        authDropdown?.classList.remove('active');
    });

    userMenuCloseBtn?.addEventListener('click', () => {
        userMenuDropdown?.classList.remove('active');
    });

    // ---------- LOGOUT ----------
    headerLogoutBtn?.addEventListener('click', () => {
        localStorage.clear();
        updateAuthUI();
        userMenuDropdown?.classList.remove('active');
        window.location.reload();
    });

    // ---------- SWITCH FORMS ----------
    registerSwitch?.addEventListener('click', () => {
        loginForm?.classList.remove('active');
        registerForm?.classList.add('active');
    });

    loginSwitch?.addEventListener('click', () => {
        registerForm?.classList.remove('active');
        loginForm?.classList.add('active');
    });

    // ---------- LOGIN ----------
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = loginForm.querySelector('input[type="text"]').value;
        const password = loginForm.querySelector('input[type="password"]').value;

        const res = await fetch('http://127.0.0.1:8000/api/auth/login/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            alert('Ошибка входа');
            return;
        }

        localStorage.setItem('access', data.access);
        localStorage.setItem('refresh', data.refresh);

        await checkAuth();
    });

    // ---------- REGISTER ----------
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = registerForm.querySelector('input[type="text"]').value;
        const email = registerForm.querySelector('input[type="email"]').value;
        const password = registerForm.querySelector('input[type="password"]').value;

        const res = await fetch('http://127.0.0.1:8000/api/auth/register/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.detail || 'Ошибка регистрации');
            return;
        }

        localStorage.setItem('access', data.access);
        localStorage.setItem('refresh', data.refresh);

        await checkAuth();
    });

    // Проверяем авторизацию при загрузке
    checkAuth();
}

// ==================== MEGA MENU (Desktop) ====================
function initMegaMenu() {
    const megaMenu = document.getElementById('mega-menu');
    const dropdowns = document.querySelectorAll('.main-menu .dropdown[data-menu]');
    
    if (!megaMenu || !dropdowns.length) return;
    
    // Только для десктопа
    if (window.innerWidth <= 1024) return;
    
    let hideTimeout = null;
    
    // Показать mega-menu при наведении на dropdown
    dropdowns.forEach(dropdown => {
        const menuName = dropdown.dataset.menu;
        const panel = megaMenu.querySelector(`[data-panel="${menuName}"]`);
        
        if (!panel) return;
        
        dropdown.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
            
            // Скрываем все панели
            megaMenu.querySelectorAll('.mega-menu-panel').forEach(p => p.classList.remove('active'));
            
            // Убираем активный класс с других dropdown
            dropdowns.forEach(d => d.classList.remove('menu-active'));
            
            // Показываем нужную панель
            panel.classList.add('active');
            megaMenu.classList.add('active');
            dropdown.classList.add('menu-active');
        });
        
        dropdown.addEventListener('mouseleave', (e) => {
            // Проверяем, не переходим ли мы в mega-menu
            const relatedTarget = e.relatedTarget;
            if (megaMenu.contains(relatedTarget)) return;
            
            hideTimeout = setTimeout(() => {
                megaMenu.classList.remove('active');
                dropdown.classList.remove('menu-active');
            }, 100);
        });
    });
    
    // Держим mega-menu открытым при наведении на него
    megaMenu.addEventListener('mouseenter', () => {
        clearTimeout(hideTimeout);
    });
    
    megaMenu.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(() => {
            megaMenu.classList.remove('active');
            megaMenu.querySelectorAll('.mega-menu-panel').forEach(p => p.classList.remove('active'));
            dropdowns.forEach(d => d.classList.remove('menu-active'));
        }, 100);
    });
    
    // Смена картинки и описания при наведении на ссылки
    megaMenu.querySelectorAll('.mega-menu-panel').forEach(panel => {
        const panelName = panel.dataset.panel;
        const img = panel.querySelector('.mega-menu-image img');
        const caption = panel.querySelector('.mega-menu-image-caption');
        const links = panel.querySelectorAll('.mega-menu-links ul li a');
        
        // Сохраняем дефолтные значения
        const defaultImg = img?.src;
        const defaultCaption = caption?.textContent;
        
        links.forEach(link => {
            const linkImg = link.dataset.img;
            const linkDesc = link.dataset.desc;
            
            link.addEventListener('mouseenter', () => {
                if (linkImg && img) {
                    img.style.opacity = '0.7';
                    setTimeout(() => {
                        img.src = linkImg;
                        img.style.opacity = '1';
                    }, 150);
                }
                if (linkDesc && caption) {
                    caption.textContent = linkDesc;
                }
            });
            
            link.addEventListener('mouseleave', () => {
                if (defaultImg && img) {
                    img.style.opacity = '0.7';
                    setTimeout(() => {
                        img.src = defaultImg;
                        img.style.opacity = '1';
                    }, 150);
                }
                if (defaultCaption && caption) {
                    caption.textContent = defaultCaption;
                }
            });
        });
    });
    
    // Обновление при ресайзе
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 1024) {
            megaMenu.classList.remove('active');
            megaMenu.querySelectorAll('.mega-menu-panel').forEach(p => p.classList.remove('active'));
            dropdowns.forEach(d => d.classList.remove('menu-active'));
        }
    });
}


function initFooterAccordions() {
    const toggles = document.querySelectorAll('.accordion-toggle');

    function updateAccordionState() {
        if (window.innerWidth <= 768) {
            toggles.forEach(toggle => {
                const content = toggle.nextElementSibling;
                if (!toggle.classList.contains('active')) {
                    content.classList.remove('active');
                }
            });
        } else {
            toggles.forEach(toggle => {
                const content = toggle.nextElementSibling;
                toggle.classList.remove('active');
                content.classList.add('active');
            });
        }
    }

    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                const content = toggle.nextElementSibling;
                const isActive = toggle.classList.contains('active');

                toggles.forEach(t => {
                    t.classList.remove('active');
                    t.nextElementSibling.classList.remove('active');
                });

                if (!isActive) {
                    toggle.classList.add('active');
                    content.classList.add('active');
                }
            }
        });
    });

    updateAccordionState();
    window.addEventListener('resize', updateAccordionState);
}

function initPurchaseOptions() {
    const sizeButtons = document.querySelectorAll('#size-buttons .option-btn');
    const sizeButtonsContainer = document.getElementById('size-buttons');
    const paperButtons = document.querySelectorAll('#paper-buttons .option-btn');
    const modeButtons = document.querySelectorAll('#mode-buttons .option-btn');
    const typeButtons = document.querySelectorAll('#type-buttons .option-btn');
    const customWidth = document.getElementById('custom-width');
    const customHeight = document.getElementById('custom-height');
    const sizeDisplay = document.getElementById('size-display');
    const paperDisplay = document.getElementById('paper-display');
    const modeDisplay = document.getElementById('mode-display');
    const typeDisplay = document.getElementById('type-display');
    const pagesSelect = document.getElementById('pages-select');
    const pagesDisplay = document.getElementById('pages-display');
    const priceDisplay = document.getElementById('price-display');
    const btnOrder = document.querySelector('.btn-order');
    const btnUpload = document.querySelector('.btn-upload');

    // Цены для стандартных размеров (в рублях за единицу)
    const standardSizePrices = {
        '10х15': 50, '13х18': 70, '15х21': 90, '21х30': 120, '30х42': 180
    };

    // Цены для размеров "Полароид" (в рублях за единицу)
    const polaroidSizePrices = {
        '9х16': 60, '12х15': 65, '7,5х13': 55, '8,8х10,7': 50, '7х10': 45, '6х9': 40, '5х7': 35
    };

    // Цены для размеров "Печать на холсте" (в рублях за единицу)
    const canvasSizePrices = {
        '30х40': 1200, '40х60': 1800, '50х70': 2500, '60х90': 3500,
        '30х30': 900, '40х40': 1600, '50х50': 2200, '60х60': 3000, '70х70': 4000, '90х90': 6000
    };

    // Цены для размеров "Фотокниги" (в рублях за 10 страниц)
    const photobookSizePrices = {
        'Квадрат': { '15х15': 1500, '20х20': 2000, '25х25': 2500, '30х30': 3000 },
        'Альбомная': { '20х15': 1800, '25х18': 2200, '25х15': 2000, '30х15': 2300, '30х20': 2600, '30х25': 2900 },
        'Книжная': { '15х20': 1800, '18х25': 2200, '15х25': 2000, '15х30': 2300, '20х30': 2600, '25х30': 2900 }
    };

    // Коэффициенты для типа бумаги
    const paperCoefficients = {
        'Матовая': 1.0, 'Глянец': 1.0, 'Шелк': 1.2, 'Сатин': 1.3, 'Лён': 1.5
    };

    // Коэффициенты для режима печати
    const modeCoefficients = {
        'Детальный': 1.0, 'Экспресс': 0.8
    };

    // Базовая цена за см² для нестандартных размеров
    const customPricePerCm2 = {
        standard: 0.5,  // Для "Стандартные фото"
        canvas: 10      // Для "Печать на холсте"
    };

    // Определяем, какая страница загружена
    const purchaseTitle = document.querySelector('h2.purchase-title')?.textContent;
    const isPolaroidPage = purchaseTitle?.includes('Полароид');
    const isCanvasPage = purchaseTitle?.includes('холсте');
    const isPhotobookPage = purchaseTitle?.includes('Фотокниги');
    const sizePrices = isPolaroidPage ? polaroidSizePrices : isCanvasPage ? canvasSizePrices : isPhotobookPage ? null : standardSizePrices;
    const customPrice = isCanvasPage ? customPricePerCm2.canvas : customPricePerCm2.standard;

    let selectedSize = isPolaroidPage ? '9х16' : isCanvasPage ? '30х40' : isPhotobookPage ? '15х15' : '10х15';
    let selectedPaper = isPhotobookPage ? 'Матовая' : 'Глянец';
    let selectedMode = 'Детальный';
    let selectedType = isPhotobookPage ? 'Квадрат' : null;
    let selectedPages = isPhotobookPage ? 10 : null;
    let isCustomSize = false;

    // Заполнение выпадающего списка страниц для фотокниг
    if (isPhotobookPage && pagesSelect) {
        for (let i = 10; i <= 100; i += 2) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            pagesSelect.appendChild(option);
        }
    }

    // Обновление размеров в зависимости от типа книги (только для фотокниг)
    function updateSizeOptions() {
        if (!isPhotobookPage || !typeButtons.length) return;
        sizeButtonsContainer.innerHTML = '';
        const sizes = {
            'Квадрат': ['15х15', '20х20', '25х25', '30х30'],
            'Альбомная': ['20х15', '25х18', '25х15', '30х15', '30х20', '30х25'],
            'Книжная': ['15х20', '18х25', '15х25', '15х30', '20х30', '25х30']
        }[selectedType];
        sizes.forEach((size, index) => {
            const button = document.createElement('button');
            button.classList.add('option-btn');
            button.dataset.value = size;
            button.textContent = size;
            if (index === 0) {
                button.classList.add('active');
                selectedSize = size;
                sizeDisplay.textContent = size;
            }
            sizeButtonsContainer.appendChild(button);
        });

        // Привязываем события к новым кнопкам для фотокниг
        const sizeButtonsDynamic = sizeButtonsContainer.querySelectorAll('.option-btn');
        sizeButtonsDynamic.forEach(button => {
            button.addEventListener('click', () => {
                sizeButtonsDynamic.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                selectedSize = button.dataset.value;
                sizeDisplay.textContent = selectedSize;
                isCustomSize = false;
                calculatePrice();
            });
        });

        calculatePrice();
    }

    function calculatePrice() {
        let price;
        if (isCustomSize && customWidth && customHeight) {
            const width = parseInt(customWidth.value) || 0;
            const height = parseInt(customHeight.value) || 0;
            const area = width * height;
            price = area * customPrice;
        } else if (isPhotobookPage) {
            price = photobookSizePrices[selectedType][selectedSize];
            price *= paperCoefficients[selectedPaper];
            price *= (1 + (selectedPages - 10) * 0.05); // +5% за каждые 2 страницы сверх 10
        } else {
            price = sizePrices[selectedSize];
            if (paperDisplay) price *= paperCoefficients[selectedPaper];
        }
        if (modeDisplay) price *= modeCoefficients[selectedMode];
        priceDisplay.textContent = Math.round(price);
    }

    // Обработка кнопок размера для статических страниц
    if (!isPhotobookPage && sizeButtons.length > 0) {
        sizeButtons.forEach(button => {
            button.addEventListener('click', () => {
                sizeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                selectedSize = button.dataset.value;
                sizeDisplay.textContent = selectedSize;
                isCustomSize = false;
                calculatePrice();
            });
        });
    }

    // Обработка кнопок типа книги
    if (typeButtons.length > 0) {
        typeButtons.forEach(button => {
            button.addEventListener('click', () => {
                typeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                selectedType = button.dataset.value;
                typeDisplay.textContent = selectedType;
                updateSizeOptions();
            });
        });
    }

    // Обработка кнопок бумаги
    if (paperButtons.length > 0) {
        paperButtons.forEach(button => {
            button.addEventListener('click', () => {
                paperButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                selectedPaper = button.dataset.value;
                paperDisplay.textContent = selectedPaper;
                calculatePrice();
            });
        });
    }

    // Обработка кнопок режима
    if (modeButtons.length > 0) {
        modeButtons.forEach(button => {
            button.addEventListener('click', () => {
                modeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                selectedMode = button.dataset.value;
                modeDisplay.textContent = selectedMode;
                calculatePrice();
            });
        });
    }

    // Обработка выбора страниц
    if (pagesSelect && pagesDisplay) {
        pagesSelect.addEventListener('change', () => {
            selectedPages = parseInt(pagesSelect.value);
            pagesDisplay.textContent = selectedPages;
            calculatePrice();
        });
    }

    // Ограничение ввода для нестандартных размеров
    if (customWidth && customHeight) {
        function restrictCustomSize() {
            const width = parseInt(customWidth.value) || 0;
            const height = parseInt(customHeight.value) || 0;
            const maxSize = isCanvasPage ? 90 : 42;

            if (width > maxSize) customWidth.value = maxSize;
            if (height > maxSize) customHeight.value = maxSize;

            if (!isCanvasPage && width > 30 && height > 30) {
                if (width > height) {
                    customHeight.value = Math.min(height, 30);
                } else {
                    customWidth.value = Math.min(width, 30);
                }
            }

            if (width > 0 && height > 0) {
                isCustomSize = true;
                sizeDisplay.textContent = `${width}х${height}`;
                sizeButtons.forEach(btn => btn.classList.remove('active'));
                calculatePrice();
            }
        }

        customWidth.addEventListener('input', restrictCustomSize);
        customHeight.addEventListener('input', restrictCustomSize);
    }

    // Обработка кнопки "Загрузить макет"
    if (btnUpload) {
        btnUpload.addEventListener('click', () => {
            console.log('Нажата кнопка "Загрузить макет"');
            // Здесь можно добавить логику загрузки файла
        });
    }

    // Инициализация
    if (isPhotobookPage) updateSizeOptions();
    else calculatePrice();
}

function extractSubmenuData() {
    const megaMenu = document.getElementById('mega-menu');
    if (!megaMenu) return;

    // Маппинг data-panel к названиям страниц
    const panelToTitle = {
        'photoprint': 'Фотопечать',
        'calendars': 'Календари',
        'polygraphy': 'Полиграфия'
    };

    const panels = megaMenu.querySelectorAll('.mega-menu-panel');
    panels.forEach(panel => {
        const panelName = panel.dataset.panel;
        const title = panelToTitle[panelName];
        if (!title) return;

        const links = panel.querySelectorAll('.mega-menu-links ul li a');
        submenuData[title] = Array.from(links).map(item => ({
            title: item.textContent.trim(),
            link: item.getAttribute('href'),
            imgSrc: item.getAttribute('data-img') || '/frontend/images/jonny-caspari-KuudDjBHIlA-unsplash.jpg',
            description: item.getAttribute('data-desc') || `Описание для ${item.textContent.trim()}`
        }));
    });
}

function initRecommendations() {
    const recommendationsGrid = document.querySelector('.recommendations-grid');

    function createCard(data) {
        const card = document.createElement('div');
        card.classList.add('product-card');
        card.innerHTML = `
            <a href="${data.link}">
                <img src="${data.imgSrc}" alt="${data.title}">
                <span class="card-text">${data.title}</span>
            </a>
        `;
        return card;
    }

    function getCardConfig() {
        const viewportWidth = window.innerWidth;
        const paddingSpace = 20 * 2;
        const gap = 10;
        let cardCount;

        if (viewportWidth > 1700) cardCount = 4;
        else if (viewportWidth > 1600) cardCount = 4;
        else if (viewportWidth > 1100) cardCount = 3;
        else cardCount = 2;

        const totalWidth = Math.min(viewportWidth - paddingSpace, 1400);
        const cardSize = (totalWidth - gap * (cardCount - 1)) / cardCount;
        return { cardCount, cardSize, totalWidth, gap };
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function updateRecommendations() {
        if (!recommendationsGrid) return;
        recommendationsGrid.innerHTML = '';

        const { cardCount, cardSize, totalWidth } = getCardConfig();
        recommendationsGrid.style.width = `${totalWidth}px`;
        recommendationsGrid.style.maxWidth = '100%';

        const shuffledData = shuffleArray([...cardData]);
        for (let i = 0; i < cardCount; i++) {
            const card = createCard(shuffledData[i]);
            card.style.width = `${cardSize}px`;
            card.style.height = `${cardSize}px`;
            recommendationsGrid.appendChild(card);
        }
    }

    if (recommendationsGrid) {
        updateRecommendations();
        window.addEventListener('resize', updateRecommendations);
    }
}

function initSubmenuCards() {
    const submenuCards = document.querySelector('.submenu-cards');
    const pageTitle = document.querySelector('.submenu-section h1')?.textContent.trim();

    function createSubmenuCard(data) {
        const card = document.createElement('div');
        card.classList.add('submenu-card');
        card.innerHTML = `
            <a href="${data.link}">
                <img src="${data.imgSrc}" alt="${data.title}">
                <h3>${data.title}</h3>
                <p>${data.description}</p>
            </a>
        `;
        return card;
    }

    if (submenuCards && pageTitle && submenuData[pageTitle]) {
        submenuCards.innerHTML = '';
        submenuData[pageTitle].forEach(item => {
            const card = createSubmenuCard(item);
            submenuCards.appendChild(card);
        });
    }
}

const cardData = [
    { title: "Фотопечать", imgSrc: "/images/bianca-ackermann-40dpU4ULfFw-unsplash.jpg", link: "photoprint.html" },
    { title: "Печать на холсте", imgSrc: "/images/bianca-ackermann-40dpU4ULfFw-unsplash.jpg", link: "canvas.html" },
    { title: "Фотокниги", imgSrc: "/images/bianca-ackermann-40dpU4ULfFw-unsplash.jpg", link: "photobooks.html" },
    { title: "Календари", imgSrc: "/images/bianca-ackermann-40dpU4ULfFw-unsplash.jpg", link: "calendars.html" },
    { title: "Открытки", imgSrc: "/images/bianca-ackermann-40dpU4ULfFw-unsplash.jpg", link: "postcards.html" },
    { title: "Фото на документы", imgSrc: "/images/bianca-ackermann-40dpU4ULfFw-unsplash.jpg", link: "documents.html" },
    { title: "Полиграфия", imgSrc: "/images/bianca-ackermann-40dpU4ULfFw-unsplash.jpg", link: "polygraphy.html" }
];

const carouselGrid = document.querySelector('.product-grid');
const prevBtn = document.querySelector('.carousel-btn.prev');
const nextBtn = document.querySelector('.carousel-btn.next');
let currentIndex = 0;
let isAnimating = false;

function createCard(data) {
    const card = document.createElement('div');
    card.classList.add('product-card');
    card.innerHTML = `
        <a href="${data.link}">
            <img src="${data.imgSrc}" alt="${data.title}">
            <span class="card-text">${data.title}</span>
        </a>
    `;
    return card;
}

function getCarouselConfig() {
    const viewportWidth = window.innerWidth;
    const arrowSpace = 20 * 2;
    const paddingSpace = 20 * 2;
    const gap = 10;
    let cardCount;

    if (viewportWidth > 1700) cardCount = 4;
    else if (viewportWidth > 1600) cardCount = 4;
    else if (viewportWidth > 1100) cardCount = 3;
    else cardCount = 2;

    const totalWidth = Math.min(viewportWidth - paddingSpace - arrowSpace, 1400);
    const cardSize = (totalWidth - gap * (cardCount - 1)) / cardCount;
    return { cardCount, cardSize, totalWidth, gap };
}

function updateCarousel() {
    if (!carouselGrid) return;
    carouselGrid.innerHTML = '';

    const { cardCount, cardSize, totalWidth, gap } = getCarouselConfig();
    carouselGrid.parentElement.style.maxWidth = `${totalWidth}px`;

    for (let i = 0; i < cardCount * 3; i++) {
        const index = (currentIndex + i) % cardData.length;
        const card = createCard(cardData[index]);
        card.style.width = `${cardSize}px`;
        card.style.height = `${cardSize}px`;
        carouselGrid.appendChild(card);
    }

    const initialOffset = -totalWidth;
    carouselGrid.style.transform = `translateX(${initialOffset}px)`;
}

function slideNext() {
    if (isAnimating || !carouselGrid) return;
    isAnimating = true;
    const { cardCount, cardSize, totalWidth, gap } = getCarouselConfig();

    carouselGrid.style.transition = 'transform 0.5s ease';
    carouselGrid.style.transform = `translateX(-${totalWidth + cardSize + gap}px)`;

    setTimeout(() => {
        currentIndex = (currentIndex + 1) % cardData.length;
        carouselGrid.removeChild(carouselGrid.firstElementChild);
        const nextIndex = (currentIndex + cardCount - 1) % cardData.length;
        const card = createCard(cardData[nextIndex]);
        card.style.width = `${cardSize}px`;
        card.style.height = `${cardSize}px`;
        carouselGrid.appendChild(card);
        carouselGrid.style.transition = 'none';
        carouselGrid.style.transform = `translateX(-${totalWidth}px)`;
        isAnimating = false;
    }, 500);
}

function slidePrev() {
    if (isAnimating || !carouselGrid) return;
    isAnimating = true;
    const { cardCount, cardSize, totalWidth, gap } = getCarouselConfig();
    const prevIndex = (currentIndex - 1 + cardData.length) % cardData.length;
    const card = createCard(cardData[prevIndex]);
    card.style.width = `${cardSize}px`;
    card.style.height = `${cardSize}px`;
    carouselGrid.insertBefore(card, carouselGrid.firstElementChild);

    carouselGrid.style.transition = 'none';
    carouselGrid.style.transform = `translateX(-${totalWidth + cardSize + gap}px)`;

    setTimeout(() => {
        carouselGrid.style.transition = 'transform 0.5s ease';
        carouselGrid.style.transform = `translateX(-${totalWidth}px)`;
        setTimeout(() => {
            carouselGrid.removeChild(carouselGrid.lastElementChild);
            currentIndex = (currentIndex - 1 + cardData.length) % cardData.length;
            carouselGrid.style.transition = 'none';
            isAnimating = false;
        }, 500);
    }, 10);
}

if (nextBtn && prevBtn) {
    nextBtn.addEventListener('click', slideNext);
    prevBtn.addEventListener('click', slidePrev);
    window.addEventListener('resize', updateCarousel);
    updateCarousel();
}

function initSlider() {
    const imageStack = document.querySelector('.image-stack');
    if (!imageStack) return;
    const images = Array.from(imageStack.querySelectorAll('.gallery-image'));
    let currentImage = 0;

    images[currentImage].classList.add('active');

    const sliderPrev = document.querySelector('.slider-btn.prev');
    const sliderNext = document.querySelector('.slider-btn.next');

    sliderPrev?.addEventListener('click', () => {
        images[currentImage].classList.remove('active');
        currentImage = (currentImage - 1 + images.length) % images.length;
        images[currentImage].classList.add('active');
    });

    sliderNext?.addEventListener('click', () => {
        images[currentImage].classList.remove('active');
        currentImage = (currentImage + 1) % images.length;
        images[currentImage].classList.add('active');
    });
} 