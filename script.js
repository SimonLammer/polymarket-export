/**
 * Configuration & Constants
 */
const CONFIG = {
    API_BASE: "https://user-pnl-api.polymarket.com/user-pnl",
    ADDRESS_REGEX: /^0x[a-fA-F0-9]{40}$/
};

/**
 * PolymarketExporter - Main Application Class
 * Encapsulates all logic for fetching, processing, and displaying PnL data.
 */
class PolymarketExporter {
    constructor() {
        // State
        this.data = [];
        this.chart = null;

        // DOM Elements
        this.dom = {
            form: document.getElementById('config-form'),
            inputs: {
                address: document.getElementById('input-address'),
                interval: document.getElementById('input-interval'),
                fidelity: document.getElementById('input-fidelity')
            },
            buttons: {
                load: document.getElementById('btn-load'),
                export: document.getElementById('btn-export')
            },
            ui: {
                spinner: document.getElementById('spinner'),
                error: document.getElementById('error-display'),
                results: document.getElementById('results-view'),
                tableBody: document.getElementById('table-body'),
                chartCanvas: document.getElementById('chart-canvas').getContext('2d')
            }
        };

        this.initListeners();
    }

    initListeners() {
        this.dom.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.dom.buttons.export.addEventListener('click', () => this.handleExport());
    }

    // --- Logic: Data Fetching & Processing ---

    async handleSubmit(e) {
        e.preventDefault();
        this.resetUI();

        const params = this.getParams();
        
        if (!this.validateParams(params)) return;

        this.setLoading(true);

        try {
            const rawData = await this.fetchData(params);
            this.data = this.processData(rawData);
            
            if (this.data.length === 0) throw new Error("No data returned for this query.");

            this.renderUI();
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    getParams() {
        return {
            address: this.dom.inputs.address.value.trim(),
            interval: this.dom.inputs.interval.value.trim() || 'all',
            fidelity: this.dom.inputs.fidelity.value.trim() || '1d'
        };
    }

    validateParams({ address }) {
        if (!CONFIG.ADDRESS_REGEX.test(address)) {
            this.showError("Invalid Ethereum address format. Must start with 0x and be 42 chars.");
            return false;
        }
        return true;
    }

    async fetchData({ address, interval, fidelity }) {
        const url = new URL(CONFIG.API_BASE);
        url.searchParams.append('user_address', address);
        url.searchParams.append('interval', interval);
        url.searchParams.append('fidelity', fidelity);

        const response = await fetch(url.toString());
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    }

    processData(json) {
        if (!Array.isArray(json)) throw new Error("Invalid API response structure.");

        return json.map(item => {
            // API returns 't' in seconds, JS needs milliseconds
            const date = new Date(item.t * 1000);
            return {
                timestamp: item.t,
                // Format: YYYY-MM-DD
                dateStr: date.toISOString().split('T')[0], 
                value: item.p
            };
        });
    }

    handleExport() {
        if (!this.data.length) return;

        const csvHeader = "Date,Net Value\n";
        const csvRows = this.data.map(r => `${r.dateStr},${r.value}`).join("\n");
        const csvContent = csvHeader + csvRows;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `polymarket_export_${new Date().toISOString().slice(0,10)}.csv`;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Logic: UI Rendering ---

    renderUI() {
        this.renderTable();
        this.renderChart();
        this.dom.ui.results.classList.remove('hidden');
    }

    renderTable() {
        this.dom.ui.tableBody.innerHTML = '';
        // Clone array and reverse to show newest first in table
        const reversedData = [...this.data].reverse();

        const fragment = document.createDocumentFragment();
        reversedData.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 transition-colors";
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.dateStr}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono font-medium">
                    ${row.value.toFixed(2)}
                </td>
            `;
            fragment.appendChild(tr);
        });
        this.dom.ui.tableBody.appendChild(fragment);
    }

    renderChart() {
        if (this.chart) this.chart.destroy();

        const labels = this.data.map(d => d.dateStr);
        const values = this.data.map(d => d.value);
        
        // Color logic: Green if ending higher than start, Red if lower
        const isProfit = values[values.length - 1] >= values[0];
        const color = isProfit ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)';
        const bg = isProfit ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)';

        this.chart = new Chart(this.dom.ui.chartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Net Value',
                    data: values,
                    borderColor: color,
                    backgroundColor: bg,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0,
                    pointHitRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            label: (ctx) => ` $${ctx.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { display: false },
                        ticks: { maxTicksLimit: 6 }
                    },
                    y: { 
                        grid: { color: '#f3f4f6' }
                    }
                }
            }
        });
    }

    // --- Logic: UI Utilities ---

    setLoading(isLoading) {
        this.dom.buttons.load.disabled = isLoading;
        if (isLoading) {
            this.dom.buttons.load.classList.add('opacity-75', 'cursor-not-allowed');
            this.dom.ui.spinner.classList.remove('hidden');
        } else {
            this.dom.buttons.load.classList.remove('opacity-75', 'cursor-not-allowed');
            this.dom.ui.spinner.classList.add('hidden');
        }
    }

    resetUI() {
        this.dom.ui.error.classList.add('hidden');
        this.dom.ui.error.textContent = '';
        this.dom.ui.results.classList.add('hidden');
        this.data = [];
    }

    showError(msg) {
        this.dom.ui.error.textContent = msg;
        this.dom.ui.error.classList.remove('hidden');
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    new PolymarketExporter();
});
