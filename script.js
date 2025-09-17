// Estado da aplicação
const appState = {
    searchHistory: JSON.parse(localStorage.getItem('medicationHistory') || '[]'),
    favorites: JSON.parse(localStorage.getItem('medicationFavorites') || '[]'),
    currentSearch: '',
    suggestions: [],
    selectedSuggestionIndex: -1
};

// Elementos DOM
const elements = {
    searchInput: document.getElementById('medicationSearch'),
    searchButton: document.getElementById('searchButton'),
    suggestions: document.getElementById('suggestions'),
    loading: document.getElementById('loading'),
    results: document.getElementById('results'),
    medicationInfo: document.getElementById('medicationInfo'),
    history: document.getElementById('history'),
    historyList: document.getElementById('historyList'),
    clearHistory: document.getElementById('clearHistory'),
    favorites: document.getElementById('favorites'),
    favoritesList: document.getElementById('favoritesList')
};

// Base de dados simulada de medicamentos (em produção, seria uma API real)
const medicationDatabase = {
    'paracetamol': {
        name: 'Paracetamol',
        riskLevel: 'very-low',
        riskText: 'Muito Baixo Risco',
        recommendation: 'Paracetamol é considerado seguro durante a amamentação. É o analgésico de primeira escolha para mães lactantes. Apenas 0.1-0.2% da dose materna passa para o leite.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/paracetamol/product/'
    },
    'ibuprofeno': {
        name: 'Ibuprofeno',
        riskLevel: 'very-low',
        riskText: 'Muito Baixo Risco',
        recommendation: 'Ibuprofeno é seguro durante a amamentação. Menos de 0.1% da dose materna é excretada no leite materno. Pode ser usado para dor e inflamação.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/ibuprofen/product/'
    },
    'dipirona': {
        name: 'Dipirona (Metamizol)',
        riskLevel: 'moderate',
        riskText: 'Risco Moderado',
        recommendation: 'Dipirona deve ser usada com cautela. Pode causar agranulocitose rara mas grave. Use apenas sob orientação médica e por curto período.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/metamizole/product/'
    },
    'aspirina': {
        name: 'Aspirina (Ácido Acetilsalicílico)',
        riskLevel: 'moderate',
        riskText: 'Risco Moderado',
        recommendation: 'Aspirina em doses baixas é relativamente segura, mas doses altas podem causar síndrome de Reye no bebê. Evite uso prolongado.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/acetylsalicylic-acid/product/'
    },
    'codeína': {
        name: 'Codeína',
        riskLevel: 'high',
        riskText: 'Alto Risco',
        recommendation: 'Codeína deve ser evitada durante a amamentação. Pode causar depressão respiratória grave no bebê. Use alternativas mais seguras.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/codeine/product/'
    },
    'morfina': {
        name: 'Morfina',
        riskLevel: 'moderate',
        riskText: 'Risco Moderado',
        recommendation: 'Morfina pode ser usada com cautela para dor severa. Monitore o bebê para sinais de sedação. Use a menor dose eficaz.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/morphine/product/'
    },
    'amoxicilina': {
        name: 'Amoxicilina',
        riskLevel: 'very-low',
        riskText: 'Muito Baixo Risco',
        recommendation: 'Amoxicilina é segura durante a amamentação. É um dos antibióticos de primeira escolha para infecções bacterianas.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/amoxicillin/product/'
    },
    'azitromicina': {
        name: 'Azitromicina',
        riskLevel: 'low',
        riskText: 'Baixo Risco',
        recommendation: 'Azitromicina é considerada segura. Baixa concentração no leite materno. Pode ser usada para infecções respiratórias.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/azithromycin/product/'
    },
    'cetirizina': {
        name: 'Cetirizina',
        riskLevel: 'low',
        riskText: 'Baixo Risco',
        recommendation: 'Cetirizina é segura para uso ocasional. Pode causar sonolência leve no bebê. Monitore o comportamento do bebê.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/cetirizine/product/'
    },
    'loratadina': {
        name: 'Loratadina',
        riskLevel: 'very-low',
        riskText: 'Muito Baixo Risco',
        recommendation: 'Loratadina é segura durante a amamentação. Não causa sonolência significativa. Boa opção para alergias.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/loratadine/product/'
    }
};

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadHistory();
    loadFavorites();
});

function initializeApp() {
    // Configurar autocompletar
    setupAutocomplete();
    
    // Mostrar histórico se existir
    if (appState.searchHistory.length > 0) {
        showHistory();
    }
    
    // Mostrar favoritos se existirem
    if (appState.favorites.length > 0) {
        showFavorites();
    }
}

function setupEventListeners() {
    // Busca
    elements.searchButton.addEventListener('click', handleSearch);
    elements.searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // Histórico
    elements.clearHistory.addEventListener('click', clearHistory);
    
    // Fechar sugestões ao clicar fora
    document.addEventListener('click', function(e) {
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer && !searchContainer.contains(e.target)) {
            hideSuggestions();
        }
    });
}

function setupAutocomplete() {
    elements.searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase().trim();
        appState.currentSearch = query;
        
        if (query.length < 2) {
            hideSuggestions();
            return;
        }
        
        // Simular busca com delay para melhor UX
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            searchSuggestions(query);
        }, 300);
    });
    
    // Navegação por teclado
    elements.searchInput.addEventListener('keydown', function(e) {
        if (!elements.suggestions.classList.contains('hidden')) {
            handleSuggestionNavigation(e);
        }
    });
}

function searchSuggestions(query) {
    const matches = Object.keys(medicationDatabase)
        .filter(key => 
            medicationDatabase[key].name.toLowerCase().includes(query) ||
            key.includes(query)
        )
        .slice(0, 5)
        .map(key => ({
            key,
            name: medicationDatabase[key].name,
            riskLevel: medicationDatabase[key].riskLevel
        }));
    
    appState.suggestions = matches;
    showSuggestions(matches);
}

function showSuggestions(suggestions) {
    if (suggestions.length === 0) {
        hideSuggestions();
        return;
    }
    
    elements.suggestions.innerHTML = '';
    appState.selectedSuggestionIndex = -1;
    
    suggestions.forEach((suggestion, index) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = suggestion.name;
        item.setAttribute('role', 'option');
        item.setAttribute('data-key', suggestion.key);
        
        item.addEventListener('click', function() {
            selectSuggestion(suggestion.key);
        });
        
        elements.suggestions.appendChild(item);
    });
    
    elements.suggestions.style.display = 'block';
    elements.suggestions.classList.remove('hidden');
}

function hideSuggestions() {
    elements.suggestions.style.display = 'none';
    elements.suggestions.classList.add('hidden');
    appState.selectedSuggestionIndex = -1;
}

function handleSuggestionNavigation(e) {
    const suggestions = elements.suggestions.querySelectorAll('.suggestion-item');
    
    switch(e.key) {
        case 'ArrowDown':
            e.preventDefault();
            appState.selectedSuggestionIndex = Math.min(
                appState.selectedSuggestionIndex + 1, 
                suggestions.length - 1
            );
            updateSuggestionSelection();
            break;
        case 'ArrowUp':
            e.preventDefault();
            appState.selectedSuggestionIndex = Math.max(
                appState.selectedSuggestionIndex - 1, 
                -1
            );
            updateSuggestionSelection();
            break;
        case 'Enter':
            e.preventDefault();
            if (appState.selectedSuggestionIndex >= 0) {
                const selectedItem = suggestions[appState.selectedSuggestionIndex];
                selectSuggestion(selectedItem.getAttribute('data-key'));
            }
            break;
        case 'Escape':
            hideSuggestions();
            break;
    }
}

function updateSuggestionSelection() {
    const suggestions = elements.suggestions.querySelectorAll('.suggestion-item');
    suggestions.forEach((item, index) => {
        item.setAttribute('aria-selected', index === appState.selectedSuggestionIndex);
    });
}

function selectSuggestion(key) {
    const medication = medicationDatabase[key];
    if (medication) {
        elements.searchInput.value = medication.name;
        hideSuggestions();
        searchMedication(key);
    }
}

async function handleSearch() {
    const query = elements.searchInput.value.trim();
    if (!query) return;
    
    // Buscar por nome ou chave
    const key = Object.keys(medicationDatabase).find(k => 
        medicationDatabase[k].name.toLowerCase() === query.toLowerCase() ||
        k === query.toLowerCase()
    );
    
    if (key) {
        searchMedication(key);
    } else {
        showError('Medicamento não encontrado. Tente buscar por outro nome.');
    }
}

async function searchMedication(key) {
    const medication = medicationDatabase[key];
    if (!medication) return;
    
    showLoading();
    hideSuggestions();
    
    // Simular delay de API
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Adicionar ao histórico
    addToHistory(medication.name, key);
    
    // Mostrar resultados
    showMedicationInfo(medication);
    
    hideLoading();
}

function showMedicationInfo(medication) {
    const riskClass = `risk-${medication.riskLevel}`;
    
    elements.medicationInfo.innerHTML = `
        <div class="medication-name">${medication.name}</div>
        <div class="risk-level ${riskClass}">${medication.riskText}</div>
        <div class="recommendation">
            <h4>Recomendação:</h4>
            <p>${medication.recommendation}</p>
        </div>
        <a href="${medication.sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15,3 21,3 21,9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Ver fonte original no e-lactancia.org
        </a>
        <div class="medication-actions" style="margin-top: 1rem;">
            <button class="btn btn-primary" onclick="addToFavorites('${medication.name}', '${Object.keys(medicationDatabase).find(k => medicationDatabase[k] === medication)}')">
                ⭐ Adicionar aos Favoritos
            </button>
        </div>
    `;
    
    elements.results.classList.remove('hidden');
}

function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.results.classList.add('hidden');
    elements.searchButton.disabled = true;
}

function hideLoading() {
    elements.loading.classList.add('hidden');
    elements.searchButton.disabled = false;
}

function showError(message) {
    elements.medicationInfo.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #dc3545;">
            <h3>❌ ${message}</h3>
            <p>Tente buscar por outro nome ou verifique a ortografia.</p>
        </div>
    `;
    elements.results.classList.remove('hidden');
}

// Histórico
function addToHistory(name, key) {
    const existingIndex = appState.searchHistory.findIndex(item => item.key === key);
    
    if (existingIndex >= 0) {
        // Mover para o topo
        appState.searchHistory.splice(existingIndex, 1);
    }
    
    appState.searchHistory.unshift({ name, key, timestamp: Date.now() });
    
    // Manter apenas os últimos 10
    appState.searchHistory = appState.searchHistory.slice(0, 10);
    
    localStorage.setItem('medicationHistory', JSON.stringify(appState.searchHistory));
    loadHistory();
}

function loadHistory() {
    if (appState.searchHistory.length === 0) return;
    
    elements.historyList.innerHTML = '';
    
    appState.searchHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <span class="item-name">${item.name}</span>
            <div class="item-actions">
                <button class="btn btn-primary" onclick="searchFromHistory('${item.key}')">Buscar</button>
                <button class="btn btn-danger" onclick="removeFromHistory('${item.key}')">Remover</button>
            </div>
        `;
        elements.historyList.appendChild(historyItem);
    });
    
    showHistory();
}

function showHistory() {
    elements.history.classList.remove('hidden');
}

function searchFromHistory(key) {
    const medication = medicationDatabase[key];
    if (medication) {
        elements.searchInput.value = medication.name;
        searchMedication(key);
    }
}

function removeFromHistory(key) {
    appState.searchHistory = appState.searchHistory.filter(item => item.key !== key);
    localStorage.setItem('medicationHistory', JSON.stringify(appState.searchHistory));
    loadHistory();
    
    if (appState.searchHistory.length === 0) {
        elements.history.classList.add('hidden');
    }
}

function clearHistory() {
    if (confirm('Tem certeza que deseja limpar todo o histórico?')) {
        appState.searchHistory = [];
        localStorage.removeItem('medicationHistory');
        elements.history.classList.add('hidden');
    }
}

// Favoritos
function addToFavorites(name, key) {
    const existingIndex = appState.favorites.findIndex(item => item.key === key);
    
    if (existingIndex >= 0) {
        alert('Este medicamento já está nos favoritos!');
        return;
    }
    
    appState.favorites.unshift({ name, key, timestamp: Date.now() });
    localStorage.setItem('medicationFavorites', JSON.stringify(appState.favorites));
    loadFavorites();
    
    // Feedback visual
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = '✅ Adicionado!';
    button.disabled = true;
    
    setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
    }, 2000);
}

function loadFavorites() {
    if (appState.favorites.length === 0) return;
    
    elements.favoritesList.innerHTML = '';
    
    appState.favorites.forEach(item => {
        const favoriteItem = document.createElement('div');
        favoriteItem.className = 'favorite-item';
        favoriteItem.innerHTML = `
            <span class="item-name">${item.name}</span>
            <div class="item-actions">
                <button class="btn btn-primary" onclick="searchFromFavorites('${item.key}')">Buscar</button>
                <button class="btn btn-danger" onclick="removeFromFavorites('${item.key}')">Remover</button>
            </div>
        `;
        elements.favoritesList.appendChild(favoriteItem);
    });
    
    showFavorites();
}

function showFavorites() {
    elements.favorites.classList.remove('hidden');
}

function searchFromFavorites(key) {
    const medication = medicationDatabase[key];
    if (medication) {
        elements.searchInput.value = medication.name;
        searchMedication(key);
    }
}

function removeFromFavorites(key) {
    appState.favorites = appState.favorites.filter(item => item.key !== key);
    localStorage.setItem('medicationFavorites', JSON.stringify(appState.favorites));
    loadFavorites();
    
    if (appState.favorites.length === 0) {
        elements.favorites.classList.add('hidden');
    }
}

// Service Worker para cache (PWA básico)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registrado com sucesso');
            })
            .catch(function(error) {
                console.log('Falha ao registrar ServiceWorker');
            });
    });
}