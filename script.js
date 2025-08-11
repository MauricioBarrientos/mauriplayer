document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    const m3uUrlInput = document.getElementById('m3u-url');
    const saveButton = document.getElementById('save-button');
    const channelListEl = document.getElementById('channel-list');
    const videoPlayer = document.getElementById('video-player');
    const playerPlaceholder = document.getElementById('player-placeholder');
    const historyDropdown = document.getElementById('history-dropdown');
    const clearHistoryButton = document.getElementById('clear-history-button');
    const showFavoritesToggle = document.getElementById('show-favorites-toggle');
    const searchBox = document.getElementById('search-box');

    // --- Estado de la Aplicación ---
    let hls = null;
    let favorites = [];
    let currentChannels = [];
    const MAX_HISTORY_SIZE = 10;

    // --- Funciones de Almacenamiento y Carga ---
    async function loadState() {
        const result = await chrome.storage.local.get(['urlHistory', 'favorites']);
        favorites = result.favorites || [];
        const history = result.urlHistory || [];

        historyDropdown.innerHTML = '<option value="">Historial</option>';
        history.forEach(url => {
            const option = document.createElement('option');
            option.value = url;
            option.textContent = url.length > 30 ? url.substring(0, 30) + '...' : url;
            historyDropdown.appendChild(option);
        });

        if (history.length > 0) {
            m3uUrlInput.value = history[0];
            await loadAndParseM3U(history[0]);
        }
    }

    async function saveUrlToHistory(url) {
        if (!url) return;
        const result = await chrome.storage.local.get(['urlHistory']);
        let history = result.urlHistory || [];
        history = history.filter(item => item !== url);
        history.unshift(url);
        if (history.length > MAX_HISTORY_SIZE) {
            history = history.slice(0, MAX_HISTORY_SIZE);
        }
        await chrome.storage.local.set({ urlHistory: history });
    }

    async function toggleFavorite(channel) {
        const index = favorites.findIndex(fav => fav.url === channel.url);
        if (index > -1) {
            favorites.splice(index, 1); // Quitar de favoritos
        } else {
            favorites.push(channel); // Añadir a favoritos
        }
        await chrome.storage.local.set({ favorites });
        filterAndDisplayChannels(); // Actualizar vista
    }

    // --- Lógica Principal ---
    async function loadAndParseM3U(url) {
        channelListEl.innerHTML = '<li>Cargando...</li>';
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error en la red: ${response.statusText}`);
            const text = await response.text();
            currentChannels = parseM3U(text);
            if (currentChannels.length === 0) {
                channelListEl.innerHTML = '<li>No se encontraron canales en la lista.</li>';
            } else {
                filterAndDisplayChannels();
            }
        } catch (error) {
            console.error('Error al cargar o procesar la lista M3U:', error);
            channelListEl.innerHTML = `<li>Error al cargar la lista: ${error.message}</li>`;
        }
    }

    function parseM3U(data) {
        const lines = data.split(/\r?\n/);
        const channels = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXTINF:')) {
                const title = lines[i].substring(lines[i].lastIndexOf(',') + 1).trim();
                let url = null;
                let j = i + 1;
                // Buscar la siguiente línea válida (no vacía, no comentario)
                while (j < lines.length && (!lines[j] || lines[j].startsWith('#'))) {
                    j++;
                }
                if (j < lines.length) {
                    url = lines[j].trim();
                }
                if (title && url) {
                    channels.push({ title, url });
                }
                i = j;
            }
        }
        return channels;
    }

    function filterAndDisplayChannels() {
        const searchTerm = searchBox.value.toLowerCase();
        const showOnlyFavorites = showFavoritesToggle.checked;
        let channelsToDisplay = currentChannels;

        if (showOnlyFavorites) {
            channelsToDisplay = channelsToDisplay.filter(c => favorites.some(f => f.url === c.url));
        }
        if (searchTerm) {
            channelsToDisplay = channelsToDisplay.filter(c => c.title.toLowerCase().includes(searchTerm));
        }
        displayChannels(channelsToDisplay);
    }

    function displayChannels(channels) {
        channelListEl.innerHTML = '';
        channels.forEach(channel => {
            const isFav = favorites.some(fav => fav.url === channel.url);
            const listItem = document.createElement('li');

            const titleSpan = document.createElement('span');
            titleSpan.className = 'channel-title';
            titleSpan.textContent = channel.title;
            listItem.appendChild(titleSpan);

            const starSpan = document.createElement('span');
            starSpan.className = 'favorite-star';
            starSpan.textContent = '★';
            if (isFav) starSpan.classList.add('is-favorite');
            starSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(channel);
            });
            listItem.appendChild(starSpan);

            listItem.addEventListener('click', () => {
                playChannel(channel.url);
                document.querySelectorAll('#channel-list li').forEach(li => li.classList.remove('active'));
                listItem.classList.add('active');
            });

            channelListEl.appendChild(listItem);
        });
    }

    function playChannel(url) {
        document.body.classList.add('video-playing');
        playerPlaceholder.style.display = 'none';
        videoPlayer.style.display = 'block';

        if (window.Hls && Hls.isSupported()) {
            if (hls) hls.destroy();
            hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(videoPlayer);
        } else {
            videoPlayer.src = url;
        }
        videoPlayer.play();
    }

    // --- Event Listeners ---
    saveButton.addEventListener('click', async () => {
        const url = m3uUrlInput.value.trim();
        if (url) {
            await saveUrlToHistory(url);
            await loadState();
            await loadAndParseM3U(url);
        }
    });

    historyDropdown.addEventListener('change', () => {
        const selectedUrl = historyDropdown.value;
        if (selectedUrl) {
            m3uUrlInput.value = selectedUrl;
            loadAndParseM3U(selectedUrl);
        }
    });

    clearHistoryButton.addEventListener('click', async () => {
        await chrome.storage.local.remove(['urlHistory', 'favorites']);
        favorites = [];
        currentChannels = [];
        m3uUrlInput.value = '';
        await loadState();
        filterAndDisplayChannels();
    });

    showFavoritesToggle.addEventListener('change', filterAndDisplayChannels);
    searchBox.addEventListener('input', filterAndDisplayChannels);

    // --- Inicialización ---
    loadState();
});