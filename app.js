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
    },
    updatedAt: 0
};

let currentRates = {};
let ratesHistory = [];

const DB_APP_KEY = 'fwcuwrg1';
const DB_KEY = 'rates';
const DB_HISTORY_KEY = 'rates_history';

// Base64Url helper functions for safe URL parameter storage
function base64UrlEncode(str) {
    const base64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode('0x' + p1);
    }));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    const raw = atob(base64);
    const decoded = raw.split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('');
    return decodeURIComponent(decoded);
}

// Compress rates to a compact CSV string to save space and fit in URL paths
function compressRates(rates, timestamp) {
    const parts = [
        rates.USD.official.buy, rates.USD.official.sell, rates.USD.referential.buy, rates.USD.referential.sell,
        rates.BRL.official.buy, rates.BRL.official.sell, rates.BRL.referential.buy, rates.BRL.referential.sell,
        rates.PEN.official.buy, rates.PEN.official.sell, rates.PEN.referential.buy, rates.PEN.referential.sell,
        timestamp || Date.now()
    ];
    return parts.join(',');
}

// Decompress rates from the compact CSV string format
function decompressRates(compressedStr) {
    const p = compressedStr.split(',').map(Number);
    if (p.length < 13 || p.some(isNaN)) {
        throw new Error('Invalid compressed rates format');
    }
    return {
        USD: {
            official: { buy: p[0], sell: p[1] },
            referential: { buy: p[2], sell: p[3] }
        },
        BRL: {
            official: { buy: p[4], sell: p[5] },
            referential: { buy: p[6], sell: p[7] }
        },
        PEN: {
            official: { buy: p[8], sell: p[9] },
            referential: { buy: p[10], sell: p[11] }
        },
        updatedAt: p[12]
    };
}

// Compare two rates objects to check for changes
function isRatesDifferent(r1, r2) {
    if (!r1 || !r2) return true;
    for (const curr of ['USD', 'BRL', 'PEN']) {
        if (!r1[curr] || !r2[curr]) return true;
        if (!r1[curr].official || !r2[curr].official || !r1[curr].referential || !r2[curr].referential) return true;
        if (r1[curr].official.buy !== r2[curr].official.buy ||
            r1[curr].official.sell !== r2[curr].official.sell ||
            r1[curr].referential.buy !== r2[curr].referential.buy ||
            r1[curr].referential.sell !== r2[curr].referential.sell) {
            return true;
        }
    }
    return false;
}

// Load rates from localStorage (fast cache) and sync from cloud asynchronously
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

    // Sync from cloud database in background with cache-busting to ensure latest rates
    fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/${DB_APP_KEY}/${DB_KEY}?t=${Date.now()}`, {
        cache: 'no-store'
    })
        .then(response => {
            if (response.ok) {
                return response.text();
            }
            throw new Error('Cloud fetch failed');
        })
        .then(dataStr => {
            if (dataStr && dataStr.trim() !== "" && dataStr !== "null") {
                let cleanData = dataStr.trim();
                if (cleanData.startsWith('"') && cleanData.endsWith('"')) {
                    cleanData = cleanData.substring(1, cleanData.length - 1);
                }
                const decodedStr = base64UrlDecode(cleanData);
                let cloudRates = null;
                
                // Try to parse as CSV format first
                if (decodedStr.includes(',') && !decodedStr.trim().startsWith('{')) {
                    try {
                        cloudRates = decompressRates(decodedStr);
                    } catch (e) {
                        console.error('Error parsing cloud rates as CSV:', e);
                    }
                } else {
                    // Otherwise parse as JSON (old formats)
                    try {
                        const cloudData = JSON.parse(decodedStr);
                        if (cloudData && cloudData.USD && cloudData.USD.o) {
                            // Old JSON compressed format (o, r, b, s)
                            cloudRates = {
                                USD: {
                                    official: { buy: cloudData.USD.o.b, sell: cloudData.USD.o.s },
                                    referential: { buy: cloudData.USD.r.b, sell: cloudData.USD.r.s }
                                },
                                BRL: {
                                    official: { buy: cloudData.BRL.o.b, sell: cloudData.BRL.o.s },
                                    referential: { buy: cloudData.BRL.r.b, sell: cloudData.BRL.r.s }
                                },
                                PEN: {
                                    official: { buy: cloudData.PEN.o.b, sell: cloudData.PEN.o.s },
                                    referential: { buy: cloudData.PEN.r.b, sell: cloudData.PEN.r.s }
                                },
                                updatedAt: cloudData.t
                            };
                        } else if (cloudData && cloudData.USD && cloudData.USD.official && cloudData.USD.referential) {
                            cloudRates = {
                                ...cloudData,
                                updatedAt: cloudData.updatedAt || Date.now()
                            };
                        }
                    } catch (e) {
                        console.error('Error parsing cloud rates as JSON:', e);
                    }
                }
                
                // Validate structure to avoid corruption
                if (cloudRates && cloudRates.USD && cloudRates.USD.official && cloudRates.USD.referential &&
                    cloudRates.BRL && cloudRates.BRL.official && cloudRates.BRL.referential &&
                    cloudRates.PEN && cloudRates.PEN.official && cloudRates.PEN.referential) {
                    
                    // Only update if cloud rates are strictly newer than local rates
                    const localUpdated = currentRates.updatedAt || 0;
                    const cloudUpdated = cloudRates.updatedAt || 0;
                    
                    if (cloudUpdated > localUpdated) {
                        // Check if rates changed to append to history
                        const lastEntry = ratesHistory.length > 0 ? ratesHistory[ratesHistory.length - 1] : null;
                        const hasChanged = !lastEntry || isRatesDifferent(lastEntry.rates, cloudRates);
                        
                        currentRates = cloudRates;
                        localStorage.setItem('bolivia_cambio_rates', JSON.stringify(currentRates));
                        
                        if (hasChanged) {
                            const newEntry = {
                                timestamp: new Date(currentRates.updatedAt).toISOString(),
                                rates: JSON.parse(JSON.stringify(currentRates))
                            };
                            ratesHistory.push(newEntry);
                            if (ratesHistory.length > 100) {
                                ratesHistory.shift();
                            }
                            localStorage.setItem('bolivia_cambio_rates_history', JSON.stringify(ratesHistory));
                            updateHistoryUI();
                        }
                        
                        updateUI();
                        console.log('Rates synchronized from cloud.');
                    } else {
                        console.log('Local rates are up-to-date or newer than cloud.');
                    }
                } else {
                    console.warn('Fetched cloud rates have an invalid structure. Ignored to prevent corruption.');
                }
            }
        })
        .catch(err => {
            console.warn('Unable to sync rates from cloud, using cached or default rates:', err);
        });
}

// Load history from localStorage (local-first)
function loadHistory() {
    const saved = localStorage.getItem('bolivia_cambio_rates_history');
    if (saved) {
        try {
            ratesHistory = JSON.parse(saved);
        } catch (e) {
            console.error('Error parsing history from localStorage.', e);
            ratesHistory = [];
        }
    }

    if (ratesHistory.length === 0) {
        generateInitialMockHistory();
    } else {
        updateHistoryUI();
        drawChart(activeChartCurrency);
    }
}

// Generate initial mock history for 7 days if empty
function generateInitialMockHistory() {
    const history = [];
    const now = new Date();
    const days = 7;
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayFactor = (days - 1 - i) - 6;
        const scaleUSD = 0.12;
        const scaleBRL = 0.05;
        const scalePEN = 0.08;
        const wave = Math.sin((days - 1 - i) * 1.2) * 0.4;
        
        const entry = {
            timestamp: date.toISOString(),
            rates: {
                USD: {
                    official: { 
                        buy: parseFloat((DEFAULT_RATES.USD.official.buy).toFixed(2)), 
                        sell: parseFloat((DEFAULT_RATES.USD.official.sell).toFixed(2)) 
                    },
                    referential: { 
                        buy: parseFloat((DEFAULT_RATES.USD.referential.buy + dayFactor * scaleUSD + wave * scaleUSD).toFixed(2)), 
                        sell: parseFloat((DEFAULT_RATES.USD.referential.sell + dayFactor * scaleUSD + wave * scaleUSD).toFixed(2)) 
                    }
                },
                BRL: {
                    official: { 
                        buy: parseFloat((DEFAULT_RATES.BRL.official.buy).toFixed(2)), 
                        sell: parseFloat((DEFAULT_RATES.BRL.official.sell).toFixed(2)) 
                    },
                    referential: { 
                        buy: parseFloat((DEFAULT_RATES.BRL.referential.buy + dayFactor * scaleBRL + wave * scaleBRL).toFixed(2)), 
                        sell: parseFloat((DEFAULT_RATES.BRL.referential.sell + dayFactor * scaleBRL + wave * scaleBRL).toFixed(2)) 
                    }
                },
                PEN: {
                    official: { 
                        buy: parseFloat((DEFAULT_RATES.PEN.official.buy).toFixed(2)), 
                        sell: parseFloat((DEFAULT_RATES.PEN.official.sell).toFixed(2)) 
                    },
                    referential: { 
                        buy: parseFloat((DEFAULT_RATES.PEN.referential.buy + dayFactor * scalePEN + wave * scalePEN).toFixed(2)), 
                        sell: parseFloat((DEFAULT_RATES.PEN.referential.sell + dayFactor * scalePEN + wave * scalePEN).toFixed(2)) 
                    }
                }
            }
        };
        
        if (i === 0 && currentRates.USD) {
            entry.rates = JSON.parse(JSON.stringify(currentRates));
        }
        history.push(entry);
    }
    
    ratesHistory = history;
    localStorage.setItem('bolivia_cambio_rates_history', JSON.stringify(ratesHistory));
    updateHistoryUI();
}

// Local-only save of history to localStorage
function saveHistory() {
    localStorage.setItem('bolivia_cambio_rates_history', JSON.stringify(ratesHistory));
    return Promise.resolve(true);
}

// Save current rates to localStorage and cloud database
async function saveRates() {
    currentRates.updatedAt = Date.now();
    localStorage.setItem('bolivia_cambio_rates', JSON.stringify(currentRates));
    
    let ratesChanged = true;
    if (ratesHistory.length > 0) {
        const lastEntry = ratesHistory[ratesHistory.length - 1];
        ratesChanged = isRatesDifferent(lastEntry.rates, currentRates);
    }

    if (ratesChanged) {
        const newEntry = {
            timestamp: new Date(currentRates.updatedAt).toISOString(),
            rates: JSON.parse(JSON.stringify(currentRates))
        };
        ratesHistory.push(newEntry);
        if (ratesHistory.length > 100) {
            ratesHistory.shift();
        }
        localStorage.setItem('bolivia_cambio_rates_history', JSON.stringify(ratesHistory));
        updateHistoryUI();
    }
    
    try {
        const compressedJson = compressRates(currentRates, currentRates.updatedAt);
        const encoded = base64UrlEncode(compressedJson);
        const response = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${DB_APP_KEY}/${DB_KEY}/${encoded}`, {
            method: 'POST'
        });
        if (response.ok) {
            const result = await response.text();
            if (result === 'true' || result === 'True') {
                console.log('Rates saved to cloud successfully.');
                return true;
            }
        }
        throw new Error('Cloud save rejected by server');
    } catch (e) {
        console.error('Error saving rates to cloud:', e);
        return false;
    }
}

// Reset rates to default
async function resetRatesToDefault() {
    currentRates = JSON.parse(JSON.stringify(DEFAULT_RATES));
    currentRates.updatedAt = Date.now();
    
    const newEntry = {
        timestamp: new Date(currentRates.updatedAt).toISOString(),
        rates: JSON.parse(JSON.stringify(currentRates))
    };
    ratesHistory.push(newEntry);
    if (ratesHistory.length > 100) {
        ratesHistory.shift();
    }
    saveHistory();
    updateHistoryUI();
    
    const savedGlobally = await saveRates();
    updateUI();
    if (savedGlobally) {
        showToast('Tasas restauradas y sincronizadas globalmente.');
    } else {
        showToast('Tasas restauradas localmente (error al sincronizar en la nube).');
    }
}

let activeHistoryCurrency = 'USD';

function initHistoryTabs() {
    const tabs = document.querySelectorAll('.history-tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            activeHistoryCurrency = tab.getAttribute('data-hist-curr');
            updateHistoryUI();
        });
    });
}

function updateHistoryUI() {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (ratesHistory.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="no-data">No hay datos registrados aún.</td></tr>`;
        return;
    }
    
    const displayEntries = [...ratesHistory].reverse().slice(0, 10);
    
    displayEntries.forEach(entry => {
        const dateObj = new Date(entry.timestamp);
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
        const formattedDate = new Intl.DateTimeFormat('es-BO', options).format(dateObj).replace(',', ' -');
        
        const currencyRates = entry.rates[activeHistoryCurrency];
        if (!currencyRates) return;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="history-timestamp">${formattedDate}</td>
            <td class="history-val-buy">${currencyRates.official.buy.toFixed(2)} Bs.</td>
            <td class="history-val-sell">${currencyRates.official.sell.toFixed(2)} Bs.</td>
            <td class="history-val-buy">${currencyRates.referential.buy.toFixed(2)} Bs.</td>
            <td class="history-val-sell">${currencyRates.referential.sell.toFixed(2)} Bs.</td>
        `;
        tableBody.appendChild(tr);
    });
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
// Generate simulated historical rates based on the current rates to look realistic,
// or use real registered rates if available
function generateHistoryData(currencyCode) {
    const rate = currentRates[currencyCode];
    if (!rate) return [];
    
    // Attempt to retrieve last 7 days of rates from ratesHistory
    const uniqueDaysMap = new Map();
    const daysName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    // Scan history backwards to get the most recent daily rates
    for (let i = ratesHistory.length - 1; i >= 0; i--) {
        const entry = ratesHistory[i];
        if (!entry.rates || !entry.rates[currencyCode]) continue;
        
        const dateObj = new Date(entry.timestamp);
        const dayStr = dateObj.toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' });
        
        if (!uniqueDaysMap.has(dayStr)) {
            const dayOfWeek = daysName[dateObj.getDay()];
            uniqueDaysMap.set(dayStr, {
                day: dayOfWeek,
                official: entry.rates[currencyCode].official.sell,
                referential: entry.rates[currencyCode].referential.sell,
                date: dateObj
            });
        }
        if (uniqueDaysMap.size >= 7) {
            break;
        }
    }
    
    const realHistory = Array.from(uniqueDaysMap.values()).reverse();
    
    if (realHistory.length >= 7) {
        return realHistory;
    }
    
    // Pad older days with simulated data
    const paddedHistory = [];
    const daysShort = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const scale = currencyCode === 'USD' ? 0.12 : currencyCode === 'BRL' ? 0.05 : 0.08;
    const offRefVal = rate.official.sell;
    const refRefVal = rate.referential.sell;
    
    const needed = 7 - realHistory.length;
    for (let i = 0; i < 7; i++) {
        if (i < needed) {
            const dayFactor = (i - 6) * 0.03; 
            const wave = Math.sin(i * 1.2) * scale * 0.4;
            const officialVal = offRefVal + (dayFactor * scale * 0.1) + wave * 0.1;
            const referentialVal = refRefVal + (dayFactor * scale) + wave;
            
            paddedHistory.push({
                day: daysShort[i],
                official: parseFloat(officialVal.toFixed(2)),
                referential: parseFloat(referentialVal.toFixed(2))
            });
        } else {
            const realIdx = i - needed;
            paddedHistory.push({
                day: realHistory[realIdx].day,
                official: realHistory[realIdx].official,
                referential: realHistory[realIdx].referential
            });
        }
    }
    
    if (paddedHistory.length > 0) {
        paddedHistory[paddedHistory.length - 1].official = offRefVal;
        paddedHistory[paddedHistory.length - 1].referential = refRefVal;
    }
    
    return paddedHistory;
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
    ratesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Show saving state on the submit button
        const submitBtn = document.getElementById('btn-save-rates');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline-block mr-2"></i> Guardando...';
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
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

        const savedGlobally = await saveRates();
        updateUI();
        closeDrawer();
        
        // Restore button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        if (savedGlobally) {
            showToast('Tasas de cambio actualizadas con éxito de manera global.');
        } else {
            showToast('Tasas actualizadas localmente (error al sincronizar en la nube).');
        }
    });

    // Reset button inside drawer
    resetBtn.addEventListener('click', async () => {
        if (confirm('¿Está seguro de que desea restablecer las tasas predeterminadas?')) {
            const originalBtnText = resetBtn.textContent;
            resetBtn.disabled = true;
            resetBtn.textContent = 'Restableciendo...';
            
            await resetRatesToDefault();
            populateDrawerInputs();
            
            resetBtn.disabled = false;
            resetBtn.textContent = originalBtnText;
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
    if (typeof lucide !== 'undefined') {
        try {
            lucide.createIcons();
        } catch (e) {
            console.error('Error initializing Lucide icons:', e);
        }
    } else {
        console.warn('Lucide library not loaded or defined.');
    }
    
    // 2. Load exchange rates state
    loadRates();
    loadHistory();
    
    // 3. Start clocks and UI toggles
    startClock();
    initTheme();
    
    // 4. Initialize calculator controls
    initCalculator();
    
    // 5. Initialize chart switching controls
    initChartTabs();
    initHistoryTabs();
    
    // 6. Initialize drawer sliders and form
    initDrawer();
    
    // 7. Initial render of cards, calculations and charts
    updateUI();
    updateHistoryUI();
});
