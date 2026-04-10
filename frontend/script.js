// // --- 1. Global Variables ---
// let myChart;
// const API_BASE = 'http://localhost:5000/api';

// // --- 2. Page Load Logic ---
// window.onload = function() {
//     const params = new URLSearchParams(window.location.search);
//     const email = params.get('email');

//     if (email) {
//         localStorage.setItem('userEmail', email);
//         const cleanUrl = window.location.origin + window.location.pathname;
//         window.history.replaceState({}, document.title, cleanUrl);
//     }

//     if (!localStorage.getItem('userEmail')) {
//         window.location.href = "login.html";
//     } else {
//         // Welcome text setup
//         const userDisplay = document.getElementById('dateDisplay'); // Ya jo bhi header element ho
//         updateUI();
//     }
// };

// // --- 3. Update Dashboard Stats & Charts ---
// async function updateUI() {
//     try {
//         const res = await fetch(`${API_BASE}/stats`);
//         const stats = await res.json();

//         // Update Stats Cards
//         document.getElementById('totalIncome').innerText = `₹${stats.income || 0}`;
//         document.getElementById('totalExpense').innerText = `₹${stats.expense || 0}`;
//         document.getElementById('totalSavings').innerText = `₹${stats.savings || 0}`;

//         // Refresh Chart and AI
//         updateChart();
//         updateAI(); 
//     } catch (err) {
//         console.error("UI Update Error:", err);
//     }
// }

// // --- 4. Send Transaction Data ---
// async function sendData(type) {
//     const title = document.getElementById('title').value;
//     const amount = document.getElementById('amount').value;
//     const category = document.getElementById('category').value;

//     if(!title || !amount) return alert("Bhai, description aur amount toh dalo!");

//     try {
//         const response = await fetch(`${API_BASE}/add-transaction`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ title, amount: Number(amount), category, type })
//         });

//         if(response.ok) {
//             document.getElementById('title').value = '';
//             document.getElementById('amount').value = '';
//             updateUI(); // Ye automatically Chart aur AI ko call karega
//         }
//     } catch (err) {
//         alert("Transaction fail ho gayi!");
//     }
// }

// // --- 5. Real-Time AI Prediction ---
// async function updateAI() {
//     try {
//         const totalExp = Number(document.getElementById('totalExpense').innerText.replace('₹', ''));
//         const totalInc = Number(document.getElementById('totalIncome').innerText.replace('₹', ''));
//         const totalSav = Number(document.getElementById('totalSavings').innerText.replace('₹', ''));
//         const month = new Date().getMonth() + 1;

//         // 1. Purana Prediction Logic
//         const resPred = await fetch(`${API_BASE}/ai-prediction`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ month, actual_spent: totalExp })
//         });
//         const predData = await resPred.json();

//         // 2. Naya Gemini Advice Logic
//         const resAdvice = await fetch(`${API_BASE}/ai-advice`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ 
//                 income: totalInc, 
//                 expense: totalExp, 
//                 savings: totalSav,
//                 topCategory: "Food & Shopping" // Aap ise dynamic bhi kar sakte ho
//             })
//         });
//         const adviceData = await resAdvice.json();

//         // UI Update
//         document.getElementById('aiPrediction').innerText = `₹${predData.predicted_expense}`;
//         document.getElementById('aiAdvice').innerText = adviceData.advice;

//     } catch (err) { console.log("AI Sync Error"); }
// }

// async function getAIAnalysis() {
//     const data = {
//         month: new Date().getMonth() + 1,
//         monthly_income: 50000, // Ise dynamic kar sakte ho
//         prev_month_expense: 20000, // Ise DB se fetch kar sakte ho
//         category: document.getElementById('category').value // Dropdown se category
//     };

//     const res = await fetch('/api/get-prediction', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(data)
//     });

//     const result = await res.json();
    
//     if(result.status === "success") {
//         document.getElementById('aiPrediction').innerText = `₹${result.predicted_expense}`;
//         alert(`AI Suggestion: For ${result.category}, expected spend is ₹${result.predicted_expense}`);
//     }
// }

// async function triggerAI() {
//     const aiPredictionText = document.getElementById('aiPrediction');
//     const selectedCat = document.getElementById('aiCategory').value; // Naya dropdown ID
    
//     aiPredictionText.innerText = "Processing...";

//     const requestData = {
//         month: new Date().getMonth() + 1,
//         monthly_income: 50000, 
//         prev_month_expense: 20000, 
//         category: selectedCat // Yahan se category Flask ko jayegi
//     };

//     try {
//         const res = await fetch('http://localhost:5000/api/get-prediction', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(requestData)
//         });
//         const result = await res.json();

//         if (result.status === "success") {
//             // Sirf Prediction Column update hoga
//             aiPredictionText.innerText = `₹${result.predicted_expense}`;
            
//             // Gemini se is specific prediction par advice lo
//             getGeminiAdvice(result.predicted_expense, selectedCat);
//         }
//     } catch (err) {
//         aiPredictionText.innerText = "Offline";
//     }
// }

// // --- 6. Chart Logic ---
// async function updateChart() {
//     try {
//         const res = await fetch(`${API_BASE}/get-transactions`);
//         const data = await res.json();
        
//         const cats = [...new Set(data.map(t => t.category))];
//         const vals = cats.map(c => 
//             data.filter(t => t.category === c && t.type === 'expense')
//                 .reduce((s, t) => s + t.amount, 0)
//         );

//         if (myChart) myChart.destroy();
        
//         const ctx = document.getElementById('myChart').getContext('2d');
//         myChart = new Chart(ctx, {
//             type: 'doughnut',
//             data: { 
//                 labels: cats, 
//                 datasets: [{ 
//                     data: vals, 
//                     backgroundColor: ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6'] 
//                 }] 
//             },
//             options: { maintainAspectRatio: false }
//         });
//     } catch (err) {
//         console.error("Chart Error:", err);
//     }
// }

// // --- 7. Logout ---
// function logout() {
//     localStorage.clear();
//     window.location.href = "login.html";
// }