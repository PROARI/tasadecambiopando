// ==========================================================================
// STATE MANAGEMENT & CONSTANTS
// ==========================================================================

const DEFAULT_RATES = {
    USD: {
        official: { buy: 6.86, sell: 6.96 },
        referential: { buy: 11.50, sell: 11.85 }
    },
    BRL: {
        official: { buy: 1.25, sell: 1.28 },
        referential: { buy: 2.10, sell: 2.25 }
    },
    PEN: {
        official: { buy: 1.83, sell: 1.86 },
        referential: { buy: 2.90, sell: 3.10 }
    }
};

let currentRates = {};

// Load rates from localStorage or fall back to defaults
function loadRates() {
    const saved = localStorage.getItem('bolivia_cambio_rates');
    if (saved) {
        try {
            currentRates = JSON.parse(saved);
        } catch (e) {
            console.error('Error parsing rates from localStorage. Using defaults.', e);
            currentRates = JSON.parse(JSON.stringify(DEFAULT_RATES));
        }
    } else {
        currentRates = JSON.parse(JSON.stringify(DEFAULT_RATES));
    }
}

// Save current rates to localStorage
function saveRates() {
    localStorage.setItem('bolivia_cambio_rates', JSON.stringify(currentRates));
}

// Reset rates to default
function resetRatesToDefault() {
    currentRates = JSON.parse(JSON.stringify(DEFAULT_RATES));
    saveRates();
    updateUI();
    showToast('Tasas restauradas a los valores predeterminados.');
}

// ==========================================================================
// DATE & CLOCK UTIL
// ==========================================================================

function startClock() {
    const clockEl = document.getElementById('current-time');
    
    function updateClock() {
        const now = new Date();
        const options = { 
            timeZone: 'America/La_Paz',
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('es-BO', options);
        clockEl.textContent = formatter.format(now).replace(',', ' -');
    }
    
    updateClock();
    setInterval(updateClock, 1000);
}

// ==========================================================================
// THEME SWITCHER
// ==========================================================================

function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

// ==========================================================================
// NOTIFICATION TOAST
// ==========================================================================

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    toastMsg.textContent = message;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// ==========================================================================
// SVG CHART GENERATOR (REACTIVE & INTERACTIVE)
// ==========================================================================

let activeChartCurrency = 'USD';

// Generate simulated historical rates based on the current rates to look realistic
function generateHistoryData(currencyCode) {
    const rate = currentRates[currencyCode];
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    
    // We want the last day (Dom/index 6) to match the current rates
    const offRefVal = rate.official.sell;
    const refRefVal = rate.referential.sell;
    
    // Simple mock offsets to create a beautiful trending line ending at the current rates
    // BRL, USD, PEN have different scales
    const scale = currencyCode === 'USD' ? 0.12 : currencyCode === 'BRL' ? 0.05 : 0.08;
    
    const history = [];
    for (let i = 0; i < 7; i++) {
        // Create dynamic offset. E.g. a small upward trend
        const dayFactor = (i - 6) * 0.03; 
        const wave = Math.sin(i * 1.2) * scale * 0.4;
        
        const officialVal = offRefVal + (dayFactor * scale * 0.1) + wave * 0.1;
        const referentialVal = refRefVal + (dayFactor * scale) + wave;
        
        history.push({
            day: days[i],
            // Ensure the final element matches the exact current rate
            official: i === 6 ? offRefVal : parseFloat(officialVal.toFixed(2)),
            referential: i === 6 ? refRefVal : parseFloat(referentialVal.toFixed(2))
        });
    }
    return history;
}

function drawChart(currencyCode) {
    const container = document.getElementById('trend-chart-container');
    const svg = document.getElementById('trend-svg');
    const tooltip = document.getElementById('chart-tooltip');
    
    if (!svg) return;
    
    // Clear previous elements (except definitions if any)
    svg.innerHTML = '';
    
    const data = generateHistoryData(currencyCode);
    
    // Chart dimensions (from viewBox: 0 0 500 220)
    const width = 500;
    const height = 220;
    const padding = { top: 25, right: 35, bottom: 30, left: 45 };
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Find min and max for chart scale
    const allVals = data.flatMap(d => [d.official, d.referential]);
    const minVal = Math.min(...allVals) * 0.95;
    const maxVal = Math.max(...allVals) * 1.05;
    const valRange = maxVal - minVal;
    
    // Coordinate mapping functions
    const getX = (index) => padding.left + (index / 6) * chartWidth;
    const getY = (val) => padding.top + chartHeight - ((val - minVal) / valRange) * chartHeight;
    
    // 1. Add Gradients Definitions
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Gradient for referential area
    const refGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    refGrad.setAttribute('id', 'ref-grad');
    refGrad.setAttribute('x1', '0');
    refGrad.setAttribute('y1', '0');
    refGrad.setAttribute('x2', '0');
    refGrad.setAttribute('y2', '1');
    refGrad.innerHTML = `
        <stop offset="0%" stop-color="var(--color-success)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="var(--color-success)" stop-opacity="0.0"/>
    `;
    
    // Gradient for official area
    const offGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    offGrad.setAttribute('id', 'off-grad');
    offGrad.setAttribute('x1', '0');
    offGrad.setAttribute('y1', '0');
    offGrad.setAttribute('x2', '0');
    offGrad.setAttribute('y2', '1');
    offGrad.innerHTML = `
        <stop offset="0%" stop-color="var(--accent-color)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="var(--accent-color)" stop-opacity="0.0"/>
    `;
    
    defs.appendChild(refGrad);
    defs.appendChild(offGrad);
    svg.appendChild(defs);
    
    // 2. Draw Grid Lines & Y-Axis Labels
    const gridTicks = 4;
    for (let i = 0; i <= gridTicks; i++) {
        const ratio = i / gridTicks;
        const val = minVal + ratio * valRange;
        const y = getY(val);
        
        // Line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padding.left);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width - padding.right);
        line.setAttribute('y2', y);
        line.setAttribute('class', 'grid-line');
        svg.appendChild(line);
        
        // Text label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', padding.left - 8);
        text.setAttribute('y', y + 3);
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('class', 'chart-axis-text');
        text.textContent = val.toFixed(2);
        svg.appendChild(text);
    }
    
    // 3. Draw X-Axis Labels
    data.forEach((d, i) => {
        const x = getX(i);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', height - padding.bottom + 18);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'chart-axis-text');
        text.textContent = d.day;
        svg.appendChild(text);
    });
    
    // 4. Draw Lines and Area Paths
    let refPathCoords = '';
    let offPathCoords = '';
    
    data.forEach((d, i) => {
        const x = getX(i);
        const yRef = getY(d.referential);
        const yOff = getY(d.official);
        
        if (i === 0) {
            refPathCoords = `M ${x} ${yRef}`;
            offPathCoords = `M ${x} ${yOff}`;
        } else {
            refPathCoords += ` L ${x} ${yRef}`;
            offPathCoords += ` L ${x} ${yOff}`;
        }
    });
    
    // Draw Area under Referential
    const refArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const refAreaCoords = `${refPathCoords} L ${getX(6)} ${height - padding.bottom} L ${getX(0)} ${height - padding.bottom} Z`;
    refArea.setAttribute('d', refAreaCoords);
    refArea.setAttribute('class', 'chart-area-ref');
    svg.appendChild(refArea);
    
    // Draw Area under Official
    const offArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const offAreaCoords = `${offPathCoords} L ${getX(6)} ${height - padding.bottom} L ${getX(0)} ${height - padding.bottom} Z`;
    offArea.setAttribute('d', offAreaCoords);
    offArea.setAttribute('class', 'chart-area-off');
    svg.appendChild(offArea);
    
    // Draw Referential Line
    const refLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    refLine.setAttribute('d', refPathCoords);
    refLine.setAttribute('class', 'chart-line-ref');
    svg.appendChild(refLine);
    
    // Draw Official Line
    const offLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    offLine.setAttribute('d', offPathCoords);
    offLine.setAttribute('class', 'chart-line-off');
    svg.appendChild(offLine);
    
    // 5. Draw interactive hover points
    data.forEach((d, i) => {
        const x = getX(i);
        const yRef = getY(d.referential);
        const yOff = getY(d.official);
        
        // Referential point
        const ptRef = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ptRef.setAttribute('cx', x);
        ptRef.setAttribute('cy', yRef);
        ptRef.setAttribute('r', '4');
        ptRef.setAttribute('fill', 'var(--color-success)');
        ptRef.setAttribute('stroke', 'var(--bg-primary)');
        ptRef.setAttribute('stroke-width', '1.5');
        ptRef.setAttribute('class', 'chart-point');
        setupTooltipEvents(ptRef, d.day, 'Referencial', d.referential, container, tooltip);
        svg.appendChild(ptRef);
        
        // Official point
        const ptOff = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ptOff.setAttribute('cx', x);
        ptOff.setAttribute('cy', yOff);
        ptOff.setAttribute('r', '4');
        ptOff.setAttribute('fill', 'var(--accent-color)');
        ptOff.setAttribute('stroke', 'var(--bg-primary)');
        ptOff.setAttribute('stroke-width', '1.5');
        ptOff.setAttribute('class', 'chart-point');
        setupTooltipEvents(ptOff, d.day, 'Oficial', d.official, container, tooltip);
        svg.appendChild(ptOff);
    });
}

function setupTooltipEvents(element, day, type, value, container, tooltip) {
    element.addEventListener('mouseenter', (e) => {
        tooltip.innerHTML = `<strong>${day}</strong><br>${type}: <span style="color: ${type === 'Oficial' ? 'var(--accent-color)' : 'var(--color-success)'};">${value.toFixed(2)} Bs.</span>`;
        tooltip.style.opacity = '1';
        
        // Get mouse position relative to container
        const rect = container.getBoundingClientRect();
        const ptX = e.clientX - rect.left;
        const ptY = e.clientY - rect.top;
        
        tooltip.style.transform = `translate(${ptX - 50}px, ${ptY - 55}px)`;
    });
    
    element.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const ptX = e.clientX - rect.left;
        const ptY = e.clientY - rect.top;
        tooltip.style.transform = `translate(${ptX - 50}px, ${ptY - 55}px)`;
    });
    
    element.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
    });
}

function initChartTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            activeChartCurrency = tab.getAttribute('data-chart-curr');
            drawChart(activeChartCurrency);
        });
    });
}

// ==========================================================================
// RENDER CARDS & CORE UI
// ==========================================================================

function updateUI() {
    // USD
    document.getElementById('usd-off-buy').textContent = currentRates.USD.official.buy.toFixed(2);
    document.getElementById('usd-off-sell').textContent = currentRates.USD.official.sell.toFixed(2);
    document.getElementById('usd-ref-buy').textContent = currentRates.USD.referential.buy.toFixed(2);
    document.getElementById('usd-ref-sell').textContent = currentRates.USD.referential.sell.toFixed(2);
    
    // BRL
    document.getElementById('brl-off-buy').textContent = currentRates.BRL.official.buy.toFixed(2);
    document.getElementById('brl-off-sell').textContent = currentRates.BRL.official.sell.toFixed(2);
    document.getElementById('brl-ref-buy').textContent = currentRates.BRL.referential.buy.toFixed(2);
    document.getElementById('brl-ref-sell').textContent = currentRates.BRL.referential.sell.toFixed(2);
    
    // PEN
    document.getElementById('pen-off-buy').textContent = currentRates.PEN.official.buy.toFixed(2);
    document.getElementById('pen-off-sell').textContent = currentRates.PEN.official.sell.toFixed(2);
    document.getElementById('pen-ref-buy').textContent = currentRates.PEN.referential.buy.toFixed(2);
    document.getElementById('pen-ref-sell').textContent = currentRates.PEN.referential.sell.toFixed(2);
    
    // Calculate and display gap/brecha percentages based on Venta
    calculateGap('USD', 'gap-usd');
    calculateGap('BRL', 'gap-brl');
    calculateGap('PEN', 'gap-pen');
    
    // Update Calculator outputs and active chart
    calculateExchange();
    drawChart(activeChartCurrency);
}

function calculateGap(currencyCode, elementId) {
    const offSell = currentRates[currencyCode].official.sell;
    const refSell = currentRates[currencyCode].referential.sell;
    const gapPct = ((refSell - offSell) / offSell) * 100;
    
    const el = document.getElementById(elementId);
    el.textContent = `+${gapPct.toFixed(1)}% brecha`;
}

// ==========================================================================
// CALCULATOR CONTROLLER
// ==========================================================================

let calcState = {
    operation: 'buy', // 'buy' (Comprar Divisa) vs 'sell' (Vender Divisa)
    rateType: 'referential', // 'referential' vs 'official'
    sourceCurrency: 'BOB',
    targetCurrency: 'USD'
};

function initCalculator() {
    const btnBuy = document.getElementById('btn-buy');
    const btnSell = document.getElementById('btn-sell');
    const pillRef = document.getElementById('pill-ref');
    const pillOff = document.getElementById('pill-off');
    const amountInput = document.getElementById('amount-input');
    const currencySelect = document.getElementById('currency-select');
    const targetSelect = document.getElementById('target-currency-select');
    const targetField = document.getElementById('target-currency-field');

    // 1. Operation Switch (Comprar vs Vender)
    btnBuy.addEventListener('click', () => {
        btnBuy.classList.add('active');
        btnSell.classList.remove('active');
        calcState.operation = 'buy';
        
        // Auto arrange inputs for purchase mode (User buys foreign with BOB)
        // Source currency = BOB, Target currency = foreign
        calcState.sourceCurrency = 'BOB';
        currencySelect.value = 'BOB';
        currencySelect.disabled = true; // fixed source in simplified buying mode
        
        targetField.style.display = 'flex';
        calcState.targetCurrency = targetSelect.value;
        
        calculateExchange();
    });

    btnSell.addEventListener('click', () => {
        btnSell.classList.add('active');
        btnBuy.classList.remove('active');
        calcState.operation = 'sell';
        
        // Auto arrange inputs for selling mode (User sells foreign for BOB)
        // Source currency = Foreign, Target currency = BOB
        currencySelect.disabled = false;
        if (currencySelect.value === 'BOB') {
            currencySelect.value = 'USD';
            calcState.sourceCurrency = 'USD';
        } else {
            calcState.sourceCurrency = currencySelect.value;
        }
        
        targetField.style.display = 'none'; // target is implicitly BOB
        calcState.targetCurrency = 'BOB';
        
        calculateExchange();
    });

    // Disable primary currency select initially because default operation is "buy" (BOB to foreign)
    currencySelect.value = 'BOB';
    currencySelect.disabled = true;

    // 2. Rate Type Switch (Oficial vs Referencial)
    pillRef.addEventListener('click', () => {
        pillRef.classList.add('active');
        pillOff.classList.remove('active');
        calcState.rateType = 'referential';
        calculateExchange();
    });

    pillOff.addEventListener('click', () => {
        pillOff.classList.add('active');
        pillRef.classList.remove('active');
        calcState.rateType = 'official';
        calculateExchange();
    });

    // 3. Amount input handler
    amountInput.addEventListener('input', calculateExchange);
    amountInput.addEventListener('change', () => {
        if (amountInput.value < 0 || isNaN(parseFloat(amountInput.value))) {
            amountInput.value = 0;
        }
        calculateExchange();
    });

    // 4. Source Currency Dropdown (Only dynamic in Selling mode)
    currencySelect.addEventListener('change', () => {
        calcState.sourceCurrency = currencySelect.value;
        calculateExchange();
    });

    // 5. Target Currency Dropdown (Only visible in Buying mode)
    targetSelect.addEventListener('change', () => {
        calcState.targetCurrency = targetSelect.value;
        calculateExchange();
    });
}

function calculateExchange() {
    const amountInput = document.getElementById('amount-input');
    const resultText = document.getElementById('calc-result-text');
    const detailsText = document.getElementById('calc-details-text');
    
    let amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount < 0) {
        resultText.textContent = '--.--';
        detailsText.textContent = 'Ingrese un monto válido';
        return;
    }

    const op = calcState.operation;
    const rateType = calcState.rateType;
    
    if (op === 'buy') {
        // BOB to Foreign
        // The house sells foreign currency to the user. We use VENTA rate.
        const target = calcState.targetCurrency; // USD, BRL, or PEN
        const rateObj = currentRates[target][rateType];
        const exchangeRate = rateObj.sell; 
        
        const result = amount / exchangeRate;
        
        resultText.textContent = `${result.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${target}`;
        detailsText.textContent = `Tasa de Venta aplicada: 1 ${target} = ${exchangeRate.toFixed(2)} BOB`;
    } else {
        // Foreign to BOB
        // The house buys foreign currency from the user. We use COMPRA rate.
        const source = calcState.sourceCurrency; // USD, BRL, or PEN
        if (source === 'BOB') {
            resultText.textContent = `${amount.toFixed(2)} BOB`;
            detailsText.textContent = 'Misma divisa';
            return;
        }
        
        const rateObj = currentRates[source][rateType];
        const exchangeRate = rateObj.buy;
        
        const result = amount * exchangeRate;
        
        resultText.textContent = `${result.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BOB`;
        detailsText.textContent = `Tasa de Compra aplicada: 1 ${source} = ${exchangeRate.toFixed(2)} BOB`;
    }
}

// ==========================================================================
// CONFIGURATION DRAWER CONTROL & FORM SUBMIT
// ==========================================================================

// ==========================================================================
// CONFIGURATION DRAWER CONTROL, AUTHENTICATION & FORM SUBMIT
// ==========================================================================

let isAuthenticated = sessionStorage.getItem('proari_authenticated') === 'true';

function initDrawer() {
    const configToggle = document.getElementById('config-toggle');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const configDrawer = document.getElementById('config-drawer');
    const drawerClose = document.getElementById('drawer-close');
    const ratesForm = document.getElementById('rates-form');
    const resetBtn = document.getElementById('btn-reset-rates');

    // Auth Elements
    const loginSection = document.getElementById('login-section');
    const editorSection = document.getElementById('editor-section');
    const loginForm = document.getElementById('login-form');
    const loginUser = document.getElementById('login-username');
    const loginPass = document.getElementById('login-password');
    const loginError = document.getElementById('login-error-msg');
    const btnLogout = document.getElementById('btn-logout');

    function openDrawer() {
        if (isAuthenticated) {
            loginSection.style.display = 'none';
            editorSection.style.display = 'block';
            populateDrawerInputs();
        } else {
            loginSection.style.display = 'block';
            editorSection.style.display = 'none';
            loginError.style.display = 'none';
            loginUser.value = '';
            loginPass.value = '';
        }
        
        configDrawer.classList.add('open');
        drawerOverlay.classList.add('open');
        configDrawer.setAttribute('aria-hidden', 'false');
        
        // Auto-focus username if not logged in
        setTimeout(() => {
            if (!isAuthenticated && loginUser) {
                loginUser.focus();
            }
        }, 300);
    }

    function closeDrawer() {
        configDrawer.classList.remove('open');
        drawerOverlay.classList.remove('open');
        configDrawer.setAttribute('aria-hidden', 'true');
    }

    configToggle.addEventListener('click', openDrawer);
    drawerClose.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);

    // Login Form Submit
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = loginUser.value.trim();
        const password = loginPass.value;

        if (username === 'proari' && password === '4206371Ariel*') {
            isAuthenticated = true;
            sessionStorage.setItem('proari_authenticated', 'true');
            loginError.style.display = 'none';
            
            // Switch view with clean transition
            loginSection.style.display = 'none';
            editorSection.style.display = 'block';
            
            showToast('Acceso autorizado. Panel desbloqueado.');
            populateDrawerInputs();
        } else {
            // Show error message
            loginError.style.display = 'flex';
            
            // Add shake visual feedback
            loginForm.classList.add('shake-element');
            loginPass.value = '';
            loginPass.focus();
            
            setTimeout(() => {
                loginForm.classList.remove('shake-element');
            }, 400);
        }
    });

    // Logout Button Action
    btnLogout.addEventListener('click', () => {
        isAuthenticated = false;
        sessionStorage.removeItem('proari_authenticated');
        
        // Switch back to login view
        editorSection.style.display = 'none';
        loginSection.style.display = 'block';
        loginUser.value = '';
        loginPass.value = '';
        loginError.style.display = 'none';
        
        showToast('Sesión cerrada. Acceso protegido.');
        
        setTimeout(() => {
            loginUser.focus();
        }, 100);
    });

    // Form submission
    ratesForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Retrieve values from form
        currentRates.USD.official.buy = parseFloat(document.getElementById('input-usd-off-buy').value);
        currentRates.USD.official.sell = parseFloat(document.getElementById('input-usd-off-sell').value);
        currentRates.USD.referential.buy = parseFloat(document.getElementById('input-usd-ref-buy').value);
        currentRates.USD.referential.sell = parseFloat(document.getElementById('input-usd-ref-sell').value);

        currentRates.BRL.official.buy = parseFloat(document.getElementById('input-brl-off-buy').value);
        currentRates.BRL.official.sell = parseFloat(document.getElementById('input-brl-off-sell').value);
        currentRates.BRL.referential.buy = parseFloat(document.getElementById('input-brl-ref-buy').value);
        currentRates.BRL.referential.sell = parseFloat(document.getElementById('input-brl-ref-sell').value);

        currentRates.PEN.official.buy = parseFloat(document.getElementById('input-pen-off-buy').value);
        currentRates.PEN.official.sell = parseFloat(document.getElementById('input-pen-off-sell').value);
        currentRates.PEN.referential.buy = parseFloat(document.getElementById('input-pen-ref-buy').value);
        currentRates.PEN.referential.sell = parseFloat(document.getElementById('input-pen-ref-sell').value);

        saveRates();
        updateUI();
        closeDrawer();
        showToast('Tasas de cambio actualizadas con éxito.');
    });

    // Reset button inside drawer
    resetBtn.addEventListener('click', () => {
        if (confirm('¿Está seguro de que desea restablecer las tasas predeterminadas?')) {
            resetRatesToDefault();
            populateDrawerInputs();
        }
    });
}

function populateDrawerInputs() {
    // USD
    document.getElementById('input-usd-off-buy').value = currentRates.USD.official.buy;
    document.getElementById('input-usd-off-sell').value = currentRates.USD.official.sell;
    document.getElementById('input-usd-ref-buy').value = currentRates.USD.referential.buy;
    document.getElementById('input-usd-ref-sell').value = currentRates.USD.referential.sell;

    // BRL
    document.getElementById('input-brl-off-buy').value = currentRates.BRL.official.buy;
    document.getElementById('input-brl-off-sell').value = currentRates.BRL.official.sell;
    document.getElementById('input-brl-ref-buy').value = currentRates.BRL.referential.buy;
    document.getElementById('input-brl-ref-sell').value = currentRates.BRL.referential.sell;

    // PEN
    document.getElementById('input-pen-off-buy').value = currentRates.PEN.official.buy;
    document.getElementById('input-pen-off-sell').value = currentRates.PEN.official.sell;
    document.getElementById('input-pen-ref-buy').value = currentRates.PEN.referential.buy;
    document.getElementById('input-pen-ref-sell').value = currentRates.PEN.referential.sell;
}

// ==========================================================================
// APP INITIALIZATION
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Icons
    lucide.createIcons();
    
    // 2. Load exchange rates state
    loadRates();
    
    // 3. Start clocks and UI toggles
    startClock();
    initTheme();
    
    // 4. Initialize calculator controls
    initCalculator();
    
    // 5. Initialize chart switching controls
    initChartTabs();
    
    // 6. Initialize drawer sliders and form
    initDrawer();
    
    // 7. Initial render of cards, calculations and charts
    updateUI();
});
