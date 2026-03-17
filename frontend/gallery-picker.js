// ==================== UNIVERSAL GALLERY PICKER ====================
// Корзина отмеченных фото живёт между галереями и сессиями открытия picker'а.
// После нажатия «Добавить» вызывает window.onGalleryPhotosSelected(photosArray).
// Каждый элемент: { blob, url, name, width, height }

;(function () {
    const API_URL = 'http://127.0.0.1:8000/api';

    // Корзина: Map<photoId, photoObject> — сохраняется между открытиями галерей
    const _basket = new Map();

    let _currentGalleryId   = null;
    let _currentGalleryName = '';
    let _currentPhotos      = [];   // фото текущей открытой галереи

    // ──────────────────────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────────────────────
    window.GalleryPicker = { init, show };

    function init() {
        document.getElementById('tab-gallery')
            ?.addEventListener('click', () => _loadGalleries());

        document.getElementById('gallery-picker')
            ?.addEventListener('click', _handlePickerClick);
    }

    function show() {
        document.getElementById('upload-sources').style.display = 'none';
        document.getElementById('gallery-picker').style.display = 'block';

        document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
        document.getElementById('tab-gallery')?.classList.add('active');

        _loadGalleries();
    }

    // ──────────────────────────────────────────────────────────────
    // LOAD GALLERY LIST
    // ──────────────────────────────────────────────────────────────
    async function _loadGalleries() {
        const galleriesList = document.getElementById('galleries-list');
        const galleryPhotos = document.getElementById('gallery-photos');
        if (!galleriesList) return;

        galleriesList.style.display = 'flex';
        galleryPhotos.style.display = 'none';
        _currentGalleryId = null;
        _renderBasketBar();

        const token = localStorage.getItem('access');
        if (!token) {
            galleriesList.innerHTML = '<p class="gp-msg">Войдите в аккаунт, чтобы использовать галерею</p>';
            return;
        }

        galleriesList.innerHTML = '<p class="gp-msg">Загрузка...</p>';
        try {
            const res = await fetch(`${API_URL}/galleries/`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) throw new Error();
            const galleries = await res.json();

            if (!galleries.length) {
                galleriesList.innerHTML = '<p class="gp-msg">Галерей нет. ' +
                    '<a href="/frontend/account/galleries.html" target="_blank" style="color:var(--primary)">Создать →</a></p>';
                return;
            }

            galleriesList.innerHTML = '';
            galleries.forEach(g => {
                const previews = g.preview_photos || [];
                const count    = g.photos_count  || 0;

                // 4 ячейки с overflow:hidden через .gallery-thumb-cell
                let cells = '';
                for (let i = 0; i < 4; i++) {
                    cells += previews[i]
                        ? `<div class="gallery-thumb-cell"><img src="${previews[i]}" alt="" loading="lazy"></div>`
                        : `<div class="gallery-thumb-cell"><div class="gallery-thumb-placeholder"></div></div>`;
                }

                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.dataset.id = g.id;
                item.innerHTML  = `
                    <div class="gallery-thumb">
                        <div class="gallery-photo-count"><span>${count}</span> фото</div>
                        ${cells}
                    </div>
                    <div class="gallery-name">${_esc(g.name)}</div>`;
                item.addEventListener('click', () => _loadGalleryPhotos(g.id, g.name));
                galleriesList.appendChild(item);
            });

        } catch (e) {
            galleriesList.innerHTML = '<p class="gp-msg" style="color:#c0392b">Не удалось загрузить галереи</p>';
        }
    }

    // ──────────────────────────────────────────────────────────────
    // LOAD PHOTOS OF ONE GALLERY
    // ──────────────────────────────────────────────────────────────
    async function _loadGalleryPhotos(galleryId, galleryName) {
        _currentGalleryId   = galleryId;
        _currentGalleryName = galleryName;

        const galleriesList = document.getElementById('galleries-list');
        const galleryPhotos = document.getElementById('gallery-photos');

        galleriesList.style.display = 'none';
        galleryPhotos.style.display = 'block';
        galleryPhotos.innerHTML     = '<p class="gp-msg">Загрузка...</p>';

        const token = localStorage.getItem('access');
        try {
            const res = await fetch(`${API_URL}/galleries/${galleryId}/`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            _currentPhotos = data.photos || [];
            _renderPhotoGrid();
        } catch (e) {
            galleryPhotos.innerHTML = '<p class="gp-msg" style="color:#c0392b">Не удалось загрузить фото</p>';
        }
    }

    // ──────────────────────────────────────────────────────────────
    // RENDER PHOTO GRID
    // ──────────────────────────────────────────────────────────────
    function _renderPhotoGrid() {
        const container = document.getElementById('gallery-photos');

        const toolbar = `
            <div class="gp-toolbar">
                <button class="gp-back-btn" id="gp-back">← К галереям</button>
                <span class="gp-gallery-name">${_esc(_currentGalleryName)}</span>
                <div class="gp-toolbar-right">
                    <button class="gp-select-all" id="gp-select-all">Выбрать все</button>
                </div>
            </div>`;

        if (!_currentPhotos.length) {
            container.innerHTML = toolbar + '<p class="gp-msg">В этой галерее нет фото</p>';
            _renderBasketBar();
            return;
        }

        const grid = _currentPhotos.map(p => `
            <div class="gp-photo-cell ${_basket.has(p.id) ? 'selected' : ''}"
                 data-photo-id="${p.id}">
                <img src="${p.url}" alt="${_esc(p.original_name)}" loading="lazy">
                <div class="gp-check">✓</div>
            </div>`).join('');

        container.innerHTML = toolbar + `<div class="gp-photo-grid">${grid}</div>`;
        _renderBasketBar();
        _syncSelectAllBtn();
    }

    // ──────────────────────────────────────────────────────────────
    // BASKET BAR (sticky внизу picker'а)
    // ──────────────────────────────────────────────────────────────
    function _renderBasketBar() {
        let bar = document.getElementById('gp-basket-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'gp-basket-bar';
            bar.className = 'gp-basket-bar';
            document.getElementById('gallery-picker')?.appendChild(bar);
        }

        const count = _basket.size;
        bar.innerHTML = `
            <span class="gp-basket-count">${count > 0 ? `Выбрано: <strong>${count}</strong> фото` : 'Фото не выбраны'}</span>
            <div class="gp-basket-actions">
                ${count > 0 ? '<button class="gp-clear-btn" id="gp-clear">Очистить</button>' : ''}
                <button class="gp-add-btn" id="gp-add-btn" ${count === 0 ? 'disabled' : ''}>
                    ${count > 0 ? `Добавить (${count})` : 'Добавить'}
                </button>
            </div>`;
    }

    // ──────────────────────────────────────────────────────────────
    // EVENT DELEGATION
    // ──────────────────────────────────────────────────────────────
    function _handlePickerClick(e) {
        // Назад к списку галерей
        if (e.target.closest('#gp-back')) {
            _loadGalleries();
            return;
        }
        // Выбрать все / снять все в текущей галерее
        if (e.target.closest('#gp-select-all')) {
            const allSelected = _currentPhotos.every(p => _basket.has(p.id));
            _currentPhotos.forEach(p => {
                if (allSelected) _basket.delete(p.id);
                else             _basket.set(p.id, p);
            });
            _syncCells();
            _renderBasketBar();
            _syncSelectAllBtn();
            return;
        }
        // Очистить корзину
        if (e.target.closest('#gp-clear')) {
            _basket.clear();
            _syncCells();
            _renderBasketBar();
            _syncSelectAllBtn();
            return;
        }
        // Добавить выбранные
        if (e.target.closest('#gp-add-btn') && _basket.size > 0) {
            _confirmSelection();
            return;
        }
        // Клик по фото — тогл
        const cell = e.target.closest('.gp-photo-cell');
        if (cell) {
            const id    = +cell.dataset.photoId;
            const photo = _currentPhotos.find(p => p.id === id);
            if (_basket.has(id)) {
                _basket.delete(id);
                cell.classList.remove('selected');
            } else if (photo) {
                _basket.set(id, photo);
                cell.classList.add('selected');
            }
            _renderBasketBar();
            _syncSelectAllBtn();
        }
    }

    function _syncCells() {
        document.querySelectorAll('.gp-photo-cell').forEach(cell => {
            cell.classList.toggle('selected', _basket.has(+cell.dataset.photoId));
        });
    }

    function _syncSelectAllBtn() {
        const btn = document.getElementById('gp-select-all');
        if (!btn || !_currentPhotos.length) return;
        btn.textContent = _currentPhotos.every(p => _basket.has(p.id))
            ? 'Снять все' : 'Выбрать все';
    }

    // ──────────────────────────────────────────────────────────────
    // CONFIRM — fetch blobs, call callback
    // ──────────────────────────────────────────────────────────────
    async function _confirmSelection() {
        const selected = [..._basket.values()];
        const addBtn   = document.getElementById('gp-add-btn');
        if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Загрузка...'; }

        const results = [];
        for (const photo of selected) {
            try {
                const resp = await fetch(photo.url);
                const blob = await resp.blob();
                results.push({ blob, url: photo.url, name: photo.original_name,
                                width: photo.width, height: photo.height });
            } catch (e) {
                console.error('GalleryPicker: blob fetch error', photo.url, e);
            }
        }

        // Очищаем корзину и возвращаем UI
        _basket.clear();
        _currentGalleryId = null;
        _currentPhotos    = [];

        document.getElementById('gallery-picker').style.display  = 'none';
        document.getElementById('upload-sources').style.display  = 'flex';

        if (typeof window.onGalleryPhotosSelected === 'function') {
            window.onGalleryPhotosSelected(results);
        }
    }

    function _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                               .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
})();
