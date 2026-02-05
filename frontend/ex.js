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

    // Регистрация
    const authToggle = document.getElementById('auth-toggle');
    const authDropdown = document.getElementById('auth-dropdown');
    const authText = document.getElementById('auth-text');
    const authCloseBtn = authDropdown?.querySelector('.close-btn');
    const loginForm = authDropdown?.querySelector('.login-form');
    const registerForm = authDropdown?.querySelector('.register-form');
    const registerSwitch = authDropdown?.querySelector('.register-switch');
    const loginSwitch = authDropdown?.querySelector('.login-switch');

  // Проверка, авторизован ли пользователь при загрузке страницы
  const loggedInUser = JSON.parse(localStorage.getItem('user'));
  if (loggedInUser) {
    authText.textContent = loggedInUser.username;
    authDropdown.style.display = 'none'; // Скрываем выпадающее меню, если пользователь авторизован
  }

    if (authToggle && authDropdown && overlay) {
        authToggle.addEventListener('click', (e) => {
            e.preventDefault();
      if (!loggedInUser) {
            authDropdown.classList.toggle('active');
            if (window.innerWidth <= 1024) {
                overlay.classList.toggle('active');
        }
      } else {
        // Можно добавить действие для авторизованного пользователя, например, выход
        if (confirm('Выйти из аккаунта?')) {
          localStorage.removeItem('user');
          authText.textContent = 'Регистрация/Войти';
          authDropdown.style.display = 'block';
        }
            }
        });

        if (authCloseBtn) {
            authCloseBtn.addEventListener('click', () => {
                authDropdown.classList.remove('active');
                overlay.classList.remove('active');
            });
        }

        document.addEventListener('click', (e) => {
            if (authDropdown.classList.contains('active') &&
                !authDropdown.contains(e.target) &&
                !authToggle.contains(e.target)) {
                authDropdown.classList.remove('active');
                overlay.classList.remove('active');
            }
        });

        const authForm = authDropdown.querySelector('.auth-form');
        // Переключение между формами
      if (registerSwitch && loginSwitch) {
        registerSwitch.addEventListener('click', () => {
          loginForm.classList.remove('active');
          registerForm.classList.add('active');
        });
  
        loginSwitch.addEventListener('click', () => {
          registerForm.classList.remove('active');
          loginForm.classList.add('active');
        });
      }
  
      // Обработка входа
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.querySelector('input[type="email"]').value;
        const password = loginForm.querySelector('input[type="password"]').value;


        try {
          const response = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const data = await response.json();
          if (response.ok) {
            console.log('Успешный вход:', data.message);
          localStorage.setItem('user', JSON.stringify(data.user)); // Сохраняем данные пользователя
          authText.textContent = data.user.username; // Показываем имя пользователя
            authDropdown.classList.remove('active');
            overlay.classList.remove('active');
          authDropdown.style.display = 'none'; // Скрываем форму
          } else {
            console.error('Ошибка входа:', data.message);
            alert(data.message);
          }
        } catch (error) {
          console.error('Ошибка запроса:', error);
          alert('Ошибка сервера');
        }
        });

        // Обработка регистрации
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = registerForm.querySelector('input[type="text"]').value;
        const email = registerForm.querySelector('input[type="email"]').value;
        const password = registerForm.querySelector('input[type="password"]').value;  
        try {
          const response = await fetch('http://localhost:5000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
          });
          const data = await response.json();
          if (response.ok) {
            console.log('Успешная регистрация:', data.message);
          localStorage.setItem('user', JSON.stringify(data.user)); // Сохраняем данные пользователя
          authText.textContent = data.user.username; // Показываем имя пользователя
            authDropdown.classList.remove('active');
            overlay.classList.remove('active');
          authDropdown.style.display = 'none'; // Скрываем форму
          } else {
            console.error('Ошибка регистрации:', data.message);
            alert(data.message);
          }
        } catch (error) {
          console.error('Ошибка запроса:', error);
          alert('Ошибка сервера');
        }
      });
    }
    }

    // Корзина
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
            cartEmpty.classList.add('active');
            checkoutBtn.style.display = 'none';
        } else {
            cartEmpty.classList.remove('active');
            checkoutBtn.style.display = 'block';
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

        checkoutBtn.addEventListener('click', () => {
            console.log('Оформление заказа:', cart);
            cartDropdown.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
    
    // Добавление в корзину через кнопку "Заказать"
    document.querySelector('.btn-order')?.addEventListener('click', () => {
        const size = document.getElementById('size-display').textContent;
        const paper = document.getElementById('paper-display')?.textContent || 'Матовая';
        const mode = document.getElementById('mode-display')?.textContent || 'Детальный';
        const type = document.getElementById('type-display')?.textContent;
        const pages = document.getElementById('pages-display')?.textContent;
        const price = parseInt(document.getElementById('price-display').textContent);
        const title = type && pages 
            ? `Фотокнига ${type} ${size}, ${paper}, ${pages} стр.` 
            : `Фото ${size}, ${paper}, ${mode}`;
        const item = { title, price };
        cart.push(item);
        console.log('Добавлено в корзину:', item);
        updateCart();
    });

    // Бургер-меню
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
                submenuContainer.classList.remove('active');
                navMenu.querySelector('.main-menu').style.transform = 'translateX(0)';
            });
        }

        overlay.addEventListener('click', (e) => {
            if (navMenu.classList.contains('active') && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                burgerToggle.classList.remove('active');
                overlay.classList.remove('active');
                submenuContainer.classList.remove('active');
                navMenu.querySelector('.main-menu').style.transform = 'translateX(0)';
            }
        });

        dropdowns.forEach(dropdown => {
            const link = dropdown.querySelector('a');
            const submenu = dropdown.querySelector('.submenu');
            link.addEventListener('click', (e) => {
                if (window.innerWidth <= 1024) {
                    e.preventDefault();
                    submenuContainer.innerHTML = '';
                    const backItem = document.createElement('li');
                    backItem.innerHTML = '<a href="#" class="back-link">< Назад</a>';
                    submenuContainer.appendChild(backItem);
                    submenu.querySelectorAll('li').forEach(item => {
                        submenuContainer.appendChild(item.cloneNode(true));
                    });
                    submenuContainer.classList.add('active');
                    navMenu.querySelector('.main-menu').style.transform = 'translateX(-100%)';

                    const backLink = submenuContainer.querySelector('.back-link');
                    backLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        submenuContainer.classList.remove('active');
                        navMenu.querySelector('.main-menu').style.transform = 'translateX(0)';
                    });
                }
            });
        });
    }