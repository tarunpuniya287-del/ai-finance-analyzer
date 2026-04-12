const COLORS = ['#6366f1','#10b981','#f43f5e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316'];

async function loadAnalytics() {
    try {
        const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000'
            : 'https://ai-finance-analyzer-5em3.onrender.com';
        const email = localStorage.getItem('userEmail') || '';
        const emailParam = email ? '?email=' + encodeURIComponent(email) : '';
        const res = await fetch(`${BASE}/api/transactions${emailParam}`);
        const data = await res.json();

        const catData = {};
        let totalExp = 0;

        data.forEach(t => {
            const amt = Number(t.amount) || 0;
            if ((t.type || '').toLowerCase() === 'expense') {
                catData[t.category] = (catData[t.category] || 0) + amt;
                totalExp += amt;
            }
        });

        // Summary cards
        document.getElementById('sumExpense').textContent = APP.formatCurrencyWithSettings(totalExp);
        document.getElementById('sumSavings').textContent = APP.formatCurrencyWithSettings(0 - totalExp); // Negative since no income tracking
        document.getElementById('sumCount').textContent = data.length;

        // Doughnut chart
        if (Object.keys(catData).length > 0) {
            new Chart(document.getElementById('categoryChart'), {
                type: 'doughnut',
                data: {
                    labels: Object.keys(catData),
                    datasets: [{ data: Object.values(catData), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 16 }]
                },
                options: {
                    maintainAspectRatio: false, cutout: '68%',
                    plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { family: 'Plus Jakarta Sans', size: 12 } } } }
                }
            });
        }

        // Bar chart - Only Expenses
        new Chart(document.getElementById('trendChart'), {
            type: 'bar',
            data: {
                labels: ['Total Expenses'],
                datasets: [{
                    data: [totalExp],
                    backgroundColor: ['rgba(244,63,94,0.85)'],
                    borderRadius: 14, barThickness: 70,
                    borderSkipped: false
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { family: 'Plus Jakarta Sans' } } },
                    x: { grid: { display: false }, ticks: { font: { family: 'Plus Jakarta Sans', weight: '600' } } }
                }
            }
        });

        // Category list with progress bars
        const catList = document.getElementById('catList');
        const sorted = Object.entries(catData).sort((a, b) => b[1] - a[1]);
        const maxVal = sorted[0]?.[1] || 1;

        catList.innerHTML = sorted.map(([cat, amt], i) => {
            const pct = ((amt / maxVal) * 100).toFixed(0);
            return `
            <div class="cat-item">
                <div class="cat-dot" style="background:${COLORS[i % COLORS.length]}"></div>
                <div class="cat-name">${cat}</div>
                <div class="cat-bar-wrap">
                    <div class="cat-bar" style="width:${pct}%;background:${COLORS[i % COLORS.length]}"></div>
                </div>
                <div class="cat-amount">${APP.formatCurrencyWithSettings(amt)}</div>
            </div>`;
        }).join('');

    } catch(e) { console.error('Analytics error', e); }
}

function logout() { localStorage.clear(); window.location.href = 'login.html'; }

document.addEventListener('DOMContentLoaded', loadAnalytics);
