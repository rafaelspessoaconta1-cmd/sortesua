// State Management
let currentUser = null;
let currentToken = null;

const API_BASE = '/api';

// DOM Elements
const mainHeader = document.getElementById('mainHeader');
const userNameEl = document.getElementById('userName');
const userRoleEl = document.getElementById('userRole');
const logoutBtn = document.getElementById('logoutBtn');

// Screens
const loginScreen = document.getElementById('loginScreen');
const adminPanel = document.getElementById('adminPanel');
const sellerPanel = document.getElementById('sellerPanel');

// Modal Elements
const saleModal = document.getElementById('saleModal');
const modalTicketNumber = document.getElementById('modalTicketNumber');
const modalTicketId = document.getElementById('modalTicketId');
const sellTicketForm = document.getElementById('sellTicketForm');
const clientName = document.getElementById('clientName');
const clientPhone = document.getElementById('clientPhone');
const paymentMethodRadios = document.getElementsByName('paymentMethod');
const pixPaymentArea = document.getElementById('pixPaymentArea');
const modalPixQr = document.getElementById('modalPixQr');
const modalPixKey = document.getElementById('modalPixKey');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelSaleBtn = document.getElementById('cancelSaleBtn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

// Authentication Helpers
function checkAuth() {
    const token = localStorage.getItem('token');
    const userJson = localStorage.getItem('user');

    if (token && userJson) {
        currentToken = token;
        currentUser = JSON.parse(userJson);
        showPanelForRole(currentUser.role);
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    mainHeader.style.display = 'none';
    adminPanel.style.display = 'none';
    sellerPanel.style.display = 'none';
    loginScreen.style.display = 'flex';
}

function showPanelForRole(role) {
    loginScreen.style.display = 'none';
    mainHeader.style.display = 'block';
    
    userNameEl.innerText = currentUser.nome;
    userRoleEl.innerText = role === 'admin' ? 'Administrador' : 'Vendedor';

    if (role === 'admin') {
        sellerPanel.style.display = 'none';
        adminPanel.style.display = 'block';
        loadAdminDashboard();
        // Load initial tabs
        switchAdminTab('adminDashboardTab');
    } else {
        adminPanel.style.display = 'none';
        sellerPanel.style.display = 'block';
        loadSellerTickets();
        loadSellerSalesToday();
    }
}

// Global Event Listeners
function setupEventListeners() {
    // Logout
    logoutBtn.addEventListener('click', () => {
        showLoginScreen();
        showToast('Sessão encerrada', 'success');
    });

    // Login Form
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';

        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Erro ao fazer login');
            }

            // Save session
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentToken = data.token;
            currentUser = data.user;

            showPanelForRole(currentUser.role);
            showToast(`Bem-vindo, ${currentUser.nome}!`, 'success');
            loginForm.reset();
        } catch (err) {
            loginError.innerText = err.message;
            loginError.style.display = 'block';
        }
    });

    // Admin Navigation Tabs
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-target');
            switchAdminTab(target);
        });
    });

    // Modal Events
    closeModalBtn.addEventListener('click', () => saleModal.style.display = 'none');
    cancelSaleBtn.addEventListener('click', () => saleModal.style.display = 'none');
    
    // Toggle Pix details in sell modal
    for (const radio of paymentMethodRadios) {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'pix') {
                pixPaymentArea.style.display = 'block';
            } else {
                pixPaymentArea.style.display = 'none';
            }
        });
    }

    // Sell Ticket Form Submit
    sellTicketForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cartelaId = modalTicketId.value;
        const cName = clientName.value;
        const cPhone = clientPhone.value;
        const payment = document.querySelector('input[name="paymentMethod"]:checked').value;

        try {
            const res = await fetch(`${API_BASE}/vendedor/vender`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({
                    cartela_id: cartelaId,
                    cliente_nome: cName,
                    cliente_telefone: cPhone,
                    metodo_pagamento: payment
                })
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Erro ao realizar venda');
            }

            showToast(data.message, 'success');
            saleModal.style.display = 'none';
            sellTicketForm.reset();
            
            // Reload seller data
            loadSellerTickets();
            loadSellerSalesToday();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Seller Search
    const sellerSearchInput = document.getElementById('sellerSearchInput');
    const sellerSearchBtn = document.getElementById('sellerSearchBtn');
    
    sellerSearchBtn.addEventListener('click', () => loadSellerTickets(sellerSearchInput.value));
    sellerSearchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') loadSellerTickets(sellerSearchInput.value);
    });

    // Admin Seller Form
    const newSellerForm = document.getElementById('newSellerForm');
    newSellerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sellerError = document.getElementById('sellerError');
        const sellerSuccess = document.getElementById('sellerSuccess');
        sellerError.style.display = 'none';
        sellerSuccess.style.display = 'none';

        const nome = document.getElementById('sellerName').value;
        const telefone = document.getElementById('sellerPhone').value;
        const username = document.getElementById('sellerUsername').value;
        const password = document.getElementById('sellerPassword').value;

        try {
            const res = await fetch(`${API_BASE}/admin/vendedores`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ nome, telefone, username, password })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar vendedor');

            sellerSuccess.innerText = data.message;
            sellerSuccess.style.display = 'block';
            newSellerForm.reset();
            loadVendedores();
        } catch (err) {
            sellerError.innerText = err.message;
            sellerError.style.display = 'block';
        }
    });

    // Bulk Generate Tickets
    const bulkGenerateForm = document.getElementById('bulkGenerateForm');
    bulkGenerateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data_sorteio = document.getElementById('bulkDate').value;
        const quantidade = document.getElementById('bulkQty').value;
        const prefixo = document.getElementById('bulkPrefix').value;
        const vendedor_id = document.getElementById('bulkSeller').value;

        try {
            const res = await fetch(`${API_BASE}/admin/cartelas/gerar-lote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ data_sorteio, quantidade: parseInt(quantidade), prefixo, vendedor_id: parseInt(vendedor_id) })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao gerar cartelas');

            showToast(data.message, 'success');
            bulkGenerateForm.reset();
            loadAdminTickets();
            loadAdminDashboard();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Single Ticket Form
    const singleTicketForm = document.getElementById('singleTicketForm');
    singleTicketForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const numero_cartela = document.getElementById('singleNumber').value;
        const data_sorteio = document.getElementById('singleDate').value;
        const valor = document.getElementById('singleValue').value;
        const milhar1 = document.getElementById('milhar1').value;
        const milhar2 = document.getElementById('milhar2').value;
        const milhar3 = document.getElementById('milhar3').value;
        const milhar4 = document.getElementById('milhar4').value;
        const vendedor_id = document.getElementById('singleSeller').value;

        try {
            const res = await fetch(`${API_BASE}/admin/cartelas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ 
                    numero_cartela, 
                    data_sorteio, 
                    valor: parseFloat(valor), 
                    milhar1, 
                    milhar2, 
                    milhar3, 
                    milhar4, 
                    vendedor_id: parseInt(vendedor_id) 
                })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao criar cartela');

            showToast(data.message, 'success');
            singleTicketForm.reset();
            // Resets valor to default 2.00
            document.getElementById('singleValue').value = '2.00';
            loadAdminTickets();
            loadAdminDashboard();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Filter Admin Tickets
    const filterTicketsBtn = document.getElementById('filterTicketsBtn');
    filterTicketsBtn.addEventListener('click', loadAdminTickets);

    // Pix Settings Form Submit
    const pixSettingsForm = document.getElementById('pixSettingsForm');
    pixSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pixSuccess = document.getElementById('pixSuccess');
        pixSuccess.style.display = 'none';

        const key = document.getElementById('pixKey').value;
        const qrcodeInput = document.getElementById('pixQrCode');

        const formData = new FormData();
        formData.append('chave', key);
        if (qrcodeInput.files[0]) {
            formData.append('qrcode', qrcodeInput.files[0]);
        }

        try {
            const res = await fetch(`${API_BASE}/admin/pix-settings`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                },
                body: formData
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao atualizar Pix');

            pixSuccess.innerText = data.message;
            pixSuccess.style.display = 'block';
            
            // Reload Pix config
            loadPixSettings();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Launch draw result
    const drawResultForm = document.getElementById('drawResultForm');
    drawResultForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const drawError = document.getElementById('drawError');
        const drawSuccess = document.getElementById('drawSuccess');
        drawError.style.display = 'none';
        drawSuccess.style.display = 'none';

        const data_sorteio = document.getElementById('drawDate').value;
        const milhar_sorteada = document.getElementById('drawMilhar').value;

        try {
            const res = await fetch(`${API_BASE}/admin/resultado`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ data_sorteio, milhar_sorteada })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao registrar resultado');

            drawSuccess.innerText = `${data.message} ${data.premiadas} cartela(s) premiada(s)!`;
            drawSuccess.style.display = 'block';
            drawResultForm.reset();
            
            loadAdminDashboard();
            loadDrawHistory();
        } catch (err) {
            drawError.innerText = err.message;
            drawError.style.display = 'block';
        }
    });
}

// Switch between Admin Tabs
async function switchAdminTab(targetId) {
    const panels = document.querySelectorAll('.tab-pane');
    panels.forEach(p => p.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');

    // Load specific tab data
    if (targetId === 'adminDashboardTab') {
        loadAdminDashboard();
    } else if (targetId === 'adminSellersTab') {
        loadVendedores();
    } else if (targetId === 'adminTicketsTab') {
        await loadSellersSelects();
        loadAdminTickets();
    } else if (targetId === 'adminPixTab') {
        loadPixSettings();
        loadPixPendentes();
    } else if (targetId === 'adminDrawsTab') {
        loadDrawHistory();
    } else if (targetId === 'adminReportsTab') {
        loadReports();
    }
}

// Populate Vendedor Options in Cartelas forms
async function loadSellersSelects() {
    try {
        const res = await fetch(`${API_BASE}/admin/vendedores`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        const singleSelect = document.getElementById('singleSeller');
        const bulkSelect = document.getElementById('bulkSeller');
        
        singleSelect.innerHTML = '<option value="">Selecione...</option>';
        bulkSelect.innerHTML = '<option value="">Selecione...</option>';
        
        data.filter(v => v.ativo).forEach(v => {
            const opt = `<option value="${v.vendedor_id}">${v.nome}</option>`;
            singleSelect.innerHTML += opt;
            bulkSelect.innerHTML += opt;
        });
    } catch (err) {
        console.error('Erro ao carregar vendedores para os formulários', err);
    }
}

// API Loader Functions

// Admin: Dashboard
async function loadAdminDashboard() {
    try {
        const res = await fetch(`${API_BASE}/admin/dashboard`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        document.getElementById('dashTotalCartelas').innerText = data.totalCartelas;
        document.getElementById('dashCartelasVendidas').innerText = data.cartelasVendidas;
        document.getElementById('dashCartelasDisponiveis').innerText = data.cartelasDisponiveis;
        document.getElementById('dashCartelasPremiadas').innerText = data.cartelasPremiadas;
        
        document.getElementById('dashFaturamento').innerText = formatCurrency(data.faturamento);
        document.getElementById('dashPixPendente').innerHTML = `${formatCurrency(data.pixPendentesTotal)} (<span id="dashPixPendenteCount">${data.pixPendentesCount}</span>)`;
    } catch (err) {
        showToast('Erro ao carregar dashboard', 'danger');
    }
}

// Admin: Sellers (List/Toggle)
async function loadVendedores() {
    try {
        const res = await fetch(`${API_BASE}/admin/vendedores`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        const list = document.getElementById('vendedoresList');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Nenhum vendedor cadastrado.</td></tr>`;
            return;
        }

        data.forEach(v => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${v.nome}</strong></td>
                <td>${v.username}</td>
                <td>${v.telefone || '-'}</td>
                <td>
                    <span class="badge ${v.ativo ? 'badge-ativo' : 'badge-inativo'}">
                        ${v.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td>
                    <label class="switch">
                        <input type="checkbox" ${v.ativo ? 'checked' : ''} onchange="toggleSeller(${v.vendedor_id}, this.checked)">
                        <span class="slider"></span>
                    </label>
                </td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        showToast('Erro ao carregar vendedores', 'danger');
    }
}

async function toggleSeller(vendedorId, active) {
    try {
        const res = await fetch(`${API_BASE}/admin/vendedores/toggle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ vendedor_id: vendedorId, ativo: active ? 1 : 0 })
        });
        if (!res.ok) throw new Error();
        showToast('Status do vendedor atualizado', 'success');
        loadVendedores();
    } catch (err) {
        showToast('Erro ao mudar status do vendedor', 'danger');
        loadVendedores(); // Refresh to undo toggle state
    }
}

// Admin: Tickets
async function loadAdminTickets() {
    const search = document.getElementById('ticketSearch').value;
    const status = document.getElementById('ticketStatusFilter').value;
    const date = document.getElementById('ticketDateFilter').value;

    let url = `${API_BASE}/admin/cartelas?`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (status) url += `status=${status}&`;
    if (date) url += `data_sorteio=${date}&`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        const list = document.getElementById('ticketsListAdmin');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Nenhuma cartela encontrada.</td></tr>`;
            return;
        }

        data.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong class="text-danger">${c.numero_cartela}</strong></td>
                <td>${formatDate(c.data_sorteio)}</td>
                <td><strong>${c.vendedor_nome || 'Não atribuído'}</strong></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <span class="milhar-num" style="font-size: 0.85rem; padding: 2px 6px;">${c.milhar1}</span>
                        <span class="milhar-num" style="font-size: 0.85rem; padding: 2px 6px;">${c.milhar2}</span>
                        <span class="milhar-num" style="font-size: 0.85rem; padding: 2px 6px;">${c.milhar3}</span>
                        <span class="milhar-num" style="font-size: 0.85rem; padding: 2px 6px;">${c.milhar4}</span>
                    </div>
                </td>
                <td>${formatCurrency(c.valor)}</td>
                <td><span class="badge badge-${c.status}">${c.status}</span></td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        showToast('Erro ao carregar cartelas', 'danger');
    }
}

// Admin: Pix Settings
async function loadPixSettings() {
    try {
        const res = await fetch(`${API_BASE}/admin/pix-settings`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        document.getElementById('pixKey').value = data.chave;
        
        // Add cache busting timestamp to redraw
        document.getElementById('adminPixQrPreview').src = `${data.qrCodeUrl}`;
        // Cache globally for modals
        modalPixKey.innerText = data.chave;
        modalPixQr.src = data.qrCodeUrl;
    } catch (err) {
        console.error(err);
    }
}

// Admin: Pending Pix
async function loadPixPendentes() {
    try {
        const res = await fetch(`${API_BASE}/admin/pix-pendentes`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        const list = document.getElementById('pixPendentesList');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Nenhum Pix pendente de confirmação.</td></tr>`;
            return;
        }

        data.forEach(v => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${v.numero_cartela}</strong> <span class="text-muted">(${formatDate(v.data_sorteio)})</span></td>
                <td><strong>${v.cliente_nome}</strong><br><small>${v.cliente_telefone}</small></td>
                <td>${v.vendedor_nome}</td>
                <td><strong>${formatCurrency(v.valor_venda)}</strong></td>
                <td>${formatDateTime(v.data_venda)}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="confirmarPix(${v.venda_id})">
                        <i class="fa-solid fa-check"></i> Confirmar
                    </button>
                </td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        showToast('Erro ao carregar Pix pendentes', 'danger');
    }
}

async function confirmarPix(vendaId) {
    if (!confirm('Deseja realmente confirmar o pagamento desta venda via Pix?')) return;
    try {
        const res = await fetch(`${API_BASE}/admin/confirmar-pix/${vendaId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        showToast(data.message, 'success');
        loadPixPendentes();
        loadAdminDashboard();
    } catch (err) {
        showToast('Erro ao confirmar Pix', 'danger');
    }
}

// Admin: Draws History
async function loadDrawHistory() {
    try {
        const res = await fetch(`${API_BASE}/admin/relatorios`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        const list = document.getElementById('drawHistoryList');
        list.innerHTML = '';

        if (data.resultados.length === 0) {
            list.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Nenhum sorteio registrado ainda.</td></tr>`;
            return;
        }

        data.resultados.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${formatDate(r.data_sorteio)}</strong></td>
                <td><span class="milhar-num" style="border-left-color: var(--primary); font-size: 1.2rem; padding: 4px 10px;">${r.milhar_sorteada}</span></td>
                <td>${formatDateTime(r.data_cadastro)}</td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
    }
}

// Admin: Reports
async function loadReports() {
    try {
        const res = await fetch(`${API_BASE}/admin/relatorios`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        // 1. Report Daily
        const dailyList = document.getElementById('reportDailyList');
        dailyList.innerHTML = '';
        if (data.porDia.length === 0) {
            dailyList.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Nenhuma venda faturada.</td></tr>`;
        } else {
            data.porDia.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${formatDate(r.data)}</strong></td>
                    <td>${r.quantidade}</td>
                    <td><strong class="text-success">${formatCurrency(r.total)}</strong></td>
                `;
                dailyList.appendChild(tr);
            });
        }

        // 2. Report Seller
        const sellerList = document.getElementById('reportSellerList');
        sellerList.innerHTML = '';
        if (data.porVendedor.length === 0) {
            sellerList.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Nenhuma venda faturada.</td></tr>`;
        } else {
            data.porVendedor.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${r.vendedor_nome}</strong></td>
                    <td>${r.quantidade}</td>
                    <td><strong class="text-success">${formatCurrency(r.total)}</strong></td>
                `;
                sellerList.appendChild(tr);
            });
        }
    } catch (err) {
        showToast('Erro ao carregar relatórios', 'danger');
    }
}

// --- SELLER API CALLS ---

// Seller: Load Available Tickets
async function loadSellerTickets(search = '') {
    let url = `${API_BASE}/vendedor/cartelas`;
    if (search) url += `?search=${encodeURIComponent(search)}`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        const grid = document.getElementById('sellerTicketsGrid');
        grid.innerHTML = '';

        if (data.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">Nenhuma cartela disponível.</div>`;
            return;
        }

        data.forEach(c => {
            const card = document.createElement('div');
            card.className = 'ticket-card';
            card.innerHTML = `
                <div>
                    <div class="ticket-num-header">
                        <span class="ticket-number">Nº ${c.numero_cartela}</span>
                        <span class="ticket-date"><i class="fa-regular fa-calendar"></i> Sorteio: ${formatDate(c.data_sorteio)}</span>
                    </div>
                    <div class="milhares-box">
                        <div class="milhar-num">${c.milhar1}</div>
                        <div class="milhar-num">${c.milhar2}</div>
                        <div class="milhar-num">${c.milhar3}</div>
                        <div class="milhar-num">${c.milhar4}</div>
                    </div>
                </div>
                <div class="ticket-footer">
                    <span class="ticket-price">${formatCurrency(c.valor)}</span>
                    <button class="btn btn-primary btn-sm" onclick="openSaleModal(${c.id}, '${c.numero_cartela}')">
                        <i class="fa-solid fa-cart-plus"></i> Vender
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (err) {
        showToast('Erro ao carregar cartelas disponíveis', 'danger');
    }
}

// Seller: Open Sale Modal
function openSaleModal(ticketId, ticketNumber) {
    modalTicketId.value = ticketId;
    modalTicketNumber.innerText = ticketNumber;
    
    // Set Pix key details
    loadPixSettings();

    // Reset Form
    sellTicketForm.reset();
    pixPaymentArea.style.display = 'none'; // radio default Dinheiro
    
    // Show Modal
    saleModal.style.display = 'flex';
}

// Seller: Load Sales Today
async function loadSellerSalesToday() {
    try {
        const res = await fetch(`${API_BASE}/vendedor/vendas-dia`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        const list = document.getElementById('sellerSalesList');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Nenhuma venda realizada hoje.</td></tr>`;
            return;
        }

        data.forEach(v => {
            let statusText = '';
            let badgeClass = '';
            
            if (v.pagamento_status === 'pago') {
                statusText = v.metodo === 'pix' ? 'Pix Confirmado' : 'Pago (Dinheiro)';
                badgeClass = 'badge-ativo';
            } else {
                statusText = 'Pix Pendente';
                badgeClass = 'badge-vendida';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong class="text-danger">#${v.numero_cartela}</strong></td>
                <td><strong>${v.cliente_nome}</strong></td>
                <td><span style="text-transform: capitalize;">${v.metodo}</span></td>
                <td><span class="badge ${badgeClass}">${statusText}</span></td>
                <td><strong>${formatCurrency(v.valor_venda)}</strong></td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
    }
}

// Formatting Utils
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    // dateStr is YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    const date = new Date(isoStr);
    return date.toLocaleString('pt-BR');
}

// Toast Helper
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'flex';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}
