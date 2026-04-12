const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api/transactions'
    : 'https://ai-finance-analyzer-5em3.onrender.com/api/transactions'; 
let allTransactions = []; // Global store for filtering

async function fetchTransactions() {
    console.log('🔄 Fetching transactions...');
    const startTime = performance.now();
    
    const tbody = document.getElementById('tableBody');
    const statCount = document.getElementById('statCount');
    if (!tbody) return;

    // Initialize topbar
    const email = APP.initTopbar();
    if (!email) {
        console.error('❌ No email found');
        return;
    }

    // Show loading state
    tbody.innerHTML = `
        <tr><td colspan="5" style="text-align:center;padding:40px;">
            <div style="display:inline-block;">
                <i class="fas fa-circle-notch fa-spin" style="font-size:24px;color:var(--primary);margin-bottom:8px;"></i>
                <div style="font-size:14px;color:var(--muted);">Loading transactions...</div>
            </div>
        </td></tr>`;
    
    if (statCount) statCount.textContent = '...';

    try {
        // Get email from localStorage (already initialized above)
        const url = email ? `${API_URL}?email=${encodeURIComponent(email)}` : API_URL;
        
        console.log('📡 Fetching from:', url);
        const fetchStart = performance.now();
        
        const response = await fetch(url, { 
            headers: { 'Cache-Control': 'no-cache' }
        });
        
        const fetchEnd = performance.now();
        console.log(`⏱️ Fetch took: ${(fetchEnd - fetchStart).toFixed(2)}ms`);
        
        if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);
        
        const parseStart = performance.now();
        allTransactions = await response.json();
        const parseEnd = performance.now();
        console.log(`📦 Parse took: ${(parseEnd - parseStart).toFixed(2)}ms`);
        console.log(`📊 Loaded ${allTransactions.length} transactions`);

        if (allTransactions.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="5" style="text-align:center;padding:40px;">
                    <div style="font-size:48px;margin-bottom:12px;">💳</div>
                    <div style="font-size:16px;font-weight:600;margin-bottom:4px;">No transactions yet</div>
                    <div style="font-size:13px;color:var(--muted);">Add your first transaction to get started!</div>
                </td></tr>`;
            if (statCount) statCount.textContent = '0';
            return;
        }

        const renderStart = performance.now();
        updateStats(allTransactions);
        renderTable(allTransactions);
        const renderEnd = performance.now();
        console.log(`🎨 Render took: ${(renderEnd - renderStart).toFixed(2)}ms`);
        
        const totalTime = performance.now() - startTime;
        console.log(`✅ Total time: ${totalTime.toFixed(2)}ms`);

    } catch (error) {
        console.error("❌ Fetch Error:", error);
        tbody.innerHTML = `
            <tr><td colspan="5" style="text-align:center;padding:40px;">
                <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
                <div style="font-size:16px;font-weight:600;color:var(--expense);margin-bottom:4px;">Could not load transactions</div>
                <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">${error.message}</div>
                <button class="btn btn-primary btn-sm" onclick="fetchTransactions()">
                    <i class="fas fa-sync"></i> Retry
                </button>
            </td></tr>`;
        if (statCount) statCount.textContent = '0';
    }
}

// 📊 1. Summary Cards Logic (with Settings Support)
function updateStats(data) {
    // Only update transaction count
    document.getElementById('statCount').innerText = data.length;
}

// 🗂️ 2. Tab Switching Logic
function switchTab(type, btn) {
    // Buttons ki active class update karo
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Data filter karo
    const filtered = (type === 'all') 
        ? allTransactions 
        : allTransactions.filter(t => t.type.toLowerCase() === type);
    
    renderTable(filtered);
}

// 📑 3. Table Rendering Logic (with Settings Support - Fast & Simple)
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="5" style="text-align:center;padding:40px;">
                <div style="font-size:48px;margin-bottom:12px;">🔍</div>
                <div style="font-size:16px;font-weight:600;margin-bottom:4px;">No transactions found</div>
                <div style="font-size:13px;color:var(--muted);">Try adjusting your filters</div>
            </td></tr>`;
        return;
    }

    // Simple and fast - render all at once
    tbody.innerHTML = data.map(t => {
        const type = t.type ? t.type.toLowerCase() : 'expense';
        const badgeClass = type === 'income' ? 'badge-income' : 'badge-expense';
        const amountColor = type === 'income' ? '#10b981' : '#f43f5e';
        const sign = type === 'income' ? '+' : '-';

        // Use settings-aware formatting
        const formattedDate = APP.formatDateWithSettings(t.date);
        const formattedAmount = APP.formatCurrencyWithSettings(t.amount);

        return `
            <tr>
                <td>${formattedDate}</td>
                <td>${t.description || t.title || 'N/A'}</td>
                <td>${t.category}</td>
                <td><span class="${badgeClass}">${type.toUpperCase()}</span></td>
                <td style="font-weight: bold; color: ${amountColor}">
                    ${sign} ${formattedAmount}
                </td>
            </tr>
        `;
    }).join('');
}

// 📥 4. Excel Export Logic
function exportToExcel() {
    if (allTransactions.length === 0) return alert("Download karne ke liye data hi nahi hai!");
    
    const ws = XLSX.utils.json_to_sheet(allTransactions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `Finance_Report_${new Date().toLocaleDateString()}.xlsx`);
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('ready');
    fetchTransactions();
});