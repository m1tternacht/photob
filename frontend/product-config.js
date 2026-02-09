// ==================== PRODUCT CONFIG ====================
// Универсальный скрипт для загрузки конфигурации продуктов с API

const API_URL = 'http://127.0.0.1:8000/api';

// Текущее состояние
let ProductState = {
    productType: null,
    sizes: [],
    papers: [],
    selectedSize: null,
    selectedPaper: null,
    basePrice: 0,
    paperCoefficient: 1.0
};

// Инициализация страницы продукта
async function initProductPage(productType) {
    ProductState.productType = productType;
    
    try {
        await loadProductConfig(productType);
        renderSizeButtons();
        renderPaperButtons();
        initOptionButtons();
        updatePrice();
    } catch (e) {
        console.error('Failed to init product page:', e);
        // Fallback - показываем ошибку
        document.getElementById('size-buttons').innerHTML = '<span class="error-text">Ошибка загрузки. Обновите страницу.</span>';
        document.getElementById('paper-buttons').innerHTML = '<span class="error-text">Ошибка загрузки</span>';
    }
}

// Загрузка конфигурации с API
async function loadProductConfig(productType) {
    const res = await fetch(`${API_URL}/config/${productType}/`);
    
    if (!res.ok) {
        throw new Error('Failed to load config');
    }
    
    const config = await res.json();
    
    ProductState.sizes = config.sizes || [];
    ProductState.papers = config.papers || [];
    
    console.log('Product config loaded:', config);
}

// Рендер кнопок размеров
function renderSizeButtons() {
    const container = document.getElementById('size-buttons');
    if (!container) return;
    
    if (ProductState.sizes.length === 0) {
        container.innerHTML = '<span class="error-text">Нет доступных размеров</span>';
        return;
    }
    
    const html = ProductState.sizes.map((size, index) => {
        const isActive = index === 0 ? 'active' : '';
        // Форматируем название: 10x15 -> 10×15
        const displayName = size.name || size.code.replace('x', '×');
        
        return `<button class="option-btn ${isActive}" 
                    data-value="${size.code}" 
                    data-price="${size.price}"
                    data-name="${displayName}">
                    ${displayName}
                </button>`;
    }).join('');
    
    container.innerHTML = html;
    
    // Устанавливаем первый размер как выбранный
    if (ProductState.sizes.length > 0) {
        const first = ProductState.sizes[0];
        ProductState.selectedSize = first.code;
        ProductState.basePrice = parseFloat(first.price);
        document.getElementById('size-display').textContent = first.name || first.code.replace('x', '×');
    }
}

// Рендер кнопок бумаги
function renderPaperButtons() {
    const container = document.getElementById('paper-buttons');
    if (!container) return;
    
    if (ProductState.papers.length === 0) {
        container.innerHTML = '<span class="error-text">Нет доступных типов бумаги</span>';
        return;
    }
    
    const html = ProductState.papers.map((paper, index) => {
        const isActive = index === 0 ? 'active' : '';
        
        return `<button class="option-btn ${isActive}" 
                    data-value="${paper.code}" 
                    data-coefficient="${paper.coefficient}"
                    data-name="${paper.name}">
                    ${paper.name}
                </button>`;
    }).join('');
    
    container.innerHTML = html;
    
    // Устанавливаем первую бумагу как выбранную
    if (ProductState.papers.length > 0) {
        const first = ProductState.papers[0];
        ProductState.selectedPaper = first.code;
        ProductState.paperCoefficient = parseFloat(first.coefficient);
        document.getElementById('paper-display').textContent = first.name;
    }
}

// Инициализация обработчиков кнопок
function initOptionButtons() {
    // Размеры
    document.getElementById('size-buttons')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.option-btn');
        if (!btn) return;
        
        // Убираем active у всех
        btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Обновляем состояние
        ProductState.selectedSize = btn.dataset.value;
        ProductState.basePrice = parseFloat(btn.dataset.price);
        document.getElementById('size-display').textContent = btn.dataset.name || btn.dataset.value;
        
        updatePrice();
    });
    
    // Бумага
    document.getElementById('paper-buttons')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.option-btn');
        if (!btn) return;
        
        btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        ProductState.selectedPaper = btn.dataset.value;
        ProductState.paperCoefficient = parseFloat(btn.dataset.coefficient);
        document.getElementById('paper-display').textContent = btn.dataset.name || btn.dataset.value;
        
        updatePrice();
    });
    
    // Режим (статический, без API)
    document.getElementById('mode-buttons')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.option-btn');
        if (!btn) return;
        
        btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.getElementById('mode-display').textContent = btn.dataset.value;
    });
    
    // Нестандартный размер
    const customWidth = document.getElementById('custom-width');
    const customHeight = document.getElementById('custom-height');
    
    if (customWidth && customHeight) {
        const handleCustomSize = () => {
            const w = parseInt(customWidth.value);
            const h = parseInt(customHeight.value);
            
            if (w > 0 && h > 0) {
                // Снимаем выделение со стандартных размеров
                document.querySelectorAll('#size-buttons .option-btn').forEach(b => b.classList.remove('active'));
                
                // Рассчитываем цену нестандартного размера
                // Формула: площадь × коэффициент за см²
                const area = w * h;
                const pricePerCm2 = 0.1; // 10 копеек за см² (настраивается)
                ProductState.basePrice = Math.round(area * pricePerCm2);
                ProductState.selectedSize = `${w}x${h}`;
                
                document.getElementById('size-display').textContent = `${w}×${h} (нестанд.)`;
                updatePrice();
            }
        };
        
        customWidth.addEventListener('input', handleCustomSize);
        customHeight.addEventListener('input', handleCustomSize);
    }
}

// Расчёт и обновление цены
function updatePrice() {
    const price = Math.round(ProductState.basePrice * ProductState.paperCoefficient);
    document.getElementById('price-display').textContent = price;
}

// Экспорт для использования в других скриптах
window.ProductState = ProductState;
window.initProductPage = initProductPage;
