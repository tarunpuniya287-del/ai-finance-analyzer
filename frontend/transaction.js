const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api/transactions'
    : 'https://ai-finance-analyzer-5em3.onrender.com/api/transactions'; 
let allTransactions = []; // Global store for filtering

async function fetchTransactions() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading Data...</td></tr>';

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);
        
        allTransactions = await response.json();

        if (allTransactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Abhi koi transaction nahi hai bhai!</td></tr>';
            updateStats(0, 0); // Stats reset
            return;
        }

        updateStats(allTransactions); // Stats card update karein
        renderTable(allTransactions); // Default: Sab dikhao

    } catch (error) {
        console.error("Fetch Error:", error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Backend se dosti nahi ho pa rahi!</td></tr>`;
    }
}

// 📊 1. Summary Cards Logic
function updateStats(data) {
    let income = 0;
    let expense = 0;

    data.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type.toLowerCase() === 'income') income += amt;
        else expense += amt;
    });

    document.getElementById('totalIncome').innerText = `₹${income.toLocaleString('en-IN')}`;
    document.getElementById('totalExpense').innerText = `₹${expense.toLocaleString('en-IN')}`;
    document.getElementById('netSavings').innerText = `₹${(income - expense).toLocaleString('en-IN')}`;
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

// 📑 3. Table Rendering Logic
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = data.map(t => {
        const type = t.type ? t.type.toLowerCase() : 'expense';
        const badgeClass = type === 'income' ? 'badge-income' : 'badge-expense';
        const amountColor = type === 'income' ? '#10b981' : '#f43f5e';
        const sign = type === 'income' ? '+' : '-';

        return `
            <tr>
                <td>${new Date(t.date).toLocaleDateString('en-IN')}</td>
                <td>${t.description || t.title || 'N/A'}</td>
                <td>${t.category}</td>
                <td><span class="${badgeClass}">${type.toUpperCase()}</span></td>
                <td style="font-weight: bold; color: ${amountColor}">
                    ${sign} ₹${Number(t.amount).toLocaleString('en-IN')}
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

document.addEventListener('DOMContentLoaded', fetchTransactions);