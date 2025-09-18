// Estado da aplicação
const appState = {
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
    medicationInfo: document.getElementById('medicationInfo')
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
    
    // Traduzir alternativas se estiverem em inglês
    if (medication.alternatives && medication.alternatives.length > 0) {
        console.log('Traduzindo alternativas:', medication.alternatives.length, 'itens');
        translated.alternatives = [];
        
        for (const alt of medication.alternatives) {
            const translatedAlt = { ...alt };
            
            // Traduzir descrição se estiver em inglês
            if (alt.description && isEnglish(alt.description)) {
                console.log('Traduzindo descrição da alternativa:', alt.name);
                translatedAlt.description = await translateText(alt.description);
            }
            
            translated.alternatives.push(translatedAlt);
        }
        
        console.log('Alternativas traduzidas:', translated.alternatives.length, 'itens');
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
        sourceUrl: 'https://e-lactancia.org/breastfeeding/paracetamol/product/',
        alternatives: [
            {
                name: 'Nenhuma alternativa disponível',
                url: null,
                description: 'Não temos alternativas para Paracetamol pois é relativamente seguro.'
            }
        ]
    },
    'ibuprofeno': {
        name: 'Ibuprofeno',
        riskLevel: 'very-low',
        riskText: 'Muito Baixo Risco',
        recommendation: 'Ibuprofeno é seguro durante a amamentação. Menos de 0.1% da dose materna é excretada no leite materno. Pode ser usado para dor e inflamação.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/ibuprofen/product/',
        alternatives: [
            {
                name: 'Nenhuma alternativa disponível',
                url: null,
                description: 'Não temos alternativas para Ibuprofeno pois é relativamente seguro.'
            }
        ]
    },
    'dipirona': {
        name: 'Dipirona (Metamizol)',
        riskLevel: 'moderate',
        riskText: 'Risco Moderado',
        recommendation: 'Dipirona deve ser usada com cautela. Pode causar agranulocitose rara mas grave. Use apenas sob orientação médica e por curto período.',
        sourceUrl: 'https://e-lactancia.org/breastfeeding/metamizole/product/',
        alternatives: [
            {
                name: 'Ibuprofeno',
                url: '/breastfeeding/ibuprofen/product/',
                description: 'Produto seguro e/ou amamentação é a melhor opção.'
            },
            {
                name: 'Paracetamol',
                url: '/breastfeeding/paracetamol/product/',
                description: 'Produto seguro e/ou amamentação é a melhor opção.'
            }
        ]
    }
};

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    // Configurar autocompletar
    setupAutocomplete();
}

function setupEventListeners() {
    // Busca
    elements.searchButton.addEventListener('click', handleSearch);
    elements.searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    
    // Fechar sugestões ao clicar fora
    document.addEventListener('click', function(e) {
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer && !searchContainer.contains(e.target)) {
            hideSuggestions();
        }
    });
}

// Variável para controlar o debounce
let searchTimeout;

function setupAutocomplete() {
    elements.searchInput.addEventListener('input', function(e) {
        const query = e.target.value.trim();
        appState.currentSearch = query;
        
        // Limpar timeout anterior se existir
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // Se a query tem menos de 3 caracteres, limpar sugestões
        if (query.length < 3) {
            hideSuggestions();
            return;
        }
        
        // Implementar debounce de 300ms para evitar muitas requisições
        searchTimeout = setTimeout(() => {
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


async function searchSuggestions(query) {
    try {
        // Buscar na API do e-lactancia.org via proxy
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://e-lactancia.org/megasearch/?query=${encodeURIComponent(query)}`)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error('Erro na API');
        }
        
        const data = await response.json();
        
        // Filtrar produtos, sinônimos e marcas relevantes
        const filteredData = data.filter(item => 
            item.term === 'producto' || 
            item.term === 'sinonimo' || 
            item.term === 'marca' ||
            item.term === 'escritura'
        );
        
        // Mapear e ordenar alfabeticamente por nome
        const matches = filteredData
            .map(item => ({
                id: item.id,
                name: item.nombre_en || item.nombre_es || item.nombre || item.nombre_paises,
                key: item.id.toString(),
                type: item.term
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    
        appState.suggestions = matches;
        showSuggestions(matches);
        
    } catch (error) {
        console.error('Erro ao buscar sugestões:', error);
        // Não mostrar erro para sugestões, apenas limpar
        hideSuggestions();
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
                    compatibility: details.compatibility,
                    alternatives: details.alternatives || []
                };
            } else {
                // Fallback se não conseguir buscar detalhes
                medication = {
                    name: 'Medicamento',
                    riskLevel: 'unknown',
                    riskText: 'Informação não disponível',
                    recommendation: 'Para informações detalhadas sobre a compatibilidade com a amamentação, consulte a fonte original.',
                    sourceUrl: `${API_DETAIL_SEARCH_URL}${medicationId}&term_type=${termType}`,
                    type: termType,
                    alternatives: []
                };
            }
            
            // Salvar no cache
            medicationCache.set(key, medication);
        }
    
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
                        compatibility: details.compatibility,
                        alternatives: details.alternatives || []
                    };
                } else {
                    // Fallback se não conseguir buscar detalhes
                    medication = {
                        name: apiMedication.nombre_en || apiMedication.nombre_es || apiMedication.nombre || apiMedication.nombre_paises,
                        riskLevel: 'unknown',
                        riskText: 'Informação não disponível',
                        recommendation: 'Para informações detalhadas sobre a compatibilidade com a amamentação, consulte a fonte original.',
                        sourceUrl: `${API_DETAIL_SEARCH_URL}${apiMedication.id}&term_type=${apiMedication.term}`,
                        type: apiMedication.term,
                        alternatives: []
                    };
                }
                
                // Salvar no cache
                medicationCache.set(key, medication);
            } else {
                // Fallback para base local
                medication = fallbackDatabase[key];
                if (!medication) {
                    throw new Error('Medicamento não encontrado');
                }
            }
        }
        
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
    
    console.log('Medicamento completo para exibição:', translatedMedication);
    console.log('Alternativas do medicamento:', translatedMedication.alternatives);
    
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
    
    // Construir seção de alternativas
    let alternativesInfo = '';
    console.log('Verificando alternativas:', translatedMedication.alternatives);
    
    if (translatedMedication.alternatives && translatedMedication.alternatives.length > 0) {
        const alternatives = translatedMedication.alternatives;
        console.log('Alternativas encontradas:', alternatives);
        
        if (alternatives.length === 1 && alternatives[0].name === 'Nenhuma alternativa disponível') {
            // Caso sem alternativas
            console.log('Exibindo mensagem de sem alternativas');
            alternativesInfo = `
                <div class="alternatives" style="margin-bottom: 1rem;">
                    <h4>Alternativas:</h4>
                    <p>${alternatives[0].description}</p>
                </div>
            `;
        } else {
            // Caso com alternativas
            console.log('Exibindo lista de alternativas');
            const alternativesList = alternatives.map(alt => {
                if (alt.url) {
                    return `<li><a href="#" onclick="searchAlternative('${alt.name}'); return false;" class="alternative-link">${alt.name}</a> (${alt.description})</li>`;
                } else {
                    return `<li>${alt.name} (${alt.description})</li>`;
                }
            }).join('');
            
            alternativesInfo = `
                <div class="alternatives" style="margin-bottom: 1rem;">
                    <h4>Alternativas:</h4>
                    <ul class="alternatives-list">
                        ${alternativesList}
                    </ul>
                </div>
            `;
        }
    } else {
        console.log('Nenhuma alternativa encontrada');
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
        ${alternativesInfo}
        <a href="${translatedMedication.sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15,3 21,3 21,9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Ver fonte original no e-lactancia.org
        </a>
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
    
    // Buscar alternativas - dentro da box risk-alt
    let alternatives = [];
    
    console.log('Buscando box de alternativas...');
    // Tentar diferentes seletores para encontrar a box de alternativas
    let alternativesBox = doc.querySelector('.box.grey-box.squared.risk-alt');
    
    if (!alternativesBox) {
        // Tentar seletor mais genérico
        alternativesBox = doc.querySelector('[class*="risk-alt"]');
        console.log('Tentando seletor genérico:', alternativesBox);
    }
    
    if (!alternativesBox) {
        // Tentar buscar por texto "Alternatives"
        const allDivs = doc.querySelectorAll('div');
        for (let div of allDivs) {
            if (div.textContent.includes('Alternatives') && div.querySelector('h3')) {
                alternativesBox = div;
                console.log('Encontrado por texto "Alternatives":', div.className);
                break;
            }
        }
    }
    
    if (alternativesBox) {
        console.log('Box de alternativas encontrada:', alternativesBox.className);
        console.log('Conteúdo da box:', alternativesBox.innerHTML.substring(0, 200) + '...');
        
        // Verificar se há lista de alternativas
        const alternativesList = alternativesBox.querySelector('ul');
        if (alternativesList) {
            console.log('Lista de alternativas encontrada');
            const listItems = alternativesList.querySelectorAll('li');
            console.log('Número de itens na lista:', listItems.length);
            
            listItems.forEach((li, index) => {
                console.log(`Processando item ${index + 1}:`, li.textContent.trim());
                const link = li.querySelector('a');
                if (link) {
                    const name = link.textContent.trim();
                    const href = link.getAttribute('href');
                    const description = li.textContent.replace(name, '').trim().replace(/^[()]|[()]$/g, '').trim();
                    
                    console.log(`Alternativa ${index + 1}:`, { name, href, description });
                    
                    alternatives.push({
                        name: name,
                        url: href,
                        description: description
                    });
                }
            });
            
            console.log('Alternativas encontradas:', alternatives.length);
        } else {
            // Verificar se há mensagem de "não há alternativas"
            const noAlternativesText = alternativesBox.querySelector('p');
            if (noAlternativesText) {
                console.log('Mensagem de "não há alternativas" encontrada');
                const text = noAlternativesText.textContent.trim();
                console.log('Texto da mensagem:', text);
                alternatives.push({
                    name: 'Nenhuma alternativa disponível',
                    url: null,
                    description: text
                });
            } else {
                console.log('Nenhum conteúdo encontrado na box de alternativas');
            }
        }
    } else {
        console.log('Box de alternativas não encontrada');
        // Tentar buscar por seletores alternativos
        const altBoxes = doc.querySelectorAll('[class*="risk-alt"]');
        console.log('Boxes com "risk-alt" encontradas:', altBoxes.length);
        altBoxes.forEach((box, index) => {
            console.log(`Box ${index + 1}:`, box.className, box.textContent.substring(0, 100));
        });
    }
    
    const result = {
        name: medicationName,
        compatibility: compatibility,
        riskLevel: riskLevel,
        riskText: riskText,
        recommendation: recommendation,
        alternatives: alternatives,
        sourceUrl: `${API_DETAIL_SEARCH_URL}${termId}&term_type=${termType}`
    };
    
    console.log('Resultado do parsing:', result);
    return result;
}

// Função para buscar alternativa
function searchAlternative(medicationName) {
    console.log('Buscando alternativa:', medicationName);
    
    // Limpar campo de busca e definir o valor
    elements.searchInput.value = medicationName;
    
    // Limpar sugestões e resultados anteriores
    hideSuggestions();
    elements.results.classList.add('hidden');
    
    // Fazer a busca
    handleSearch();
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