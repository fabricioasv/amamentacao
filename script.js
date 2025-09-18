// Estado da aplicação
const appState = {
    searchHistory: JSON.parse(localStorage.getItem('medicationHistory') || '[]'),
    favorites: JSON.parse(localStorage.getItem('medicationFavorites') || '[]'),
    currentSearch: '',
    suggestions: [],
    selectedSuggestionIndex: -1,
    isSearching: false
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
    favoritesList: document.getElementById('favoritesList'),
    clearCache: document.getElementById('clearCache'),
    showCache: document.getElementById('showCache'),
    refreshSuggestions: document.getElementById('refreshSuggestions')
};

// Configuração da API
const API_DETAIL_URL = 'https://e-lactancia.org/breastfeeding/';
const API_DETAIL_SEARCH_URL = 'https://e-lactancia.org/buscar/?term_id=';
const TRANSLATE_API_URL = 'https://api.mymemory.translated.net/get';

// Função para traduzir texto usando MyMemory API
async function translateText(text, fromLang = 'en', toLang = 'pt') {
    if (!text || text.trim() === '') return text;
    
    try {
        // Se o texto for menor que 500 caracteres, traduzir diretamente
        if (text.length <= 500) {
            const response = await fetch(
                `${TRANSLATE_API_URL}?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`
            );
            
            if (!response.ok) {
                throw new Error('Erro na API de tradução');
            }
            
            const data = await response.json();
            return data.responseData.translatedText || text;
        }
        
        // Para textos longos, dividir em chunks de 500 caracteres
        console.log(`Texto longo detectado (${text.length} caracteres), dividindo em chunks...`);
        
        const chunks = [];
        const chunkSize = 500;
        
        // Dividir o texto em chunks, tentando manter palavras inteiras
        for (let i = 0; i < text.length; i += chunkSize) {
            let chunk = text.substring(i, i + chunkSize);
            
            // Se não é o último chunk e não termina em espaço, tentar encontrar o último espaço
            if (i + chunkSize < text.length && !chunk.endsWith(' ')) {
                const lastSpaceIndex = chunk.lastIndexOf(' ');
                if (lastSpaceIndex > chunkSize * 0.7) { // Só se o espaço estiver nos últimos 30%
                    chunk = chunk.substring(0, lastSpaceIndex);
                    i = i - (chunkSize - lastSpaceIndex); // Ajustar o índice
                }
            }
            
            chunks.push(chunk.trim());
        }
        
        console.log(`Dividido em ${chunks.length} chunks`);
        
        // Traduzir cada chunk
        const translatedChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (chunk.length === 0) continue;
            
            console.log(`Traduzindo chunk ${i + 1}/${chunks.length} (${chunk.length} caracteres)...`);
            
            const response = await fetch(
                `${TRANSLATE_API_URL}?q=${encodeURIComponent(chunk)}&langpair=${fromLang}|${toLang}`
            );
            
            if (!response.ok) {
                throw new Error(`Erro na API de tradução para chunk ${i + 1}`);
            }
            
            const data = await response.json();
            const translatedChunk = data.responseData.translatedText || chunk;
            translatedChunks.push(translatedChunk);
            
            // Pequena pausa entre requisições para não sobrecarregar a API
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Concatenar os chunks traduzidos
        const result = translatedChunks.join(' ');
        console.log(`Tradução concluída: ${result.length} caracteres`);
        
        return result;
        
    } catch (error) {
        console.error('Erro ao traduzir:', error);
        return text; // Retorna texto original se falhar
    }
}

// Função para detectar se o texto está em inglês
function isEnglish(text) {
    if (!text || text.trim() === '') return false;
    
    // Detecção simples baseada em palavras comuns em inglês
    const englishWords = [
        'the', 'and', 'or', 'of', 'in', 'to', 'for', 'with', 'by', 'safe', 
        'compatible', 'breastfeeding', 'medication', 'product', 'unsafe', 
        'moderate', 'severe', 'adverse', 'effects', 'recommended', 'alternative',
        'discontinue', 'read', 'commentary', 'safe', 'best', 'option', 'likely',
        'compatibility', 'limited', 'incompatible', 'very', 'unsafe'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    const englishWordCount = words.filter(word => englishWords.includes(word)).length;
    return englishWordCount > 2;
}

// Função para traduzir informações do medicamento
async function translateMedicationInfo(medication) {
    const translated = { ...medication };
    
    // Traduzir compatibilidade se estiver em inglês
    if (medication.compatibility && isEnglish(medication.compatibility)) {
        console.log('Traduzindo compatibilidade:', medication.compatibility);
        translated.compatibility = await translateText(medication.compatibility);
        console.log('Compatibilidade traduzida:', translated.compatibility);
    }
    
    // Traduzir recomendação se estiver em inglês
    if (medication.recommendation && isEnglish(medication.recommendation)) {
        console.log('Traduzindo recomendação:', medication.recommendation.substring(0, 100) + '...');
        translated.recommendation = await translateText(medication.recommendation);
        console.log('Recomendação traduzida:', translated.recommendation.substring(0, 100) + '...');
    }
    
    return translated;
}

// Cache local para medicamentos já consultados
const medicationCache = new Map();

// Base de dados de fallback para medicamentos comuns (caso a API falhe)
const fallbackDatabase = {
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
    
    // Atualizar botão de cache
    updateCacheButton();
    
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
    
    // Cache controls
    elements.clearCache.addEventListener('click', clearCache);
    elements.showCache.addEventListener('click', showCache);
    elements.refreshSuggestions.addEventListener('click', refreshSuggestions);
    
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
        const query = e.target.value.trim();
        appState.currentSearch = query;
        
        // Limpar sugestões quando o usuário digita
        hideSuggestions();
    });
    
    // Navegação por teclado
    elements.searchInput.addEventListener('keydown', function(e) {
        if (!elements.suggestions.classList.contains('hidden')) {
            handleSuggestionNavigation(e);
        }
    });
}


async function searchSuggestions(query) {
    try {
        // Buscar na API do e-lactancia.org
        const response = await fetch(`${API_BASE_URL}${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error('Erro na API');
        }
        
        const data = await response.json();
        
        // Filtrar apenas produtos (medicamentos) e limitar a 5 resultados
        const matches = data
            .filter(item => item.term === 'producto')
            .slice(0, 5)
            .map(item => ({
                id: item.id,
                name: item.nombre || item.nombre_en,
                key: item.id.toString()
            }));
        
        appState.suggestions = matches;
        showSuggestions(matches);
        
    } catch (error) {
        console.error('Erro ao buscar sugestões:', error);
        showError('Erro ao buscar medicamentos. Tente novamente.');
    }
}



function showSuggestions(suggestions) {
    if (suggestions.length === 0) {
        hideSuggestions();
        return;
    }
    
    elements.suggestions.innerHTML = '';
    appState.selectedSuggestionIndex = -1;
    
    // Adicionar cabeçalho com contador
    const header = document.createElement('div');
    header.className = 'suggestions-header';
    header.innerHTML = `
        <div class="suggestions-count">
            <span class="count-number">${suggestions.length}</span>
            <span class="count-text">resultado${suggestions.length !== 1 ? 's' : ''} encontrado${suggestions.length !== 1 ? 's' : ''}</span>
        </div>
    `;
    elements.suggestions.appendChild(header);
    
    suggestions.forEach((suggestion, index) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        
        // Definir tipo e cor baseado no term
        let typeText = 'Medicamento';
        let typeClass = 'suggestion-type-producto';
        
        switch(suggestion.type) {
            case 'producto':
                typeText = 'Medicamento';
                typeClass = 'suggestion-type-producto';
                break;
            case 'sinonimo':
                typeText = 'Sinônimo';
                typeClass = 'suggestion-type-sinonimo';
                break;
            case 'marca':
                typeText = 'Marca';
                typeClass = 'suggestion-type-marca';
                break;
            case 'escritura':
                typeText = 'Escritura';
                typeClass = 'suggestion-type-escritura';
                break;
        }
        
        item.innerHTML = `
            <div class="suggestion-name">${suggestion.name}</div>
            <div class="suggestion-type ${typeClass}">${typeText}</div>
        `;
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
    const suggestion = appState.suggestions.find(s => s.key === key);
    if (suggestion) {
        elements.searchInput.value = suggestion.name;
        hideSuggestions();
        // Usar o ID da sugestão diretamente
        searchMedicationById(suggestion.id, suggestion.type);
    }
}

async function handleSearch() {
    const query = elements.searchInput.value.trim();
    if (!query) return;
    
    showLoading();
    hideSuggestions();
    
    try {
        // Buscar na API do e-lactancia.org
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://e-lactancia.org/megasearch/?query=${encodeURIComponent(query)}`)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error('Erro na API');
        }
        
        const data = await response.json();
        console.log('Resultados da API para "' + query + '":', data.length, 'total items');
        
        // Filtrar produtos, sinônimos e marcas relevantes
        const matches = data
            .filter(item => 
                item.term === 'producto' || 
                item.term === 'sinonimo' || 
                item.term === 'marca' ||
                item.term === 'escritura'
            )
            .slice(0, 20) // Mostrar até 20 resultados
            .map(item => ({
                id: item.id,
                name: item.nombre_en || item.nombre_es || item.nombre || item.nombre_paises,
                key: item.id.toString(),
                type: item.term
            }));
        
        console.log('Resultados filtrados:', matches.length);
        
        if (matches.length === 0) {
            showError('Nenhum medicamento encontrado. Tente buscar por outro nome.');
            return;
        }
        
        // Se houver apenas 1 resultado, buscar diretamente
        if (matches.length === 1) {
            const medication = matches[0];
            await searchMedicationById(medication.id, medication.type);
        } else {
            // Se houver múltiplos resultados, mostrar sugestões
            appState.suggestions = matches;
            showSuggestions(matches);
        }
        
    } catch (error) {
        console.error('Erro ao buscar medicamento:', error);
        showError('Erro ao buscar informações do medicamento. Tente novamente.');
    }
    
    hideLoading();
}

async function searchMedicationById(medicationId, termType) {
    showLoading();
    hideSuggestions();
    
    try {
        const key = medicationId.toString();
        let medication;
        
        // Verificar cache primeiro
        if (medicationCache.has(key)) {
            medication = medicationCache.get(key);
        } else {
            // Buscar detalhes completos do medicamento
            const details = await fetchMedicationDetails(medicationId, termType);
            
            if (details) {
                medication = {
                    name: details.name,
                    riskLevel: details.riskLevel,
                    riskText: details.riskText,
                    recommendation: details.recommendation,
                    sourceUrl: details.sourceUrl,
                    type: termType,
                    compatibility: details.compatibility
                };
            } else {
                // Fallback se não conseguir buscar detalhes
                medication = {
                    name: 'Medicamento',
                    riskLevel: 'unknown',
                    riskText: 'Informação não disponível',
                    recommendation: 'Para informações detalhadas sobre a compatibilidade com a amamentação, consulte a fonte original.',
                    sourceUrl: `${API_DETAIL_SEARCH_URL}${medicationId}&term_type=${termType}`,
                    type: termType
                };
            }
            
            // Salvar no cache
            medicationCache.set(key, medication);
            updateCacheButton();
        }
        
        // Adicionar ao histórico
        addToHistory(medication.name, key);
        
        // Mostrar resultados
        await showMedicationInfo(medication);
        
    } catch (error) {
        console.error('Erro ao buscar medicamento:', error);
        showError('Erro ao buscar informações do medicamento. Tente novamente.');
    }
    
    hideLoading();
}

async function searchMedication(key) {
    showLoading();
    hideSuggestions();
    
    try {
        let medication;
        
        // Verificar cache primeiro
        if (medicationCache.has(key)) {
            medication = medicationCache.get(key);
        } else {
            // Buscar na API do e-lactancia.org via proxy
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://e-lactancia.org/megasearch/?query=${encodeURIComponent(key)}`)}`;
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                throw new Error('Erro na API');
            }
            
            const data = await response.json();
            const apiMedication = data.find(item => 
                (item.term === 'producto' || item.term === 'sinonimo' || item.term === 'marca' || item.term === 'escritura') && 
                item.id.toString() === key
            );
            
            if (apiMedication) {
                // Buscar detalhes completos do medicamento
                const details = await fetchMedicationDetails(apiMedication.id, apiMedication.term);
                
                if (details) {
                    medication = {
                        name: details.name,
                        riskLevel: details.riskLevel,
                        riskText: details.riskText,
                        recommendation: details.recommendation,
                        sourceUrl: details.sourceUrl,
                        type: apiMedication.term,
                        compatibility: details.compatibility
                    };
                } else {
                    // Fallback se não conseguir buscar detalhes
                    medication = {
                        name: apiMedication.nombre_en || apiMedication.nombre_es || apiMedication.nombre || apiMedication.nombre_paises,
                        riskLevel: 'unknown',
                        riskText: 'Informação não disponível',
                        recommendation: 'Para informações detalhadas sobre a compatibilidade com a amamentação, consulte a fonte original.',
                        sourceUrl: `${API_DETAIL_SEARCH_URL}${apiMedication.id}&term_type=${apiMedication.term}`,
                        type: apiMedication.term
                    };
                }
                
                // Salvar no cache
                medicationCache.set(key, medication);
                updateCacheButton();
            } else {
                // Fallback para base local
                medication = fallbackDatabase[key];
                if (!medication) {
                    throw new Error('Medicamento não encontrado');
                }
            }
        }
        
        // Adicionar ao histórico
        addToHistory(medication.name, key);
        
        // Mostrar resultados
        await showMedicationInfo(medication);
        
    } catch (error) {
        console.error('Erro ao buscar medicamento:', error);
        showError('Erro ao buscar informações do medicamento. Tente novamente.');
    }
    
    hideLoading();
}

async function showMedicationInfo(medication) {
    // Traduzir informações se necessário
    const translatedMedication = await translateMedicationInfo(medication);
    
    const riskClass = `risk-${translatedMedication.riskLevel}`;
    
    // Definir tipo e cor baseado no term
    let typeText = 'Medicamento';
    let typeClass = 'suggestion-type-producto';
    
    if (translatedMedication.type) {
        switch(translatedMedication.type) {
            case 'producto':
                typeText = 'Medicamento';
                typeClass = 'suggestion-type-producto';
                break;
            case 'sinonimo':
                typeText = 'Sinônimo';
                typeClass = 'suggestion-type-sinonimo';
                break;
            case 'marca':
                typeText = 'Marca';
                typeClass = 'suggestion-type-marca';
                break;
            case 'escritura':
                typeText = 'Escritura';
                typeClass = 'suggestion-type-escritura';
                break;
        }
    }
    
    let compatibilityInfo = '';
    if (translatedMedication.compatibility) {
        compatibilityInfo = `
            <div class="compatibility-info" style="margin-bottom: 1rem;">
                <h4>Compatibilidade:</h4>
                <p><strong>${translatedMedication.compatibility}</strong></p>
            </div>
        `;
    }
    
    elements.medicationInfo.innerHTML = `
        <div class="medication-name">${translatedMedication.name}</div>
        <div class="medication-type ${typeClass}" style="margin-bottom: 1rem;">${typeText}</div>
        <div class="risk-level ${riskClass}">${translatedMedication.riskText}</div>
        ${compatibilityInfo}
        <div class="recommendation">
            <h4>Recomendação:</h4>
            <p>${translatedMedication.recommendation}</p>
        </div>
        <a href="${translatedMedication.sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15,3 21,3 21,9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Ver fonte original no e-lactancia.org
        </a>
        <div class="medication-actions" style="margin-top: 1rem;">
            <button class="btn btn-primary" onclick="addToFavorites('${translatedMedication.name}', '${translatedMedication.key || 'unknown'}')">
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
    // Verificar cache primeiro
    if (medicationCache.has(key)) {
        const medication = medicationCache.get(key);
        elements.searchInput.value = medication.name;
        searchMedication(key);
    } else {
        // Fallback para base local
        const medication = fallbackDatabase[key];
        if (medication) {
            elements.searchInput.value = medication.name;
            searchMedication(key);
        }
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
    // Verificar cache primeiro
    if (medicationCache.has(key)) {
        const medication = medicationCache.get(key);
        elements.searchInput.value = medication.name;
        searchMedication(key);
    } else {
        // Fallback para base local
        const medication = fallbackDatabase[key];
        if (medication) {
            elements.searchInput.value = medication.name;
            searchMedication(key);
        }
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

// Função para buscar detalhes do medicamento
async function fetchMedicationDetails(termId, termType) {
    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`${API_DETAIL_SEARCH_URL}${termId}&term_type=${termType}`)}`;
        console.log('Buscando detalhes para:', termId, termType);
        console.log('URL:', proxyUrl);
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error('Erro ao buscar detalhes');
        }
        
        const html = await response.text();
        console.log('HTML recebido:', html.substring(0, 500) + '...');
        return parseMedicationDetails(html, termId, termType);
        
    } catch (error) {
        console.error('Erro ao buscar detalhes do medicamento:', error);
        return null;
    }
}

function parseMedicationDetails(html, termId, termType) {
    console.log('Iniciando parsing do HTML...');
    
    // Criar um elemento temporário para parsear o HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Buscar o nome do medicamento - tentar diferentes seletores
    let medicationName = 'Medicamento';
    
    // Tentar buscar por h1 primeiro (como no exemplo do Dipiron)
    const h1Element = doc.querySelector('h1.term-header');
    if (h1Element) {
        medicationName = h1Element.textContent.trim();
        console.log('Nome encontrado via h1.term-header:', medicationName);
    } else {
        // Fallback para h1 genérico
        const h1Generic = doc.querySelector('h1');
        if (h1Generic) {
            medicationName = h1Generic.textContent.trim();
            console.log('Nome encontrado via h1 genérico:', medicationName);
        } else {
            // Tentar buscar após "small last-update"
            const lastUpdateElement = doc.querySelector('.small.last-update');
            if (lastUpdateElement) {
                const nextElement = lastUpdateElement.nextElementSibling;
                if (nextElement) {
                    medicationName = nextElement.textContent.trim();
                    console.log('Nome encontrado via last-update:', medicationName);
                }
            }
        }
    }
    
    // Buscar informações de compatibilidade - dentro da box risk-level
    let compatibility = 'Informação não disponível';
    let riskLevel = 'unknown';
    let riskText = 'Informação não disponível';
    
    // Buscar por box com classe que contém "risk-level" (mais flexível)
    const riskBox = doc.querySelector('.box.grey-box.squared[class*="risk-level"]');
    if (riskBox) {
        console.log('Box de risco encontrada:', riskBox.className);
        
        // Buscar h4 dentro da box de risco
        const h4Element = riskBox.querySelector('h4');
        if (h4Element) {
            compatibility = h4Element.textContent.trim();
            console.log('Compatibilidade encontrada via h4:', compatibility);
        }
        
        // Determinar nível de risco baseado na classe CSS
        const classList = Array.from(riskBox.classList);
        const riskClass = classList.find(cls => cls.startsWith('risk-level'));
        
        if (riskClass) {
            const riskNumber = riskClass.replace('risk-level', '');
            switch(riskNumber) {
                case '0':
                    riskLevel = 'very-low';
                    riskText = 'Muito Baixo Risco';
                    break;
                case '1':
                    riskLevel = 'low';
                    riskText = 'Baixo Risco';
                    break;
                case '2':
                    riskLevel = 'moderate';
                    riskText = 'Risco Moderado';
                    break;
                case '3':
                    riskLevel = 'high';
                    riskText = 'Alto Risco';
                    break;
                default:
                    riskLevel = 'unknown';
                    riskText = 'Informação não disponível';
            }
            console.log('Nível de risco detectado:', riskNumber, '->', riskText);
        }
    } else {
        console.log('Box de risco não encontrada, tentando seletores alternativos...');
        
        // Fallback: buscar por qualquer div com risk-level
        const fallbackRiskBox = doc.querySelector('[class*="risk-level"]');
        if (fallbackRiskBox) {
            console.log('Box de risco encontrada via fallback:', fallbackRiskBox.className);
            
            const h4Element = fallbackRiskBox.querySelector('h4');
            if (h4Element) {
                compatibility = h4Element.textContent.trim();
                console.log('Compatibilidade encontrada via fallback h4:', compatibility);
            }
        }
    }
    
    // Buscar descrição/recomendação - dentro da box risk-comment-level
    let recommendation = 'Para informações detalhadas sobre a compatibilidade com a amamentação, consulte a fonte original.';
    
    // Buscar por box com classe que contém "risk-comment-level" (mais flexível)
    const commentBox = doc.querySelector('.box.grey-box.squared[class*="risk-comment-level"]');
    if (commentBox) {
        console.log('Box de comentários encontrada:', commentBox.className);
        
        // Buscar todos os parágrafos dentro da box de comentários
        const paragraphs = commentBox.querySelectorAll('p');
        if (paragraphs.length > 0) {
            // Concatenar todos os parágrafos
            const allTexts = Array.from(paragraphs).map(p => p.textContent.trim()).filter(text => text.length > 0);
            recommendation = allTexts.join('\n\n');
            console.log('Recomendação encontrada via risk-comment-level:', recommendation.substring(0, 200) + '...');
            console.log('Número de parágrafos encontrados:', paragraphs.length);
        }
    } else {
        console.log('Box de comentários não encontrada, tentando seletores alternativos...');
        
        // Fallback: buscar por qualquer div com risk-comment-level
        const fallbackCommentBox = doc.querySelector('[class*="risk-comment-level"]');
        if (fallbackCommentBox) {
            console.log('Box de comentários encontrada via fallback:', fallbackCommentBox.className);
            
            const paragraphs = fallbackCommentBox.querySelectorAll('p');
            if (paragraphs.length > 0) {
                const allTexts = Array.from(paragraphs).map(p => p.textContent.trim()).filter(text => text.length > 0);
                recommendation = allTexts.join('\n\n');
                console.log('Recomendação encontrada via fallback:', recommendation.substring(0, 200) + '...');
                console.log('Número de parágrafos encontrados via fallback:', paragraphs.length);
            }
        } else {
            // Fallback final para busca genérica
            const paragraphs = doc.querySelectorAll('p');
            for (let p of paragraphs) {
                const text = p.textContent.trim();
                if (text.length > 50 && (text.toLowerCase().includes('lactancia') || text.toLowerCase().includes('leche') || text.toLowerCase().includes('breastfeeding'))) {
                    recommendation = text;
                    console.log('Recomendação encontrada via parágrafo genérico:', text.substring(0, 100) + '...');
                    break;
                }
            }
        }
    }
    
    const result = {
        name: medicationName,
        compatibility: compatibility,
        riskLevel: riskLevel,
        riskText: riskText,
        recommendation: recommendation,
        sourceUrl: `${API_DETAIL_SEARCH_URL}${termId}&term_type=${termType}`
    };
    
    console.log('Resultado do parsing:', result);
    return result;
}

// Funções de gerenciamento de cache
function clearCache() {
    if (confirm('Tem certeza que deseja limpar todo o cache de medicamentos?')) {
        medicationCache.clear();
        updateCacheButton();
        console.log('Cache limpo com sucesso');
    }
}

function showCache() {
    const cacheSize = medicationCache.size;
    const cacheItems = Array.from(medicationCache.entries()).map(([key, value]) => ({
        key,
        name: value.name
    }));
    
    if (cacheSize === 0) {
        alert('Cache vazio. Nenhum medicamento foi consultado ainda.');
        return;
    }
    
    const cacheList = cacheItems.map(item => `• ${item.name}`).join('\n');
    alert(`Cache atual (${cacheSize} medicamentos):\n\n${cacheList}`);
}

function refreshSuggestions() {
    const query = elements.searchInput.value.trim();
    if (query.length >= 2) {
        // Forçar nova busca ignorando cache
        searchSuggestionsDynamic(query);
    } else {
        alert('Digite pelo menos 2 caracteres para buscar.');
    }
}

function updateCacheButton() {
    const cacheSize = medicationCache.size;
    elements.showCache.textContent = `📋 Ver Cache (${cacheSize})`;
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