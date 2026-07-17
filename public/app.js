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

// Form Elements
const milharSaleForm = document.getElementById('milharSaleForm');
const milharesInputsContainer = document.getElementById('milharesInputsContainer');
const milharSummary = document.getElementById('milharSummary');
const addMilharesBtn = document.getElementById('addMilharesBtn');
const vendaPixArea = document.getElementById('vendaPixArea');
const vendaModalPixQr = document.getElementById('vendaModalPixQr');
const vendaModalPixKey = document.getElementById('vendaModalPixKey');
const vendaPaymentRadios = document.getElementsByName('vendaPaymentMethod');

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
        switchSellerTab('sellerVenderTab');
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
                let msg = data.error || 'Erro ao fazer login';
                if (data.tentativasRestantes !== undefined && data.tentativasRestantes > 0) {
                    msg += ` (${data.tentativasRestantes} tentativa(s) restante(s))`;
                }
                throw new Error(msg);
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

    // Cupom Modal
    document.getElementById('closeCupomBtn').addEventListener('click', () => document.getElementById('cupomModal').style.display = 'none');
    document.getElementById('closeCupomBtn2').addEventListener('click', () => document.getElementById('cupomModal').style.display = 'none');
    document.getElementById('saveJpgBtn').addEventListener('click', salvarCupomJpg);
    document.getElementById('printCupomBtn').addEventListener('click', () => {
        const content = document.getElementById('cupomPrintable').innerHTML;
        const win = window.open('', '', 'width=420,height=600');
        win.document.write(`
            <html><head><title>Cupom</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; width: 58mm; }
                .cupom-header { text-align: center; margin-bottom: 10px; }
                .cupom-logo { font-size: 16px; font-weight: 800; }
                .cupom-title { color: #dc2626; }
                .cupom-subtitle { display: block; font-size: 11px; font-weight: 700; margin-top: 2px; letter-spacing: 1px; }
                .cupom-info { margin-bottom: 8px; }
                .cupom-row { display: flex; justify-content: space-between; padding: 2px 0; }
                .cupom-label { font-weight: 600; }
                .cupom-cartela { border: 1px dashed #999; padding: 5px; margin-bottom: 6px; text-align: center; }
                .cupom-cartela-num { font-weight: 700; font-size: 11px; }
                .cupom-milhares { display: flex; gap: 4px; justify-content: center; margin-top: 3px; flex-wrap: wrap; }
                .cupom-milhar { background: #f0f0f0; padding: 1px 5px; font-weight: 700; font-size: 12px; border-radius: 2px; }
                .cupom-total { font-size: 13px; border-top: 2px solid #000; padding-top: 5px; }
                .cupom-footer { margin-top: 8px; }
                .gold-glow { color: #f59e0b; }
                .accent { color: #dc2626; }
                hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
                @media print { body { padding: 3px; } }
    </style></head><body>
        <div class="cupom">${content}</div>
        <div style="text-align:center;margin-top:8px;font-size:9px;color:#666;">Obrigado pela preferência!</div>
        <script>window.onload = function() { window.print(); window.close(); } <\/script>
    </body></html>
    `);
        win.document.close();
    });

    // Seller Navigation Tabs
    const sellerTabs = document.querySelectorAll('.seller-tab');
    sellerTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            sellerTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-sellertarget');
            switchSellerTab(target);
        });
    });

    // Toggle Pix details in venda form
    for (const radio of vendaPaymentRadios) {
        radio.addEventListener('change', (e) => {
            vendaPixArea.style.display = e.target.value === 'pix' ? 'block' : 'none';
        });
    }

    // Random milhares button
    const randomMilharesBtn = document.getElementById('randomMilharesBtn');
    randomMilharesBtn.addEventListener('click', () => {
        fillRandomMilhares('#milharesInputsContainer');
    });

    // Milhar Sale Form Submit
    milharSaleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data_sorteio = document.getElementById('vendaDataSorteio').value;
        const cName = document.getElementById('vendaClienteNome').value;
        const cPhone = document.getElementById('vendaClienteTelefone').value;
        const payment = document.querySelector('input[name="vendaPaymentMethod"]:checked').value;

        const inputs = document.querySelectorAll('.milhar-input');
        const milhares = [];
        for (const inp of inputs) {
            const val = inp.value.trim();
            if (val) milhares.push(val);
        }

        if (milhares.length !== 4) {
            showToast('Digite exatamente 4 milhares para realizar a venda.', 'danger');
            return;
        }
        for (const m of milhares) {
            if (!/^\d{4}$/.test(m)) {
                showToast(`Milhar inválido: "${m}". Cada milhar deve ter 4 dígitos.`, 'danger');
                return;
            }
        }

        try {
            const res = await fetch(`${API_BASE}/vendedor/vender-milhares`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({
                    milhares,
                    data_sorteio,
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
            showCupom(data);
            milharSaleForm.reset();
            initMilharSaleForm();
            loadSellerSalesToday();
            loadPixSettings();
        } catch (err) {
            showToast(err.message, 'danger');
        }
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

    // Admin Milhar Sale Form
    const admMilharSaleForm = document.getElementById('adminMilharSaleForm');
    const admAddMilharesBtn = document.getElementById('admAddMilharesBtn');
    const admVendaPaymentRadios = document.getElementsByName('admVendaPaymentMethod');

    for (const radio of admVendaPaymentRadios) {
        radio.addEventListener('change', (e) => {
            document.getElementById('admVendaPixArea').style.display = e.target.value === 'pix' ? 'block' : 'none';
        });
    }

    const admRandomMilharesBtn = document.getElementById('admRandomMilharesBtn');
    admRandomMilharesBtn.addEventListener('click', () => {
        fillRandomMilhares('#admMilharesInputsContainer');
        updateAdminMilharSummary();
    });

    admMilharSaleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data_sorteio = document.getElementById('admVendaDataSorteio').value;
        const cName = document.getElementById('admVendaClienteNome').value;
        const cPhone = document.getElementById('admVendaClienteTelefone').value;
        const payment = document.querySelector('input[name="admVendaPaymentMethod"]:checked').value;

        const inputs = document.querySelectorAll('#admMilharesInputsContainer .milhar-input');
        const milhares = [];
        for (const inp of inputs) {
            const val = inp.value.trim();
            if (val) milhares.push(val);
        }

        if (milhares.length !== 4) {
            showToast('Digite exatamente 4 milhares para realizar a venda.', 'danger');
            return;
        }
        for (const m of milhares) {
            if (!/^\d{4}$/.test(m)) {
                showToast(`Milhar inválido: "${m}".`, 'danger');
                return;
            }
        }

        try {
            const res = await fetch(`${API_BASE}/admin/vender-milhares`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({
                    milhares,
                    data_sorteio,
                    cliente_nome: cName,
                    cliente_telefone: cPhone,
                    metodo_pagamento: payment
                })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao realizar venda');

            showToast(data.message, 'success');
            showCupom(data);
            admMilharSaleForm.reset();
            initAdminMilharSaleForm();
            loadAdminDashboard();
            loadPixSettings();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

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

    // Admin Vendas Filter
    const vendasFilterBtn = document.getElementById('vendasFilterBtn');
    if (vendasFilterBtn) {
        vendasFilterBtn.addEventListener('click', loadAdminVendas);
    }
    const vendasSearch = document.getElementById('vendasSearch');
    if (vendasSearch) {
        vendasSearch.addEventListener('keyup', (e) => { if (e.key === 'Enter') loadAdminVendas(); });
    }

    // Seller Vendas Filter
    const vendasFilterBtnS = document.getElementById('sellerVendasFilterBtn');
    if (vendasFilterBtnS) {
        vendasFilterBtnS.addEventListener('click', loadSellerVendas);
    }
    const vendasSearchS = document.getElementById('sellerVendasSearch');
    if (vendasSearchS) {
        vendasSearchS.addEventListener('keyup', (e) => { if (e.key === 'Enter') loadSellerVendas(); });
    }

    // Export XLS buttons
    document.getElementById('exportAdminVendasBtn')?.addEventListener('click', () => exportVendasXls('vendasListAdmin', 'vendas-admin'));


    // Ranking filter
    document.getElementById('rankingFilterBtn')?.addEventListener('click', loadRanking);

    // Valor sorteio
    document.getElementById('saveValorBtn')?.addEventListener('click', saveValorSorteio);
    document.getElementById('acumularValorBtn')?.addEventListener('click', acumularPremio);

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
        initAdminMilharSaleForm();
    } else if (targetId === 'adminPixTab') {
        loadPixSettings();
        loadPixPendentes();
    } else if (targetId === 'adminDrawsTab') {
        loadDrawHistory();
    } else if (targetId === 'adminVendasTab') {
        await loadSellersSelects();
        loadAdminVendas();
    } else if (targetId === 'adminReportsTab') {
        loadReports();
    } else if (targetId === 'adminBloqueiosTab') {
        loadBlockedMilhares();
        initBlockMilharForm();
    } else if (targetId === 'adminRankingTab') {
        loadRanking();
    } else if (targetId === 'adminValorTab') {
        loadValorSorteio();
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
        
        const vendasVendedorFilter = document.getElementById('vendasVendedorFilter');
        if (vendasVendedorFilter) {
            vendasVendedorFilter.innerHTML = '<option value="">Todos os vendedores</option>';
            data.forEach(v => {
                vendasVendedorFilter.innerHTML += `<option value="${v.vendedor_id}">${v.nome}</option>`;
            });
        }
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

        document.getElementById('dashValorVendidoHoje').innerText = formatCurrency(data.valorVendidoHoje || 0);
        document.getElementById('dashValorRecebidoHoje').innerText = formatCurrency(data.valorRecebidoHoje || 0);
        document.getElementById('dashValorPendente').innerText = formatCurrency(data.valorPendente || 0);
        document.getElementById('dashCartelasVendidas').innerText = data.cartelasVendidas || 0;
        document.getElementById('dashCartelasPremiadas').innerText = data.cartelasPremiadas || 0;
        document.getElementById('dashVendedoresAtivos').innerText = data.vendedoresAtivos || 0;
        document.getElementById('dashTicketMedio').innerText = formatCurrency(data.ticketMedio || 0);
        document.getElementById('dashLucroDoDia').innerText = formatCurrency(data.lucroDoDia || 0);

        // Load prize value
        try {
            const premioRes = await fetch(`${API_BASE}/admin/valor-premio`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            if (premioRes.ok) {
                const premioData = await premioRes.json();
                document.getElementById('dashPremioAtual').innerText = formatCurrency(premioData.valor_premio);
            }
        } catch {}
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
                    <button class="btn btn-secondary btn-sm" style="margin-left:8px" onclick="alterarSenhaVendedor(${v.vendedor_id}, ${v.usuario_id})" title="Alterar senha">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="deleteSeller(${v.vendedor_id})" title="Excluir vendedor">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        showToast('Erro ao carregar vendedores', 'danger');
    }
}

async function alterarSenhaVendedor(vendedorId, usuarioId) {
    const novaSenha = prompt('Digite a nova senha para este vendedor (mínimo 4 caracteres):');
    if (!novaSenha || novaSenha.length < 4) {
        if (novaSenha) showToast('A senha deve ter no mínimo 4 caracteres', 'danger');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/admin/alterar-senha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ usuario_id: usuarioId, nova_senha: novaSenha })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao alterar senha');
        showToast('Senha alterada com sucesso!', 'success');
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function deleteSeller(vendedorId) {
    if (!confirm('Tem certeza que deseja excluir este vendedor? Todas as vendas associadas serão removidas e as cartelas ficarão sem vendedor.')) return;
    try {
        const res = await fetch(`${API_BASE}/admin/vendedores/${vendedorId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao excluir vendedor');
        showToast(data.message, 'success');
        loadVendedores();
    } catch (err) {
        showToast(err.message, 'danger');
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
        // Update seller form Pix details
        vendaModalPixKey.innerText = data.chave;
        vendaModalPixQr.src = data.qrCodeUrl;
        // Update admin form Pix details
        const admPixKey = document.getElementById('admModalPixKey');
        const admPixQr = document.getElementById('admModalPixQr');
        if (admPixKey) admPixKey.innerText = data.chave;
        if (admPixQr) admPixQr.src = data.qrCodeUrl;
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
// ─── Ranking ──────────────────────────────────────────────────────
async function loadRanking() {
    const monthPicker = document.getElementById('rankingMonth');
    if (!monthPicker.value) {
        const now = new Date();
        monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    const [ano, mes] = monthPicker.value.split('-');

    try {
        const res = await fetch(`${API_BASE}/admin/ranking?mes=${mes}&ano=${ano}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error('Erro ao carregar ranking');
        const data = await res.json();

        const podiumEl = document.getElementById('rankingPodium');
        const listEl = document.getElementById('rankingList');

        if (!data.ranking || data.ranking.length === 0) {
            podiumEl.innerHTML = '<div class="empty-state">Nenhuma venda encontrada neste mês.</div>';
            listEl.innerHTML = '';
            return;
        }

        // Podium for top 3
        const top3 = data.ranking.slice(0, 3);
        const medals = ['🥇', '🥈', '🥉'];
        const colors = ['#ffd700', '#c0c0c0', '#cd7f32'];
        podiumEl.innerHTML = `<div class="podium">${top3.map((r, i) => `
            <div class="podium-item podium-${i + 1}" style="--podium-color:${colors[i]}">
                <div class="podium-medal">${medals[i]}</div>
                <div class="podium-nome">${r.nome}</div>
                <div class="podium-valor">R$ ${r.valor_vendido.toFixed(2)}</div>
                <div class="podium-cartelas">${r.cartelas_vendidas} cartela(s)</div>
            </div>
        `).join('')}</div>`;

        // Full table
        listEl.innerHTML = data.ranking.map(r => `<tr>
            <td><strong>${r.posicao}º</strong></td>
            <td>${r.nome}</td>
            <td>${r.cartelas_vendidas}</td>
            <td>R$ ${r.valor_vendido.toFixed(2)}</td>
            <td>R$ ${r.comissao.toFixed(2)}</td>
        </tr>`).join('');
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ─── Valor Sorteio ───────────────────────────────────────────────
function atualizarPremioDisplay(valor) {
    const el = document.getElementById('premioDisplayValue');
    if (el) el.textContent = `R$ ${parseFloat(valor).toFixed(2)}`;
}

async function loadValorSorteio() {
    try {
        const res = await fetch(`${API_BASE}/admin/valor-premio`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error('Erro ao carregar prêmio');
        const data = await res.json();
        document.getElementById('valorSorteioInput').value = data.valor_premio;
        document.getElementById('valorSavedMsg').style.display = 'none';
        atualizarPremioDisplay(data.valor_premio);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function saveValorSorteio() {
    const input = document.getElementById('valorSorteioInput');
    const valor = parseFloat(input.value);
    if (!valor || valor <= 0) {
        showToast('Informe um valor válido', 'danger');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/admin/valor-premio`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ valor_premio: valor })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erro ao salvar');
        }
        document.getElementById('valorSavedMsg').style.display = 'inline';
        setTimeout(() => document.getElementById('valorSavedMsg').style.display = 'none', 3000);
        atualizarPremioDisplay(valor);
        showToast('Prêmio atualizado com sucesso!', 'success');
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function acumularPremio() {
    const input = document.getElementById('valorSorteioInput');
    const atual = parseFloat(input.value) || 0;
    const novo = atual + 500;
    input.value = novo;
    try {
        const res = await fetch(`${API_BASE}/admin/valor-premio`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ valor_premio: novo })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erro ao acumular');
        }
        atualizarPremioDisplay(novo);
        showToast(`Prêmio acumulado! Novo valor: R$ ${novo.toFixed(2)}`, 'success');
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

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

// --- BLOQUEIOS ---
async function loadBlockedMilhares() {
    const data_sorteio = document.getElementById('blockFilterData')?.value || '';
    let url = `${API_BASE}/admin/milhares-bloqueados`;
    if (data_sorteio) url += `?data_sorteio=${data_sorteio}`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        if (!res.ok) {
            if (data.error === 'TABELA_AUSENTE') {
                document.getElementById('blockedMilharesList').innerHTML = `
                    <tr><td colspan="4" class="text-center">
                        <div class="alert alert-danger">
                            <strong>Tabela não encontrada!</strong><br>
                            Execute o SQL abaixo no Supabase SQL Editor:<br><br>
                            <code style="display:block;padding:10px;background:#f5f5f5;border-radius:4px;font-size:12px;word-break:break-all;">
CREATE TABLE IF NOT EXISTS milhares_bloqueados (<br>
&nbsp;&nbsp;id SERIAL PRIMARY KEY,<br>
&nbsp;&nbsp;milhar TEXT NOT NULL,<br>
&nbsp;&nbsp;data_sorteio TEXT NOT NULL,<br>
&nbsp;&nbsp;data_cadastro TEXT NOT NULL,<br>
&nbsp;&nbsp;UNIQUE(milhar, data_sorteio)<br>
);
                            </code>
                        </div>
                    </td></tr>`;
                return;
            }
            throw new Error();
        }

        const list = document.getElementById('blockedMilharesList');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Nenhum milhar bloqueado.</td></tr>`;
            return;
        }

        data.forEach(b => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong class="text-danger">${b.milhar}</strong></td>
                <td>${formatDate(b.data_sorteio)}</td>
                <td><small>${formatDateTime(b.data_cadastro)}</small></td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="desbloquearMilhar(${b.id})">
                        <i class="fa-solid fa-unlock"></i> Desbloquear
                    </button>
                </td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        showToast('Erro ao carregar bloqueios', 'danger');
    }
}

function initBlockMilharForm() {
    const form = document.getElementById('blockMilharForm');
    if (!form) return;
    document.getElementById('blockMilharData').value = new Date().toISOString().split('T')[0];

    const filterBtn = document.getElementById('blockFilterBtn');
    if (filterBtn) {
        filterBtn.onclick = (e) => {
            e.preventDefault();
            loadBlockedMilhares();
        };
    }
    const filterData = document.getElementById('blockFilterData');
    if (filterData) {
        filterData.onkeyup = (e) => { if (e.key === 'Enter') loadBlockedMilhares(); };
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const milhar = document.getElementById('blockMilharInput').value.trim();
        const data_sorteio = document.getElementById('blockMilharData').value;

        if (!milhar || !/^\d{4}$/.test(milhar)) {
            showToast('Digite um milhar válido de 4 dígitos', 'danger');
            return;
        }
        if (!data_sorteio) {
            showToast('Selecione a data do sorteio', 'danger');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/admin/bloquear-milhar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
                body: JSON.stringify({ milhar, data_sorteio })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao bloquear');
            showToast(data.message, 'success');
            document.getElementById('blockMilharInput').value = '';
            loadBlockedMilhares();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    };
}

async function desbloquearMilhar(id) {
    if (!confirm('Remover bloqueio deste milhar?')) return;
    try {
        const res = await fetch(`${API_BASE}/admin/milhares-bloqueados/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        showToast('Bloqueio removido!', 'success');
        loadBlockedMilhares();
    } catch (err) {
        showToast('Erro ao desbloquear', 'danger');
    }
}

// --- SELLER API CALLS ---

// Seller: Init Milhar Sale Form
function initMilharSaleForm() {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    document.getElementById('vendaDataSorteio').value = amanha.toISOString().split('T')[0];
    milharesInputsContainer.innerHTML = '';
    addMilharInputs(0, 4);
    updateMilharSummary();
    vendaPixArea.style.display = 'none';
    loadPixSettings();
}

function addMilharInputs(startIndex, count) {
    for (let i = 0; i < count; i++) {
        const idx = startIndex + i;
        const wrapper = document.createElement('div');
        wrapper.className = 'milhar-input-wrapper';
        const label = document.createElement('label');
        label.className = 'milhar-label';
        label.innerText = `${idx + 1}º`;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'milhar-input';
        input.maxLength = 4;
        input.minLength = 4;
        input.placeholder = '0000';
        input.inputMode = 'numeric';
        input.pattern = '\\d{4}';
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            updateMilharSummary();
        });
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        milharesInputsContainer.appendChild(wrapper);
    }
}

function updateMilharSummary() {
    const inputs = document.querySelectorAll('.milhar-input');
    let filled = 0;
    for (const inp of inputs) {
        if (inp.value.trim().length === 4) filled++;
    }
    const totalInputs = inputs.length;
    const cartelas = totalInputs / 4;
    const isValid = totalInputs % 4 === 0 && totalInputs > 0;
    document.getElementById('milharSummary').innerHTML = `
        <span>${totalInputs} milhar(es) = ${cartelas} cartela(s) ${filled !== totalInputs ? `<span class="text-muted">(${filled} preenchido(s))</span>` : '<span class="text-success">✓ completo</span>'}</span>
        ${!isValid ? '<span class="text-warning" style="margin-left:8px;">A quantidade deve ser múltipla de 4</span>' : ''}
    `;
}

// --- ADMIN MILHAR SALE FUNCTIONS ---

function initAdminMilharSaleForm() {
    const el = document.getElementById('admVendaDataSorteio');
    if (el) el.value = new Date().toISOString().split('T')[0];
    const container = document.getElementById('admMilharesInputsContainer');
    if (container) {
        container.innerHTML = '';
        addAdminMilharInputs(0, 4);
        updateAdminMilharSummary();
    }
    const pixArea = document.getElementById('admVendaPixArea');
    if (pixArea) pixArea.style.display = 'none';
    loadPixSettings();
}

function addAdminMilharInputs(startIndex, count) {
    const container = document.getElementById('admMilharesInputsContainer');
    if (!container) return;
    for (let i = 0; i < count; i++) {
        const idx = startIndex + i;
        const wrapper = document.createElement('div');
        wrapper.className = 'milhar-input-wrapper';
        const label = document.createElement('label');
        label.className = 'milhar-label';
        label.innerText = `${idx + 1}º`;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'milhar-input';
        input.maxLength = 4;
        input.minLength = 4;
        input.placeholder = '0000';
        input.inputMode = 'numeric';
        input.pattern = '\\d{4}';
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            updateAdminMilharSummary();
        });
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        container.appendChild(wrapper);
    }
}

function fillRandomMilhares(containerSelector) {
    const inputs = document.querySelectorAll(`${containerSelector} .milhar-input`);
    for (const inp of inputs) {
        if (!inp.value || inp.value.length !== 4) {
            inp.value = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        }
    }
    const sellerSummary = document.getElementById('milharSummary');
    const adminSummary = document.getElementById('admMilharSummary');
    if (sellerSummary && containerSelector === '#milharesInputsContainer') updateMilharSummary();
    if (adminSummary && containerSelector === '#admMilharesInputsContainer') updateAdminMilharSummary();
}

function updateAdminMilharSummary() {
    const inputs = document.querySelectorAll('#admMilharesInputsContainer .milhar-input');
    let filled = 0;
    for (const inp of inputs) {
        if (inp.value.trim().length === 4) filled++;
    }
    const totalInputs = inputs.length;
    const cartelas = totalInputs / 4;
    const isValid = totalInputs % 4 === 0 && totalInputs > 0;
    const summary = document.getElementById('admMilharSummary');
    if (summary) {
        summary.innerHTML = `
            <span>${totalInputs} milhar(es) = ${cartelas} cartela(s) ${filled !== totalInputs ? `<span class="text-muted">(${filled} preenchido(s))</span>` : '<span class="text-success">✓ completo</span>'}</span>
            ${!isValid ? '<span class="text-warning" style="margin-left:8px;">A quantidade deve ser múltipla de 4</span>' : ''}
        `;
    }
}

// Seller: Switch Tabs
function switchSellerTab(targetId) {
    const panels = document.querySelectorAll('.seller-tab-pane');
    panels.forEach(p => p.classList.remove('active'));

    if (targetId === 'sellerVenderTab') {
        document.getElementById('sellerVenderTab').classList.add('active');
        initMilharSaleForm();
        loadSellerSalesToday();
    } else if (targetId === 'sellerDashboardTab') {
        document.getElementById('sellerDashboardTab').classList.add('active');
        loadSellerDashboard();
    } else if (targetId === 'sellerVendasTab') {
        document.getElementById('sellerVendasTab').classList.add('active');
        loadSellerVendas();
    }
}

// Seller: Load Dashboard
async function loadSellerDashboard() {
    try {
        const res = await fetch(`${API_BASE}/vendedor/dashboard`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        document.getElementById('sDashValorVendidoHoje').innerText = formatCurrency(data.hoje.valorTotal || 0);
        document.getElementById('sDashValorRecebidoHoje').innerText = formatCurrency(data.hoje.valorPago || 0);
        document.getElementById('sDashHojeQtd').innerText = `${data.hoje.quantidade} cartela(s)`;
        document.getElementById('sDashValorPendente').innerText = formatCurrency(data.hoje.valorPendente || 0);
        document.getElementById('sDashCartelasVendidas').innerText = data.hoje.quantidade || 0;

        const ticketMedio = data.hoje.quantidade > 0 ? data.hoje.valorTotal / data.hoje.quantidade : 0;
        document.getElementById('sDashTicketMedio').innerText = formatCurrency(ticketMedio);

        document.getElementById('sDashComissaoHoje').innerText = formatCurrency(data.hoje.comissao || 0);
        document.getElementById('sDashComissaoMes').innerText = formatCurrency(data.mes.comissao || 0);
        document.getElementById('sDashTotalVendidas').innerText = data.totalCartelasVendidas || 0;
    } catch (err) {
        showToast('Erro ao carregar dashboard', 'danger');
    }
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
            
            if (v.metodo === 'dinheiro') {
                statusText = 'Pago (Dinheiro)';
                badgeClass = 'badge-ativo';
            } else if (v.pagamento_status === 'pago') {
                statusText = 'Pix Confirmado';
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

// Admin: Vendas List
async function loadAdminVendas() {
    const search = document.getElementById('vendasSearch')?.value || '';
    const vendedor_id = document.getElementById('vendasVendedorFilter')?.value || '';
    const data_inicio = document.getElementById('vendasDataInicio')?.value || '';
    const data_fim = document.getElementById('vendasDataFim')?.value || '';

    let url = `${API_BASE}/admin/vendas?`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (vendedor_id) url += `vendedor_id=${vendedor_id}&`;
    if (data_inicio) url += `data_inicio=${data_inicio}&`;
    if (data_fim) url += `data_fim=${data_fim}&`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        const list = document.getElementById('vendasListAdmin');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Nenhuma venda encontrada.</td></tr>`;
            return;
        }

        data.forEach(v => {
            let statusText = v.metodo === 'dinheiro' ? 'Dinheiro' : (v.pagamento_status === 'pago' ? 'Pix OK' : 'Pix Pend.');
            let badgeClass = v.metodo === 'dinheiro' || v.pagamento_status === 'pago' ? 'badge-ativo' : 'badge-vendida';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${formatDateTime(v.data_venda)}</small></td>
                <td><strong class="text-danger">#${v.cartela?.numero_cartela || '-'}</strong></td>
                <td>
                    <div style="display:flex;gap:3px;">
                        ${(v.cartela?.milhares || []).map(m => `<span class="milhar-num" style="font-size:.75rem;padding:1px 5px;">${m}</span>`).join('')}
                    </div>
                </td>
                <td><strong>${v.cliente_nome || '-'}</strong><br><small>${v.cliente_telefone || ''}</small></td>
                <td>${v.vendedor_nome}</td>
                <td><strong>${formatCurrency(v.valor_venda)}</strong></td>
                <td><span class="badge ${badgeClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-sm btn-print" onclick="reprintCupom(${v.venda_id})" title="Reimprimir cupom">
                        <i class="fa-solid fa-print"></i>
                    </button>
                    <button class="btn btn-sm btn-jpg" onclick="salvarCupomJpgVenda(${v.venda_id})" title="Salvar JPG" style="margin-left:4px;">
                        <i class="fa-solid fa-image"></i>
                    </button>
                    ${v.pagamento_status !== 'pago' ? `<button class="btn btn-sm btn-success" onclick="confirmarPixVenda(${v.venda_id}, this)" title="Confirmar Pix" style="margin-left:4px;">
                        <i class="fa-solid fa-check"></i>
                    </button>` : ''}
                </td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        showToast('Erro ao carregar vendas', 'danger');
    }
}

async function confirmarPixVenda(vendaId, btn) {
    if (!confirm('Confirmar pagamento Pix desta venda?')) return;
    try {
        const res = await fetch(`${API_BASE}/admin/confirmar-pix/${vendaId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        showToast('Pagamento confirmado!', 'success');
        if (btn) {
            const tr = btn.closest('tr');
            if (tr) {
                const badge = tr.querySelector('.badge');
                if (badge) {
                    badge.className = 'badge badge-ativo';
                    badge.innerText = 'Pix OK';
                }
                btn.remove();
            }
        }
        loadAdminDashboard();
    } catch (err) {
        showToast('Erro ao confirmar Pix', 'danger');
    }
}

// Seller: Load Vendas
async function loadSellerVendas() {
    const search = document.getElementById('sellerVendasSearch')?.value || '';
    const data_inicio = document.getElementById('sellerVendasDataInicio')?.value || '';
    const data_fim = document.getElementById('sellerVendasDataFim')?.value || '';

    let url = `${API_BASE}/vendedor/vendas?`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (data_inicio) url += `data_inicio=${data_inicio}&`;
    if (data_fim) url += `data_fim=${data_fim}&`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        const list = document.getElementById('sellerVendasList');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Nenhuma venda encontrada.</td></tr>`;
            return;
        }

        data.forEach(v => {
            let statusText = v.metodo === 'dinheiro' ? 'Dinheiro' : (v.pagamento_status === 'pago' ? 'Pix OK' : 'Pix Pend.');
            let badgeClass = v.metodo === 'dinheiro' || v.pagamento_status === 'pago' ? 'badge-ativo' : 'badge-vendida';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${formatDateTime(v.data_venda)}</small></td>
                <td><strong class="text-danger">#${v.cartela?.numero_cartela || '-'}</strong></td>
                <td>
                    <div style="display:flex;gap:3px;">
                        ${(v.cartela?.milhares || []).map(m => `<span class="milhar-num" style="font-size:.75rem;padding:1px 5px;">${m}</span>`).join('')}
                    </div>
                </td>
                <td><strong>${v.cliente_nome || '-'}</strong><br><small>${v.cliente_telefone || ''}</small></td>
                <td><strong>${formatCurrency(v.valor_venda)}</strong></td>
                <td><span class="badge ${badgeClass}">${statusText}</span></td>
                <td>
                    <button class=\"btn btn-sm btn-print\" onclick=\"reprintCupom(${v.venda_id})\" title=\"Reimprimir cupom\">
                        <i class="fa-solid fa-print"></i>
                    </button>
                    <button class=\"btn btn-sm btn-jpg\" onclick=\"salvarCupomJpgVenda(${v.venda_id})\" title=\"Salvar JPG\" style=\"margin-left:4px;\">
                        <i class="fa-solid fa-image"></i>
                    </button>
                </td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        showToast('Erro ao carregar vendas', 'danger');
    }
}

async function salvarCupomJpgVenda(vendaId) {
    try {
        const role = currentUser?.role || 'vendedor';
        const endpoint = role === 'admin' ? `${API_BASE}/admin/vendas/${vendaId}/cupom` : `${API_BASE}/vendedor/vendas/${vendaId}/cupom`;
        const res = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        showCupom(data);
        setTimeout(() => salvarCupomJpg(), 500);
    } catch (err) {
        showToast('Erro ao carregar cupom', 'danger');
    }
}

async function reprintCupom(vendaId) {
    try {
        const role = currentUser?.role || 'vendedor';
        const endpoint = role === 'admin' ? `${API_BASE}/admin/vendas/${vendaId}/cupom` : `${API_BASE}/vendedor/vendas/${vendaId}/cupom`;
        const res = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        showCupom(data);
    } catch (err) {
        showToast('Erro ao carregar cupom', 'danger');
    }
}

// Cupom
function showCupom(data) {
    document.getElementById('cupomData').innerText = formatDateTime(data.data_venda);
    document.getElementById('cupomVendedor').innerText = data.vendedor_nome;
    document.getElementById('cupomCliente').innerText = data.cliente_nome;
    document.getElementById('cupomTelefone').innerText = data.cliente_telefone;

    let cartelasHtml = '';
    let total = 0;
    for (const c of data.cartelas) {
        total += 2.00;
        cartelasHtml += `
            <div class="cupom-cartela">
                <div class="cupom-cartela-num">Cartela #${c.numero_cartela}</div>
                <div class="cupom-milhares">
                    ${c.milhares.map(m => `<span class="cupom-milhar">${m}</span>`).join('')}
                </div>
                <div class="cupom-row" style="margin-top:4px;">
                    <span>Sorteio: ${formatDate(getProximoDiaSorteio())} às 17:00</span>
                    <span>R$ 2,00</span>
                </div>
            </div>
        `;
    }

    document.getElementById('cupomCartelas').innerHTML = cartelasHtml;
    document.getElementById('cupomTotal').innerText = formatCurrency(total);

    // Prize value
    const premio = data.valor_premio || 0;
    document.getElementById('cupomPremio').innerText = formatCurrency(premio);

    const ehPix = data.metodo_pagamento === 'pix' || data.pixConfig != null;
    document.getElementById('cupomPagamento').innerText = ehPix ? 'Pix' : 'Dinheiro';
    document.getElementById('cupomStatus').innerText = ehPix ? 'Pix Pendente' : 'Pago';

    document.getElementById('cupomModal').style.display = 'flex';
}

// Salvar Cupom como JPG
async function salvarCupomJpg() {
    const btn = document.getElementById('saveJpgBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';

    try {
        const el = document.getElementById('cupomPrintable');
        el.style.padding = '0';
        el.style.width = '384px';
        el.style.margin = '0 auto';
        el.style.boxSizing = 'border-box';

        const canvas = await html2canvas(el, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
        });

        const link = document.createElement('a');
        link.download = `cupom-${Date.now()}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.92);
        link.click();

        showToast('Imagem salva com sucesso!', 'success');
    } catch (err) {
        showToast('Erro ao gerar imagem', 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-image"></i> Salvar JPG';
    }
}

// Formatting Utils
// Exportar Vendas para XLS
function exportVendasXls(tableId, filename) {
    const tbody = document.getElementById(tableId);
    if (!tbody || tbody.rows.length === 0) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }
    const tr = tbody.rows[0];
    if (tr.cells.length === 1 && tr.cells[0].colSpan > 1) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }

    const colCount = tr.cells.length;
    const cabecalhos = colCount === 8
        ? ['Data', 'Cartela', 'Milhares', 'Cliente', 'Vendedor', 'Valor', 'Pagamento']
        : ['Data', 'Cartela', 'Milhares', 'Cliente', 'Valor', 'Pagamento'];

    const data = [cabecalhos];

    for (const row of tbody.rows) {
        const rowData = [];
        for (let i = 0; i < row.cells.length; i++) {
            if (i === row.cells.length - 1) continue;
            rowData.push(row.cells[i].textContent.trim());
        }
        data.push(rowData);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = cabecalhos.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
    XLSX.writeFile(wb, `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Arquivo XLS gerado!', 'success');
}

function getProximoDiaSorteio() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

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
