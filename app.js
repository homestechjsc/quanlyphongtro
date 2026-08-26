import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyD0fDuyWWC51ih0qfl3QBAFJY6NOC-5hTA",
    authDomain: "quanlyphongtro-4bef6.firebaseapp.com",
    databaseURL: "https://quanlyphongtro-4bef6-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "quanlyphongtro-4bef6",
    storageBucket: "quanlyphongtro-4bef6.firebasestorage.app",
    messagingSenderId: "484406201867",
    appId: "1:484406201867:web:2abef5338a77487776010e",
    measurementId: "G-SJZ1SE8JF5"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let rooms = [];
let allBills = [];
let allTransactions = [];
let config = { electric: 3500, water: 15000, internet: 50000, garbage: 30000, parking: 100000 };
let teleConfig = { botToken: "", chatId: "" };
let defaultBillTemplate = "Chào {ten}, trọ gửi bạn hóa đơn tiền phòng {phong} tháng {thang} với tổng số tiền là: {tien}đ. Vui lòng thanh toán trước ngày 05 hàng tháng. Cảm ơn bạn!";

// --- 1. LẮNG NGHE FIREBASE REAL-TIME ---
onValue(ref(db, 'settings'), (snapshot) => {
    if (snapshot.exists()) {
        config = snapshot.val();
        renderConfigSettings();
    }
});

onValue(ref(db, 'system_settings'), (snapshot) => {
    if (snapshot.exists()) {
        const val = snapshot.val();
        if (val.tele) {
            teleConfig = val.tele;
            const tToken = document.getElementById('cfg-tele-token');
            const tChat = document.getElementById('cfg-tele-chatid');
            if (tToken) tToken.value = teleConfig.botToken || "";
            if (tChat) tChat.value = teleConfig.chatId || "";
        }
        if (val.template) {
            defaultBillTemplate = val.template;
            const tArea = document.getElementById('cfg-bill-template');
            if (tArea) tArea.value = defaultBillTemplate;
        }
    }
});

onValue(ref(db, 'rooms'), (snapshot) => {
    const data = snapshot.val();
    rooms = [];
    if (data) {
        Object.keys(data).forEach(key => { rooms.push({ id: key, ...data[key] }); });
        rooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    }
    renderRooms();
    renderRoomsManagementList();
    updateDashboardMetrics();
});

onValue(ref(db, 'transactions'), (snapshot) => {
    const data = snapshot.val();
    allTransactions = [];
    if (data) {
        Object.keys(data).forEach(key => {
            allTransactions.push({ id: key, ...data[key] });
        });
        allTransactions.sort((a, b) => b.timestamp - a.timestamp);
    }
    renderTransactionsList();
    updateDashboardMetrics();
});

// --- 2. QUẢN LÝ TABS & SUB-TABS ---
window.switchTab = (tab) => {
    const views = ['dashboard', 'rooms', 'tenants', 'finance', 'settings'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.toggle('hidden', v !== tab);
    });

    if (tab === 'dashboard') updateDashboardMetrics();
    if (tab === 'settings') {
        renderConfigSettings();
        renderRoomsManagementList();
        renderTransactionsList();
    }
    if (tab === 'finance') renderFinance();
    if (tab === 'tenants') fetchAllBills();
    if (tab === 'rooms') renderRooms();
};

window.switchSettingSubTab = (sub) => {
    const subs = ['services', 'rooms_mgr', 'ledger', 'telegram', 'template'];
    subs.forEach(s => {
        const el = document.getElementById(`setting-sec-${s}`);
        const btn = document.getElementById(`subtab-${s}`);
        if (el) el.classList.toggle('hidden', s !== sub);
        if (btn) {
            if (s === sub) {
                btn.className = "flex-1 py-2 rounded-xl bg-white text-indigo-600 shadow-sm transition-all text-center";
            } else {
                btn.className = "flex-1 py-2 rounded-xl text-slate-500 transition-all text-center";
            }
        }
    });
    if (sub === 'ledger') renderTransactionsList();
};

// --- 3. DASHBOARD (TỔNG QUAN) ---
function updateDashboardMetrics() {
    const total = rooms.length;
    const occupied = rooms.filter(r => r.status === 'occupied').length;
    const empty = rooms.filter(r => r.status === 'empty').length;
    const deposit = rooms.filter(r => r.status === 'deposit').length;

    if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = total;
    if (document.getElementById('stat-occupied')) document.getElementById('stat-occupied').innerText = occupied;
    if (document.getElementById('stat-empty')) document.getElementById('stat-empty').innerText = empty;
    if (document.getElementById('stat-deposit')) document.getElementById('stat-deposit').innerText = deposit;

    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    if (document.getElementById('dash-occupancy-rate')) document.getElementById('dash-occupancy-rate').innerText = `${occupancyRate}%`;

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    let realRevenue = 0;
    let unpaidRevenue = 0;

    allBills.forEach(b => {
        if (b.month === currentMonth && b.year === currentYear) {
            if (b.status === 'paid') realRevenue += Number(b.totalAmount || 0);
            else unpaidRevenue += Number(b.totalAmount || 0);
        }
    });

    let totalExpense = 0;
    let otherIncome = 0;
    allTransactions.forEach(t => {
        const tDate = new Date(t.date || t.timestamp);
        if (tDate.getMonth() + 1 === currentMonth && tDate.getFullYear() === currentYear) {
            if (t.type === 'expense') totalExpense += Number(t.amount || 0);
            else if (t.type === 'income') otherIncome += Number(t.amount || 0);
        }
    });

    const totalActualIncome = realRevenue + otherIncome;
    const netProfit = totalActualIncome - totalExpense;

    if (document.getElementById('dash-real-revenue')) document.getElementById('dash-real-revenue').innerText = `${totalActualIncome.toLocaleString()}đ`;
    if (document.getElementById('dash-total-expense')) document.getElementById('dash-total-expense').innerText = `${totalExpense.toLocaleString()}đ`;
    if (document.getElementById('dash-net-profit')) document.getElementById('dash-net-profit').innerText = `${netProfit.toLocaleString()}đ`;
    if (document.getElementById('dash-unpaid-revenue')) document.getElementById('dash-unpaid-revenue').innerText = `${unpaidRevenue.toLocaleString()}đ`;

    renderDueRooms();
}

function renderDueRooms() {
    const list = document.getElementById('dueRoomsList');
    const badge = document.getElementById('due-count-badge');
    if (!list) return;

    const occupiedRooms = rooms.filter(r => r.status === 'occupied');
    const today = new Date();
    
    const dueList = occupiedRooms.filter(r => {
        if (!r.nextPaymentDate) return true;
        const nextPay = new Date(r.nextPaymentDate);
        const diffDays = Math.ceil((nextPay - today) / (1000 * 60 * 60 * 24));
        return diffDays <= 5;
    });

    if (badge) badge.innerText = `${dueList.length} phòng`;

    if (dueList.length === 0) {
        list.innerHTML = `<p class="text-[11px] text-slate-400 text-center py-2 font-medium">Tất cả khách trọ đều đã thanh toán đúng hạn!</p>`;
        return;
    }

    list.innerHTML = dueList.map(r => `
        <div class="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-100 transition-all">
            <div class="flex items-center gap-2.5">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                <div>
                    <h5 class="text-xs font-bold text-slate-800">P.${r.roomNumber} - ${r.tenantName || 'Khách thuê'}</h5>
                    <p class="text-[9px] text-slate-400 font-semibold">Hạn đóng: ${r.nextPaymentDate || 'Chưa cập nhật'}</p>
                </div>
            </div>
            <button onclick="sendTenantReminderSMS('${r.id}')" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl font-bold text-[10px] flex items-center gap-1 active:scale-95 transition-all">
                <i class="fa-solid fa-paper-plane"></i> Gửi mẫu
            </button>
        </div>
    `).join('');
}

// --- 4. SƠ ĐỒ PHÒNG (TAB 2) ---
function renderRooms() {
    const grid = document.getElementById('roomGrid');
    if (!grid) return;

    const zones = [...new Set(rooms.map(r => r.zone))];
    
    grid.innerHTML = zones.map(z => {
        const zoneRooms = rooms.filter(r => r.zone === z);
        return `
        <div class="col-span-2 mt-4 first:mt-0 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <span class="w-2 h-4 bg-indigo-600 rounded-full"></span>
                <h4 class="text-xs font-black uppercase text-slate-700 tracking-wider">${z}</h4>
            </div>
            <span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">${zoneRooms.length} phòng</span>
        </div>

        ${zoneRooms.map(r => {
            const hasDebt = (Number(r.debtAmount || 0) > 0);
            let theme = {
                cardBg: "bg-white border-slate-200/80 hover:border-emerald-300 hover:shadow-md",
                iconBg: "bg-emerald-50 text-emerald-600",
                icon: "fa-door-open",
                badgeBg: "bg-emerald-100 text-emerald-700",
                badgeText: "Trống",
                subText: `<span class="text-slate-500 font-medium">${Number(r.basePrice || 0).toLocaleString()}đ/tháng</span>`
            };

            if (hasDebt) {
                theme = {
                    cardBg: "bg-rose-50/40 border-rose-300 shadow-sm",
                    iconBg: "bg-rose-100 text-rose-600 animate-pulse",
                    icon: "fa-circle-exclamation",
                    badgeBg: "bg-rose-500 text-white",
                    badgeText: `Nợ T${r.debtMonth || ''}`,
                    subText: `<span class="text-rose-600 font-extrabold">${Number(r.debtAmount).toLocaleString()}đ</span>`
                };
            } else if (r.status === 'occupied') {
                theme = {
                    cardBg: "bg-indigo-50/30 border-indigo-200 shadow-sm hover:border-indigo-400",
                    iconBg: "bg-indigo-600 text-white shadow-md shadow-indigo-200",
                    icon: "fa-user-check",
                    badgeBg: "bg-indigo-100 text-indigo-700",
                    badgeText: "Đang ở",
                    subText: `<span class="text-indigo-700 font-bold truncate block">${r.tenantName || 'Khách thuê'}</span>`
                };
            } else if (r.status === 'deposit') {
                theme = {
                    cardBg: "bg-amber-50/40 border-amber-300 shadow-sm",
                    iconBg: "bg-amber-500 text-white shadow-md shadow-amber-200",
                    icon: "fa-hand-holding-dollar",
                    badgeBg: "bg-amber-100 text-amber-800",
                    badgeText: "Đã cọc",
                    subText: `<span class="text-amber-700 font-bold truncate block">${r.booking?.name || 'Khách cọc'}</span>`
                };
            } else if (r.status === 'maintenance') {
                theme = {
                    cardBg: "bg-slate-100 border-slate-300 opacity-90",
                    iconBg: "bg-slate-300 text-slate-700",
                    icon: "fa-wrench",
                    badgeBg: "bg-slate-200 text-slate-700",
                    badgeText: "Bảo trì",
                    subText: `<span class="text-slate-500 font-medium">Đang sửa chữa</span>`
                };
            }

            return `
            <div onclick="openModal('detail', '${r.id}')" 
                class="group p-3.5 rounded-3xl border ${theme.cardBg} transition-all duration-200 active:scale-95 cursor-pointer flex flex-col justify-between h-[115px] relative">
                
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl ${theme.iconBg} flex items-center justify-center text-xs transition-transform group-hover:scale-110">
                            <i class="fa-solid ${theme.icon}"></i>
                        </div>
                        <div>
                            <span class="text-base font-black text-slate-800 block leading-tight">P.${r.roomNumber}</span>
                            <span class="text-[9px] font-semibold text-slate-400">${r.zone || 'Khu vực'}</span>
                        </div>
                    </div>

                    <span class="text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${theme.badgeBg}">
                        ${theme.badgeText}
                    </span>
                </div>

                <div class="pt-2 border-t border-slate-100/80 flex items-center justify-between text-xs">
                    <div class="overflow-hidden pr-1">
                        ${theme.subText}
                    </div>
                    <div class="text-slate-300 group-hover:text-indigo-600 transition-colors">
                        <i class="fa-solid fa-chevron-right text-[10px]"></i>
                    </div>
                </div>

            </div>`;
        }).join('')}
        `;
    }).join('');
}

// --- 5. TÍNH TIỀN & CHỐT SỔ (TAB 3) ---
function renderFinance() {
    const container = document.getElementById('view-finance'); 
    if (!container) return;
    
    const activeRooms = rooms.filter(r => r.status === 'occupied');
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    container.innerHTML = `
        <div class="space-y-4 animate-in fade-in duration-300">
            <div class="px-1">
                <h2 class="font-extrabold text-slate-800 text-base">Tính tiền & Chốt sổ</h2>
                <p class="text-[10px] text-slate-400 font-semibold uppercase">Lập hóa đơn tiền phòng và dịch vụ</p>
            </div>

            <div class="bg-white p-5 rounded-3xl shadow-sm border border-slate-200/80 space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-1">
                        <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Tháng chốt sổ</label>
                        <select id="financeMonth" class="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200/80 font-bold text-slate-700 outline-none">
                            ${[...Array(12).keys()].map(i => `<option value="${i+1}" ${i+1 === currentMonth ? 'selected' : ''}>Tháng ${i+1}</option>`).join('')}
                        </select>
                    </div>
                    <div class="space-y-1">
                        <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Năm</label>
                        <input type="number" id="financeYear" value="${currentYear}" class="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200/80 font-bold text-slate-700 outline-none">
                    </div>
                </div>

                <div class="space-y-1">
                    <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Chọn phòng cần tính tiền</label>
                    <select id="selectRoomFinance" class="w-full p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl font-bold text-indigo-600 outline-none" onchange="renderSpecificRoomFinance(this.value)">
                        <option value="">-- Click để chọn phòng --</option>
                        ${activeRooms.map(r => `<option value="${r.id}">Phòng ${r.roomNumber} - ${r.tenantName}</option>`).join('')}
                    </select>
                </div>
                
                <div id="roomFinanceDetail" class="min-h-[5px]"></div>
            </div>
        </div>
    `;
}

window.renderSpecificRoomFinance = (id) => {
    const detailContainer = document.getElementById('roomFinanceDetail');
    if (!id) { detailContainer.innerHTML = ''; return; }
    
    const r = rooms.find(room => room.id === id);
    if (!r) return;

    const month = parseInt(document.getElementById('financeMonth').value) || (new Date().getMonth() + 1);
    const year = parseInt(document.getElementById('financeYear').value) || new Date().getFullYear();

    const baseRoomPrice = Number(r.basePrice) || 0; 
    const startDate = r.checkInDate ? new Date(r.checkInDate) : new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    let calculatedPrice = baseRoomPrice;
    let isProrated = false;
    if (startDate.getMonth() + 1 === month && startDate.getFullYear() === year && startDate.getDate() > 1) {
        const stayDays = daysInMonth - startDate.getDate() + 1;
        calculatedPrice = Math.round(((baseRoomPrice / daysInMonth) * stayDays) / 1000) * 1000;
        isProrated = true;
    }

    const lastE = Number(r.lastElectric || 0);
    const lastW = Number(r.lastWater || 0);

    const rateElectric = Number(config.electric || config.gia_dien || config.dien || 3500);
    const rateWater = Number(config.water || config.gia_nuoc || config.nuoc || 15000);

    const excludedKeys = ['electric', 'water', 'gia_dien', 'gia_nuoc', 'dien', 'nuoc'];
    const otherServices = Object.keys(config).filter(k => !excludedKeys.includes(k.toLowerCase()));

    detailContainer.innerHTML = `
        <div class="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-in fade-in">
            <div class="bg-gradient-to-r from-indigo-600 to-blue-600 p-4 rounded-2xl text-white shadow-md space-y-3">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-[10px] font-semibold opacity-90 uppercase">Số tháng thanh toán</p>
                        <input type="number" id="prepaidMonths" value="1" min="1" oninput="updateLiveTotal('${id}')"
                            class="w-16 p-1.5 bg-white/20 rounded-xl border-none font-bold text-center text-white outline-none mt-0.5">
                    </div>
                    <div class="text-right">
                        <div class="flex items-center justify-end gap-1">
                            <p class="text-[10px] font-semibold opacity-80 uppercase">Tiền phòng (T${month}/${year})</p>
                            ${isProrated ? `<span class="text-[8px] bg-amber-400 text-slate-900 font-extrabold px-1.5 py-0.2 rounded">Tính lẻ ${daysInMonth - startDate.getDate() + 1} ngày</span>` : ''}
                        </div>
                        <p id="display-first-month" data-first="${calculatedPrice}" data-base="${baseRoomPrice}" class="text-lg font-black mt-0.5">
                            ${calculatedPrice.toLocaleString()}đ
                        </p>
                    </div>
                </div>

                <div class="pt-2 border-t border-white/20 flex justify-between items-center">
                    <label class="text-[10px] font-semibold uppercase text-amber-200">Giảm trừ trực tiếp</label>
                    <div class="flex items-center gap-1.5">
                        <input type="number" id="discountAmount" value="0" oninput="updateLiveTotal('${id}')"
                            class="w-24 p-1.5 bg-white/20 rounded-xl border-none font-bold text-right text-white outline-none" placeholder="0">
                        <span class="text-xs font-semibold">đ</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-1.5">
                    <div class="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase">
                        <span><i class="fa-solid fa-bolt text-amber-500 mr-1"></i>Điện (Cũ: ${lastE})</span>
                        <span id="diff-e-badge" class="text-indigo-600 font-extrabold">0 kWh</span>
                    </div>
                    <input type="number" id="cur-e" data-old="${lastE}" data-rate="${rateElectric}" oninput="updateLiveTotal('${id}')" 
                        class="w-full p-2.5 bg-white rounded-xl border border-slate-200 font-black text-indigo-600 text-sm outline-none" placeholder="Nhập số mới">
                    <div class="flex justify-between text-[10px] text-slate-400 font-semibold pt-0.5">
                        <span>${rateElectric.toLocaleString()}đ/kWh</span>
                        <span id="cost-e-display" class="font-extrabold text-slate-700">0đ</span>
                    </div>
                </div>

                <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-1.5">
                    <div class="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase">
                        <span><i class="fa-solid fa-droplet text-blue-500 mr-1"></i>Nước (Cũ: ${lastW})</span>
                        <span id="diff-w-badge" class="text-blue-600 font-extrabold">0 m³</span>
                    </div>
                    <input type="number" id="cur-w" data-old="${lastW}" data-rate="${rateWater}" oninput="updateLiveTotal('${id}')" 
                        class="w-full p-2.5 bg-white rounded-xl border border-slate-200 font-black text-blue-600 text-sm outline-none" placeholder="Nhập số mới">
                    <div class="flex justify-between text-[10px] text-slate-400 font-semibold pt-0.5">
                        <span>${rateWater.toLocaleString()}đ/m³</span>
                        <span id="cost-w-display" class="font-extrabold text-slate-700">0đ</span>
                    </div>
                </div>
            </div>

            <div class="space-y-1.5">
                <span class="text-[10px] font-extrabold uppercase text-slate-400 ml-1">Dịch vụ phụ trợ</span>
                <div id="serviceList" class="grid grid-cols-2 gap-2">
                    ${otherServices.length > 0 ? otherServices.map(key => `
                        <label class="flex flex-col p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                            <div class="flex items-center gap-2 mb-1">
                                <input type="checkbox" checked onchange="updateLiveTotal('${id}')" class="service-check w-4 h-4 text-indigo-600 rounded-md border-slate-300" data-key="${key}" data-val="${config[key]}">
                                <span class="text-[10px] font-bold text-slate-700 uppercase truncate">${key.replace(/_/g, ' ')}</span>
                            </div>
                            <span class="text-xs font-bold text-indigo-600">${Number(config[key] || 0).toLocaleString()}đ</span>
                        </label>
                    `).join('') : '<p class="text-[11px] text-slate-400 col-span-2 italic text-center py-2">Không có dịch vụ phát sinh</p>'}
                </div>
            </div>

            <div class="p-4 bg-slate-100 rounded-2xl flex justify-between items-center">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tổng cộng tháng</span>
                <span id="liveTotal" class="text-xl font-black text-indigo-600">0đ</span>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1">
                <button onclick="finalizeBill('${id}', false)" class="py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase active:scale-95 transition-all">
                    <i class="fa-solid fa-clock mr-1"></i> Ghi nợ
                </button>
                <button onclick="finalizeBill('${id}', true)" class="py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase shadow-md shadow-indigo-100 active:scale-95 transition-all">
                    <i class="fa-solid fa-check mr-1"></i> Thu tiền
                </button>
            </div>
        </div>
    `;
    setTimeout(() => updateLiveTotal(id), 50); 
};

window.updateLiveTotal = (roomId) => {
    const r = rooms.find(room => room.id === roomId);
    if (!r) return;

    const prepaidMonths = Math.max(1, Number(document.getElementById('prepaidMonths')?.value) || 1);
    const discount = Number(document.getElementById('discountAmount')?.value) || 0;
    
    const elE = document.getElementById('cur-e');
    const elW = document.getElementById('cur-w');

    const lastE = Number(elE?.getAttribute('data-old') || 0);
    const lastW = Number(elW?.getAttribute('data-old') || 0);
    const rateE = Number(elE?.getAttribute('data-rate') || 3500);
    const rateW = Number(elW?.getAttribute('data-rate') || 15000);

    const curEVal = elE?.value;
    const curWVal = elW?.value;

    const curE = (curEVal !== "" && curEVal !== undefined) ? Number(curEVal) : lastE;
    const curW = (curWVal !== "" && curWVal !== undefined) ? Number(curWVal) : lastW;

    const diffE = Math.max(0, curE - lastE);
    const diffW = Math.max(0, curW - lastW);
    const eCost = diffE * rateE;
    const wCost = diffW * rateW;

    const diffEBadge = document.getElementById('diff-e-badge');
    const diffWBadge = document.getElementById('diff-w-badge');
    const costEDisplay = document.getElementById('cost-e-display');
    const costWDisplay = document.getElementById('cost-w-display');

    if (diffEBadge) diffEBadge.innerText = `${diffE} kWh`;
    if (diffWBadge) diffWBadge.innerText = `${diffW} m³`;
    if (costEDisplay) costEDisplay.innerText = `${eCost.toLocaleString()}đ`;
    if (costWDisplay) costWDisplay.innerText = `${wCost.toLocaleString()}đ`;

    const displayEl = document.getElementById('display-first-month');
    const firstMonthPrice = Number(displayEl?.getAttribute('data-first')) || 0;
    const basePrice = Number(displayEl?.getAttribute('data-base')) || 0;
    const roomTotal = firstMonthPrice + (basePrice * (prepaidMonths - 1));

    let servicesTotal = 0;
    document.querySelectorAll('.service-check:checked').forEach(cb => {
        servicesTotal += Number(cb.getAttribute('data-val')) || 0;
    });

    const rawTotal = (roomTotal + eCost + wCost + servicesTotal) - discount;
    const finalTotal = Math.max(0, Math.round(rawTotal / 1000) * 1000);
    
    const liveTotalEl = document.getElementById('liveTotal');
    if (liveTotalEl) liveTotalEl.innerText = finalTotal.toLocaleString() + 'đ';
};

window.finalizeBill = async (roomId, isPaid) => {
    const r = rooms.find(room => room.id === roomId);
    if (!r) return;

    const lastE = Number(r.lastElectric || 0);
    const lastW = Number(r.lastWater || 0);

    const curEVal = document.getElementById('cur-e')?.value;
    const curWVal = document.getElementById('cur-w')?.value;

    if (curEVal === "" || curWVal === "") {
        return alert("Vui lòng nhập đầy đủ chỉ số Điện và Nước mới!");
    }

    const curE = Number(curEVal);
    const curW = Number(curWVal);

    if (curE < lastE) {
        return alert(`Chỉ số điện mới (${curE}) không được nhỏ hơn chỉ số cũ (${lastE})!`);
    }
    if (curW < lastW) {
        return alert(`Chỉ số nước mới (${curW}) không được nhỏ hơn chỉ số cũ (${lastW})!`);
    }

    const month = parseInt(document.getElementById('financeMonth').value);
    const year = parseInt(document.getElementById('financeYear').value);
    const prepaidMonths = Math.max(1, Number(document.getElementById('prepaidMonths').value) || 1);
    const discount = Number(document.getElementById('discountAmount').value) || 0;

    const rateE = Number(config.electric || config.gia_dien || config.dien || 3500);
    const rateW = Number(config.water || config.gia_nuoc || config.nuoc || 15000);

    const diffE = curE - lastE;
    const diffW = curW - lastW;
    const electricCost = diffE * rateE;
    const waterCost = diffW * rateW;
    
    const basePrice = Number(r.basePrice) || 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = r.checkInDate ? new Date(r.checkInDate) : new Date(year, month - 1, 1);
    
    let firstMonthPrice = basePrice;
    if (startDate.getMonth() + 1 === month && startDate.getFullYear() === year && startDate.getDate() > 1) {
        const stayDays = daysInMonth - startDate.getDate() + 1;
        firstMonthPrice = daysInMonth > 0 ? Math.round(((basePrice / daysInMonth) * stayDays) / 1000) * 1000 : 0;
    }

    const totalRoomPrice = firstMonthPrice + (basePrice * (prepaidMonths - 1));

    const servicesDetail = [];
    let totalServices = 0;
    document.querySelectorAll('.service-check:checked').forEach(cb => {
        const key = cb.getAttribute('data-key');
        const val = Number(cb.getAttribute('data-val')) || 0;
        servicesDetail.push({ name: key, price: val });
        totalServices += val;
    });

    const totalAmount = Math.max(0, Math.round(totalRoomPrice + electricCost + waterCost + totalServices - discount));

    const billData = {
        roomId, 
        roomNumber: r.roomNumber, 
        tenantName: r.tenantName || 'Khách thuê',
        tenantPhone: r.tenantPhone || '',
        month, 
        year, 
        basePrice,
        roomAmount: totalRoomPrice,
        electric: { old: lastE, new: curE, usage: diffE, rate: rateE, cost: electricCost },
        water: { old: lastW, new: curW, usage: diffW, rate: rateW, cost: waterCost },
        services: servicesDetail,
        servicesAmount: totalServices,
        discount,
        prepaidMonths,
        totalAmount, 
        status: isPaid ? 'paid' : 'unpaid',
        timestamp: Date.now()
    };

    try {
        await push(ref(db, `bills/${year}/${month}`), billData);
        
        let nextPayDate = new Date(year, month - 1, startDate.getDate());
        nextPayDate.setMonth(nextPayDate.getMonth() + prepaidMonths);

        await update(ref(db, `rooms/${roomId}`), { 
            lastElectric: curE, 
            lastWater: curW,
            nextPaymentDate: nextPayDate.toISOString().split('T')[0],
            debtAmount: isPaid ? 0 : totalAmount,
            debtMonth: isPaid ? null : month
        });
        
        alert(`Đã ${isPaid ? 'thu tiền' : 'lưu nợ'} P.${r.roomNumber} (${totalAmount.toLocaleString()}đ) thành công!`);
        renderFinance(); 
    } catch (e) {
        alert("Lỗi lưu dữ liệu: " + e.message);
    }
};

// --- 6. QUẢN LÝ HÓA ĐƠN & PHIẾU THU (TAB 4) ---
function fetchAllBills() {
    const billsRef = ref(db, 'bills');
    onValue(billsRef, (snapshot) => {
        const data = snapshot.val();
        allBills = [];
        if (data) {
            Object.keys(data).forEach(year => {
                Object.keys(data[year]).forEach(month => {
                    Object.keys(data[year][month]).forEach(id => {
                        allBills.push({ id, ...data[year][month][id] });
                    });
                });
            });
            allBills.sort((a, b) => b.timestamp - a.timestamp);
        }
        filterBills();
        updateDashboardMetrics();
    });
}

window.setQuickFilter = (type) => {
    const now = new Date();
    const btnThisMonth = document.getElementById('btn-flt-thisMonth');
    const btnUnpaid = document.getElementById('btn-flt-unpaid');
    const btnAll = document.getElementById('btn-flt-all');

    if (btnThisMonth) btnThisMonth.className = "py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold uppercase transition-all";
    if (btnUnpaid) btnUnpaid.className = "py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold uppercase transition-all";
    if (btnAll) btnAll.className = "py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold uppercase transition-all";

    if (type === 'thisMonth') {
        if (btnThisMonth) btnThisMonth.className = "py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-bold uppercase transition-all";
        const mSelect = document.getElementById('billFilterMonth');
        if (mSelect) mSelect.value = (now.getMonth() + 1).toString();
        const sSelect = document.getElementById('billFilterStatus');
        if (sSelect) sSelect.value = "";
    } else if (type === 'unpaid') {
        if (btnUnpaid) btnUnpaid.className = "py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-bold uppercase transition-all";
        const sSelect = document.getElementById('billFilterStatus');
        if (sSelect) sSelect.value = "unpaid";
        const mSelect = document.getElementById('billFilterMonth');
        if (mSelect) mSelect.value = "";
    } else if (type === 'all') {
        if (btnAll) btnAll.className = "py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-bold uppercase transition-all";
        const mSelect = document.getElementById('billFilterMonth');
        if (mSelect) mSelect.value = "";
        const sSelect = document.getElementById('billFilterStatus');
        if (sSelect) sSelect.value = "";
    }
    filterBills();
};

window.filterBills = () => {
    const keyword = (document.getElementById('searchBill')?.value || '').toLowerCase();
    const filterMonth = document.getElementById('billFilterMonth')?.value;
    const filterStatus = document.getElementById('billFilterStatus')?.value;
    const container = document.getElementById('tenantList');
    if (!container) return;

    const filtered = allBills.filter(b => {
        const matchKeyword = (b.tenantName || '').toLowerCase().includes(keyword) || (b.roomNumber || '').toString().includes(keyword);
        const matchMonth = !filterMonth || b.month.toString() === filterMonth;
        const matchStatus = !filterStatus || b.status === filterStatus;
        return matchKeyword && matchMonth && matchStatus;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-white p-8 rounded-3xl border border-slate-200/80 text-center space-y-2">
                <i class="fa-solid fa-receipt text-slate-300 text-3xl"></i>
                <p class="text-xs font-bold text-slate-400 uppercase">Không tìm thấy hóa đơn phù hợp</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(b => {
        const isPaid = b.status === 'paid';
        const dateStr = new Date(b.timestamp).toLocaleDateString('vi-VN');
        
        return `
        <div class="bg-white p-4 rounded-3xl shadow-sm border border-slate-200/80 space-y-3 hover:border-indigo-200 transition-all">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2.5">
                    <div class="w-10 h-10 ${isPaid ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'} rounded-2xl flex items-center justify-center text-sm shadow-inner">
                        <i class="fa-solid ${isPaid ? 'fa-check' : 'fa-clock'}"></i>
                    </div>
                    <div>
                        <h4 class="font-black text-slate-800 text-xs uppercase tracking-tight">Phòng ${b.roomNumber} - ${b.tenantName}</h4>
                        <p class="text-[10px] text-slate-400 font-semibold">Kỳ: Tháng ${b.month}/${b.year} • Ngày lập: ${dateStr}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-sm font-black ${isPaid ? 'text-emerald-600' : 'text-rose-600'} block">
                        ${Math.round(b.totalAmount).toLocaleString()}đ
                    </span>
                    <span class="text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                        ${isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                    </span>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-1 py-2 px-3 bg-slate-50 rounded-2xl text-[10px] text-slate-500 font-semibold border border-slate-100">
                <div>Phòng: <span class="text-slate-800 font-bold">${Number(b.roomAmount || b.basePrice || 0).toLocaleString()}đ</span></div>
                <div>Điện: <span class="text-slate-800 font-bold">${b.electric ? `${b.electric.usage} kWh` : '---'}</span></div>
                <div>Nước: <span class="text-slate-800 font-bold">${b.water ? `${b.water.usage} m³` : '---'}</span></div>
            </div>

            <div class="flex items-center gap-1.5 pt-1 border-t border-slate-100 text-xs font-bold">
                <button onclick="viewBillDetailModal('${b.year}', '${b.month}', '${b.id}')" class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center gap-1 transition-all">
                    <i class="fa-solid fa-eye text-slate-400"></i> Xem
                </button>
                
                ${!isPaid ? `
                    <button onclick="payQuick('${b.year}', '${b.month}', '${b.id}')" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center gap-1 shadow-sm shadow-emerald-100 active:scale-95 transition-all">
                        <i class="fa-solid fa-dollar-sign"></i> Thu
                    </button>
                ` : `
                    <button onclick="copyBillText('${b.year}', '${b.month}', '${b.id}')" class="flex-1 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center gap-1 transition-all">
                        <i class="fa-solid fa-share-nodes"></i> Gửi
                    </button>
                `}

                <button onclick="openEditBillModal('${b.year}', '${b.month}', '${b.id}')" title="Sửa hóa đơn" class="w-9 h-9 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center active:scale-90 transition-all">
                    <i class="fa-solid fa-pen-to-square text-xs"></i>
                </button>
                <button onclick="deleteBill('${b.year}', '${b.month}', '${b.id}')" title="Xóa hóa đơn" class="w-9 h-9 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl flex items-center justify-center active:scale-90 transition-all">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
};

window.viewBillDetailModal = (year, month, billId) => {
    const bill = allBills.find(b => b.id === billId);
    if (!bill) return;

    const modal = document.getElementById('mainModal');
    const content = document.getElementById('modalContent');
    modal.classList.remove('hidden');

    const e = bill.electric || { old: 0, new: 0, usage: 0, cost: 0, rate: 0 };
    const w = bill.water || { old: 0, new: 0, usage: 0, cost: 0, rate: 0 };
    const services = Array.isArray(bill.services) ? bill.services : [];
    const isPaid = bill.status === 'paid';

    content.innerHTML = `
        <div class="space-y-4 text-slate-800">
            <div class="text-center pb-3 border-b border-slate-200">
                <h3 class="text-base font-black uppercase text-indigo-600 tracking-tight">PHIẾU THU TIỀN TRỌ</h3>
                <p class="text-[11px] font-bold text-slate-500">Kỳ thanh toán: Tháng ${bill.month}/${bill.year}</p>
                <div class="mt-2 inline-block px-3 py-1 rounded-full text-[10px] font-extrabold uppercase ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                    ${isPaid ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN'}
                </div>
            </div>

            <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1">
                <div class="flex justify-between"><span class="text-slate-400">Phòng:</span><span class="font-extrabold text-slate-800">Phòng ${bill.roomNumber}</span></div>
                <div class="flex justify-between"><span class="text-slate-400">Khách thuê:</span><span class="font-bold text-slate-700">${bill.tenantName}</span></div>
                <div class="flex justify-between"><span class="text-slate-400">Ngày lập:</span><span class="font-medium text-slate-600">${new Date(bill.timestamp).toLocaleDateString('vi-VN')}</span></div>
            </div>

            <div class="space-y-2 text-xs">
                <div class="flex justify-between font-bold border-b border-slate-100 pb-1 text-slate-400 text-[10px] uppercase">
                    <span>Khoản mục</span>
                    <span>Thành tiền</span>
                </div>
                
                <div class="flex justify-between">
                    <span>Tiền phòng (${bill.prepaidMonths || 1} tháng)</span>
                    <span class="font-bold text-slate-800">${Number(bill.roomAmount || bill.basePrice || 0).toLocaleString()}đ</span>
                </div>

                <div class="flex justify-between">
                    <div>
                        <span>Tiền điện (${e.usage} kWh)</span>
                        <p class="text-[9px] text-slate-400">Số cũ: ${e.old} ➔ Số mới: ${e.new} (${Number(e.rate || 0).toLocaleString()}đ/kWh)</p>
                    </div>
                    <span class="font-bold text-slate-800">${Number(e.cost || 0).toLocaleString()}đ</span>
                </div>

                <div class="flex justify-between">
                    <div>
                        <span>Tiền nước (${w.usage} m³)</span>
                        <p class="text-[9px] text-slate-400">Số cũ: ${w.old} ➔ Số mới: ${w.new} (${Number(w.rate || 0).toLocaleString()}đ/m³)</p>
                    </div>
                    <span class="font-bold text-slate-800">${Number(w.cost || 0).toLocaleString()}đ</span>
                </div>

                ${services.map(s => `
                    <div class="flex justify-between text-slate-600">
                        <span class="capitalize">${s.name.replace(/_/g, ' ')}</span>
                        <span class="font-bold text-slate-800">${Number(s.price || 0).toLocaleString()}đ</span>
                    </div>
                `).join('')}

                ${bill.discount > 0 ? `
                    <div class="flex justify-between text-amber-600 font-bold">
                        <span>Giảm trừ trực tiếp</span>
                        <span>-${Number(bill.discount).toLocaleString()}đ</span>
                    </div>
                ` : ''}

                <div class="flex justify-between pt-2 border-t-2 border-dashed border-slate-200 text-sm font-black text-indigo-600">
                    <span>TỔNG CỘNG:</span>
                    <span>${Math.round(bill.totalAmount).toLocaleString()}đ</span>
                </div>
            </div>

            <div class="space-y-2 pt-2">
                <button onclick="copyBillText('${year}', '${month}', '${billId}')" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all">
                    <i class="fa-solid fa-copy"></i> Sao chép tin nhắn gửi Zalo
                </button>
                <button onclick="closeModal()" class="w-full py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase">
                    Đóng
                </button>
            </div>
        </div>
    `;
};

window.copyBillText = (year, month, billId) => {
    const bill = allBills.find(b => b.id === billId);
    if (!bill) return;

    const e = bill.electric || { old: 0, new: 0, usage: 0, cost: 0, rate: 0 };
    const w = bill.water || { old: 0, new: 0, usage: 0, cost: 0, rate: 0 };
    const services = Array.isArray(bill.services) ? bill.services : [];

    let msg = `🏠 THÔNG BÁO TIỀN PHÒNG THÁNG ${bill.month}/${bill.year}\n`;
    msg += `📍 Phòng: ${bill.roomNumber} - Khách thuê: ${bill.tenantName}\n`;
    msg += `---------------------------------\n`;
    msg += `1. Tiền phòng: ${Number(bill.roomAmount || bill.basePrice || 0).toLocaleString()}đ\n`;
    msg += `2. Tiền điện (${e.usage} kWh: ${e.old} -> ${e.new}): ${Number(e.cost || 0).toLocaleString()}đ\n`;
    msg += `3. Tiền nước (${w.usage} m³: ${w.old} -> ${w.new}): ${Number(w.cost || 0).toLocaleString()}đ\n`;
    
    if (services.length > 0) {
        services.forEach((s, idx) => {
            msg += `${idx + 4}. ${s.name.replace(/_/g, ' ')}: ${Number(s.price || 0).toLocaleString()}đ\n`;
        });
    }
    
    if (bill.discount > 0) {
        msg += `* Giảm giá: -${Number(bill.discount).toLocaleString()}đ\n`;
    }
    msg += `---------------------------------\n`;
    msg += `👉 TỔNG TIỀN CẦN THANH TOÁN: ${Math.round(bill.totalAmount).toLocaleString()}đ\n`;
    msg += `Trạng thái: ${bill.status === 'paid' ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN'}\n`;
    msg += `Quý khách vui lòng thanh toán đúng hạn. Trân trọng cảm ơn!`;

    navigator.clipboard.writeText(msg);
    alert("Đã sao chép bảng kê hóa đơn! Bạn có thể dán (Paste) để gửi ngay qua Zalo cho khách.");
};

window.payQuick = async (year, month, billId) => {
    if (!confirm("Xác nhận khách đã thanh toán đầy đủ hóa đơn này?")) return;
    
    const bill = allBills.find(b => b.id === billId);
    if (!bill) return;

    try {
        await update(ref(db, `bills/${year}/${month}/${billId}`), { 
            status: 'paid',
            paidAt: Date.now()
        });

        if (bill.roomId) {
            await update(ref(db, `rooms/${bill.roomId}`), {
                debtAmount: 0,
                debtMonth: null
            });
        }

        alert(`Đã xác nhận thu tiền P.${bill.roomNumber} thành công!`);
        fetchAllBills();
        updateDashboardMetrics();
    } catch (e) {
        alert("Lỗi cập nhật thanh toán: " + e.message);
    }
};

window.exportMonthBillsCSV = () => {
    if (allBills.length === 0) return alert("Chưa có hóa đơn nào để xuất!");

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Phong,Khach_Thue,Thang,Nam,Tong_Tien,Giam_Gia,Trang_Thai,Ngay_Tao\n";

    allBills.forEach(b => {
        const d = new Date(b.timestamp).toLocaleDateString('vi-VN');
        csvContent += `${b.roomNumber},"${b.tenantName}",${b.month},${b.year},${b.totalAmount},${b.discount || 0},${b.status === 'paid' ? 'Da_Thu' : 'Con_No'},${d}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Bao_Cao_Thu_Tien_Phong_${new Date().getMonth() + 1}_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- 7. QUẢN LÝ THÔNG TIN LƯU TRÚ & MODALS ---
function calculateStayDuration(startDate) {
    if (!startDate) return "N/A";
    const start = new Date(startDate);
    const today = new Date();
    const diffTime = Math.abs(today - start);
    return `${Math.ceil(diffTime / (1000 * 60 * 60 * 24))} ngày`;
}

function renderRoomDetail(id, container) {
    const r = rooms.find(room => room.id === id);
    if (!r) return;
    let actionHTML = "";

    if (r.status === 'empty') {
        actionHTML = `
            <div class="space-y-3">
                <div class="flex bg-slate-100 p-1 rounded-2xl gap-1 text-[11px] font-bold">
                    <button type="button" onclick="document.getElementById('form-direct-checkin').classList.remove('hidden'); document.getElementById('form-deposit').classList.add('hidden');" class="flex-1 py-2 rounded-xl bg-white text-indigo-600 shadow-sm transition-all">Nhận phòng ngay</button>
                    <button type="button" onclick="document.getElementById('form-direct-checkin').classList.add('hidden'); document.getElementById('form-deposit').classList.remove('hidden');" class="flex-1 py-2 rounded-xl text-slate-500 transition-all">Đặt cọc giữ chỗ</button>
                </div>

                <div id="form-direct-checkin" class="bg-indigo-50/50 p-4 rounded-3xl border border-indigo-100 space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-black uppercase text-indigo-900 flex items-center gap-1.5">
                            <i class="fa-solid fa-users text-indigo-600"></i> Danh sách người ở
                        </span>
                        <button type="button" onclick="addMemberRow()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1">
                            <i class="fa-solid fa-user-plus text-[9px]"></i> Thêm người
                        </button>
                    </div>

                    <div id="memberListInputs" class="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                        <div class="member-card bg-white p-3 rounded-2xl border border-slate-200/80 space-y-2">
                            <span class="text-[9px] font-extrabold uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Khách 1 (Trưởng phòng)</span>
                            <input type="text" class="m-name w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Họ và tên (*)">
                            <div class="grid grid-cols-2 gap-2">
                                <input type="tel" class="m-phone p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Số điện thoại (*)">
                                <input type="text" class="m-cccd p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Số CCCD / CMND">
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="text" class="m-license p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Biển số xe">
                                <input type="text" class="m-hometown p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Quê quán">
                            </div>
                        </div>
                    </div>

                    <div class="pt-2 border-t border-indigo-100 space-y-2 text-xs">
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Tiền cọc phòng (đ)</label>
                                <input type="number" id="ci-deposit" placeholder="0" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-black text-indigo-600 outline-none">
                            </div>
                            <div>
                                <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Ngày vào ở</label>
                                <input type="date" id="ci-date" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Điện bàn giao</label>
                                <input type="number" id="ci-electric" placeholder="Số điện" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                            </div>
                            <div>
                                <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Nước bàn giao</label>
                                <input type="number" id="ci-water" placeholder="Số nước" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                            </div>
                        </div>
                    </div>

                    <button onclick="saveMultipleMembersCheckIn('${id}')" class="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase shadow-md active:scale-98 transition-all">
                        <i class="fa-solid fa-check-circle mr-1"></i> Hoàn tất nhận phòng
                    </button>
                </div>

                <div id="form-deposit" class="hidden bg-amber-50/50 p-4 rounded-3xl border border-amber-200/80 space-y-3">
                    <span class="text-xs font-black uppercase text-amber-900 flex items-center gap-1.5">
                        <i class="fa-solid fa-hand-holding-dollar text-amber-600"></i> Phiếu đặt cọc giữ phòng
                    </span>
                    <div class="space-y-2">
                        <input type="text" id="b-name" placeholder="Tên khách cọc (*)" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                        <input type="tel" id="b-phone" placeholder="Số điện thoại (*)" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                        <div class="grid grid-cols-2 gap-2">
                            <input type="number" id="b-amount" placeholder="Tiền cọc (VNĐ)" class="p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-indigo-600 outline-none">
                            <select id="b-payMethod" class="p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                                <option value="Tiền mặt">Tiền mặt</option>
                                <option value="Chuyển khoản">Chuyển khoản</option>
                            </select>
                        </div>
                        <textarea id="b-note" placeholder="Ghi chú thêm..." class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs outline-none h-16"></textarea>
                    </div>
                    <button onclick="confirmBooking('${id}')" class="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xs uppercase shadow-md active:scale-98 transition-all">Xác nhận cọc</button>
                </div>
            </div>`;
    } else if (r.status === 'deposit') {
        const bk = r.booking || {};
        actionHTML = `
            <div class="space-y-3">
                <div class="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-1.5 text-xs shadow-sm">
                    <div class="flex justify-between items-center">
                        <span class="text-[9px] font-black uppercase text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-md">Thông tin đặt cọc</span>
                        <span class="text-[10px] text-slate-400 font-semibold">${bk.date || ''}</span>
                    </div>
                    <p class="font-extrabold text-slate-800 text-sm">Khách: ${bk.name || '---'} - ${bk.phone || '---'}</p>
                    <p class="text-indigo-600 font-extrabold">Tiền đã cọc: ${Number(bk.amount || 0).toLocaleString()}đ <span class="text-slate-500 font-medium">(${bk.method || 'Tiền mặt'})</span></p>
                    ${bk.note ? `<p class="text-slate-500 text-[11px] bg-white p-2 rounded-xl border border-amber-100 italic font-medium">Ghi chú: ${bk.note}</p>` : ''}
                </div>

                <div class="bg-indigo-50/50 p-4 rounded-3xl border border-indigo-100 space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-black uppercase text-indigo-900 flex items-center gap-1.5">
                            <i class="fa-solid fa-user-check text-indigo-600"></i> Bàn giao nhận phòng
                        </span>
                        <button type="button" onclick="addMemberRow()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1">
                            <i class="fa-solid fa-user-plus text-[9px]"></i> Thêm người ở cùng
                        </button>
                    </div>

                    <div id="memberListInputs" class="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                        <div class="member-card bg-white p-3 rounded-2xl border border-slate-200/80 space-y-2">
                            <span class="text-[9px] font-extrabold uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Khách 1 (Người đại diện cọc)</span>
                            <input type="text" class="m-name w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Họ và tên (*)" value="${bk.name || ''}">
                            <div class="grid grid-cols-2 gap-2">
                                <input type="tel" class="m-phone p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Số điện thoại (*)" value="${bk.phone || ''}">
                                <input type="text" class="m-cccd p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Số CCCD / CMND">
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="text" class="m-license p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Biển số xe">
                                <input type="text" class="m-hometown p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Quê quán">
                            </div>
                        </div>
                    </div>

                    <div class="pt-2 border-t border-indigo-100 space-y-2 text-xs">
                        <input type="hidden" id="ci-deposit" value="${bk.amount || 0}">
                        <div class="space-y-1">
                            <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Ngày bắt đầu ở</label>
                            <input type="date" id="ci-date" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Điện bàn giao</label>
                                <input type="number" id="ci-electric" placeholder="Số điện" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                            </div>
                            <div>
                                <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Nước bàn giao</label>
                                <input type="number" id="ci-water" placeholder="Số nước" class="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs font-semibold outline-none">
                            </div>
                        </div>
                    </div>

                    <button onclick="saveMultipleMembersCheckIn('${id}')" class="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase shadow-md active:scale-98 transition-all">
                        <i class="fa-solid fa-key mr-1"></i> Bàn giao chìa khóa & Nhận phòng
                    </button>
                    
                    <button onclick="updateStatus('${id}', 'empty')" class="w-full py-2 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-xl font-bold text-xs uppercase transition-all">
                        Hủy cọc (Trả lại phòng trống)
                    </button>
                </div>
            </div>`;
    } else if (r.status === 'occupied') {
        const memberList = Array.isArray(r.members) && r.members.length > 0 
            ? r.members 
            : [{ name: r.tenantName, phone: r.tenantPhone, cccd: r.tenantCCCD, license: r.tenantLicense, hometown: r.tenantHometown }];

        actionHTML = `
            <div class="space-y-3">
                <div class="flex justify-between items-center px-1">
                    <span class="text-xs font-black uppercase text-indigo-900 flex items-center gap-1.5">
                        <i class="fa-solid fa-users text-indigo-600"></i> Thành viên lưu trú (${memberList.length} người)
                    </span>
                    <button onclick="openAddSingleMemberModal('${id}')" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2.5 py-1 rounded-xl font-bold text-[10px] flex items-center gap-1">
                        <i class="fa-solid fa-plus text-[9px]"></i> Thêm người
                    </button>
                </div>

                <div class="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    ${memberList.map((m, idx) => `
                        <div class="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm space-y-1.5 text-xs">
                            <div class="flex justify-between items-start">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-full ${idx === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'} flex items-center justify-center font-bold text-[10px]">
                                        ${idx + 1}
                                    </span>
                                    <div>
                                        <h5 class="font-extrabold text-slate-800">${m.name || '---'}</h5>
                                        <span class="text-[8px] font-black uppercase px-1.5 py-0.2 rounded ${idx === 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}">
                                            ${idx === 0 ? 'Trưởng phòng (Ký HĐ)' : 'Ở cùng'}
                                        </span>
                                    </div>
                                </div>
                                ${idx > 0 ? `
                                    <button onclick="removeMemberFromRoom('${id}', ${idx})" title="Xóa người này" class="text-slate-300 hover:text-rose-500 p-1">
                                        <i class="fa-solid fa-user-minus text-xs"></i>
                                    </button>
                                ` : ''}
                            </div>

                            <div class="grid grid-cols-2 gap-1 text-[11px] pt-1 border-t border-slate-100 text-slate-600">
                                <div><span class="text-slate-400">SĐT:</span> <a href="tel:${m.phone}" class="font-bold text-indigo-600">${m.phone || '---'}</a></div>
                                <div><span class="text-slate-400">CCCD:</span> <span class="font-semibold">${m.cccd || '---'}</span></div>
                                <div><span class="text-slate-400">Xe:</span> <span class="font-semibold">${m.license || 'Không có'}</span></div>
                                <div><span class="text-slate-400">Quê:</span> <span class="font-semibold">${m.hometown || '---'}</span></div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100 flex justify-between items-center text-xs">
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase block">Tiền cọc</span>
                        <span class="font-extrabold text-amber-600">${Number(r.depositAmount || 0).toLocaleString()}đ</span>
                    </div>
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase block">Thời gian ở</span>
                        <span class="font-bold text-indigo-600">${calculateStayDuration(r.checkInDate)}</span>
                    </div>
                    <div>
                        <span class="text-[9px] font-bold text-slate-400 uppercase block">Ngày vào</span>
                        <span class="font-bold text-slate-700">${r.checkInDate || '---'}</span>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1">
                    <button onclick="sendTenantReminderSMS('${id}')" class="py-2.5 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold uppercase transition-all">
                        <i class="fa-solid fa-paper-plane mr-1"></i> Gửi hóa đơn
                    </button>
                    <button onclick="updateStatus('${id}', 'empty')" class="py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold uppercase transition-all">
                        <i class="fa-solid fa-arrow-right-from-bracket mr-1"></i> Trả phòng
                    </button>
                </div>
            </div>`;
    }

    container.innerHTML = `
        <div class="flex justify-between items-center mb-3">
            <div>
                <h3 class="text-xl font-black text-slate-800">Phòng ${r.roomNumber}</h3>
                <span class="text-[10px] font-bold text-slate-400 uppercase">${r.zone || 'Khu vực'} • Giá: ${Number(r.basePrice || 0).toLocaleString()}đ/tháng</span>
            </div>
            <button onclick="closeModal()" class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-200">
                <i class="fa-solid fa-times text-xs"></i>
            </button>
        </div>
        ${actionHTML}
    `;
}

window.addMemberRow = () => {
    const list = document.getElementById('memberListInputs');
    if (!list) return;
    const count = list.querySelectorAll('.member-card').length + 1;

    const div = document.createElement('div');
    div.className = "member-card bg-white p-3 rounded-2xl border border-slate-200/80 space-y-2 relative";
    div.innerHTML = `
        <div class="flex justify-between items-center border-b border-slate-100 pb-1.5">
            <span class="text-[9px] font-extrabold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Khách ${count} (Ở cùng)</span>
            <button type="button" onclick="this.closest('.member-card').remove()" class="text-slate-300 hover:text-rose-500 text-xs">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
        <input type="text" class="m-name w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Họ và tên (*)">
        <div class="grid grid-cols-2 gap-2">
            <input type="tel" class="m-phone p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Số điện thoại">
            <input type="text" class="m-cccd p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Số CCCD / CMND">
        </div>
        <div class="grid grid-cols-2 gap-2">
            <input type="text" class="m-license p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Biển số xe">
            <input type="text" class="m-hometown p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold outline-none" placeholder="Quê quán">
        </div>
    `;
    list.appendChild(div);
};

window.saveMultipleMembersCheckIn = async (roomId) => {
    const memberCards = document.querySelectorAll('#memberListInputs .member-card');
    const members = [];

    memberCards.forEach(card => {
        const name = card.querySelector('.m-name').value.trim();
        const phone = card.querySelector('.m-phone').value.trim();
        const cccd = card.querySelector('.m-cccd').value.trim();
        const license = card.querySelector('.m-license').value.trim();
        const hometown = card.querySelector('.m-hometown').value.trim();

        if (name) {
            members.push({ name, phone, cccd, license, hometown });
        }
    });

    if (members.length === 0) {
        return alert("Vui lòng nhập tối thiểu Họ tên của Trưởng phòng!");
    }

    const depositAmount = Number(document.getElementById('ci-deposit')?.value) || 0;
    const checkInDate = document.getElementById('ci-date')?.value || new Date().toISOString().split('T')[0];
    const startE = Number(document.getElementById('ci-electric')?.value) || 0;
    const startW = Number(document.getElementById('ci-water')?.value) || 0;

    await update(ref(db, `rooms/${roomId}`), {
        status: 'occupied',
        tenantName: members[0].name,
        tenantPhone: members[0].phone,
        members: members,
        depositAmount: depositAmount,
        checkInDate: checkInDate,
        lastElectric: startE,
        lastWater: startW,
        booking: null,
        nextPaymentDate: checkInDate
    });

    alert(`Đã hoàn tất nhận phòng cho ${members.length} người!`);
    closeModal();
};

window.openAddSingleMemberModal = (roomId) => {
    const modal = document.getElementById('mainModal');
    const content = document.getElementById('modalContent');
    modal.classList.remove('hidden');

    content.innerHTML = `
        <div class="space-y-3">
            <h4 class="text-base font-extrabold text-slate-800">Thêm người ở cùng vào phòng</h4>
            <input type="text" id="sm-name" placeholder="Họ và tên (*)" class="w-full p-2.5 bg-slate-50 rounded-xl border text-xs font-semibold outline-none">
            <div class="grid grid-cols-2 gap-2">
                <input type="tel" id="sm-phone" placeholder="Số điện thoại" class="p-2.5 bg-slate-50 rounded-xl border text-xs font-semibold outline-none">
                <input type="text" id="sm-cccd" placeholder="Số CCCD" class="p-2.5 bg-slate-50 rounded-xl border text-xs font-semibold outline-none">
            </div>
            <div class="grid grid-cols-2 gap-2">
                <input type="text" id="sm-license" placeholder="Biển số xe" class="p-2.5 bg-slate-50 rounded-xl border text-xs font-semibold outline-none">
                <input type="text" id="sm-hometown" placeholder="Quê quán" class="p-2.5 bg-slate-50 rounded-xl border text-xs font-semibold outline-none">
            </div>
            <button onclick="saveSingleMemberToRoom('${roomId}')" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase shadow-md">Thêm thành viên</button>
            <button onclick="openModal('detail', '${roomId}')" class="w-full py-1 text-slate-400 font-semibold text-xs">Quay lại</button>
        </div>
    `;
};

window.saveSingleMemberToRoom = async (roomId) => {
    const name = document.getElementById('sm-name').value.trim();
    const phone = document.getElementById('sm-phone').value.trim();
    const cccd = document.getElementById('sm-cccd').value.trim();
    const license = document.getElementById('sm-license').value.trim();
    const hometown = document.getElementById('sm-hometown').value.trim();

    if (!name) return alert("Vui lòng nhập họ tên thành viên mới!");

    const r = rooms.find(room => room.id === roomId);
    let members = Array.isArray(r.members) ? [...r.members] : [{ name: r.tenantName, phone: r.tenantPhone || '' }];
    members.push({ name, phone, cccd, license, hometown });

    await update(ref(db, `rooms/${roomId}`), { members });
    alert(`Đã thêm ${name} vào phòng!`);
    openModal('detail', roomId);
};

window.removeMemberFromRoom = async (roomId, index) => {
    if (!confirm("Xác nhận xóa thành viên này khỏi phòng?")) return;
    const r = rooms.find(room => room.id === roomId);
    let members = [...r.members];
    members.splice(index, 1);

    await update(ref(db, `rooms/${roomId}`), { members });
    openModal('detail', roomId);
};

window.confirmBooking = async (id) => {
    const booking = { 
        name: document.getElementById('b-name').value, 
        phone: document.getElementById('b-phone').value, 
        amount: document.getElementById('b-amount').value, 
        method: document.getElementById('b-payMethod').value, 
        note: document.getElementById('b-note')?.value || '',
        date: new Date().toISOString().split('T')[0] 
    };
    if (!booking.name || !booking.amount) return alert("Nhập tên và tiền cọc!");
    await update(ref(db, `rooms/${id}`), { status: 'deposit', booking });
    closeModal();
};

window.updateStatus = async (id, status) => {
    if (status === 'empty' && !confirm("Xác nhận trả phòng và xóa toàn bộ dữ liệu người ở của phòng này?")) {
        return;
    }

    const updates = { status };
    if (status === 'empty') {
        updates.tenantName = null;
        updates.tenantPhone = null;
        updates.members = null;
        updates.depositAmount = 0;
        updates.checkInDate = null;
        updates.booking = null;
        updates.debtAmount = 0;
        updates.nextPaymentDate = null;
    }
    await update(ref(db, `rooms/${id}`), updates);
    closeModal();
};

// --- 8. QUẢN LÝ PHÒNG & MODALS TRONG TAB CÀI ĐẶT ---
function renderRoomsManagementList() {
    const container = document.getElementById('roomsManageContainer');
    if (!container) return;

    if (rooms.length === 0) {
        container.innerHTML = `<p class="text-[11px] text-slate-400 text-center py-4">Chưa có dữ liệu phòng</p>`;
        return;
    }

    container.innerHTML = rooms.map(r => `
        <div class="bg-white p-3 rounded-2xl border border-slate-200/70 shadow-sm flex justify-between items-center">
            <div>
                <h4 class="font-extrabold text-xs text-slate-800">P.${r.roomNumber} <span class="text-[10px] text-slate-400 font-normal">(${r.zone})</span></h4>
                <p class="text-[10px] text-indigo-600 font-bold">${Number(r.basePrice || 0).toLocaleString()}đ/tháng</p>
            </div>
            <div class="flex items-center gap-1.5">
                <button onclick="openModal('edit-room', '${r.id}')" class="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 text-xs">
                    <i class="fa fa-edit"></i>
                </button>
                <button onclick="deleteRoom('${r.id}')" class="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 text-xs">
                    <i class="fa fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

window.openModal = (type, id = null) => {
    const modal = document.getElementById('mainModal');
    const content = document.getElementById('modalContent');
    modal.classList.remove('hidden');

    if (type === 'add-room' || type === 'edit-room') {
        const r = id ? rooms.find(room => room.id === id) : null;
        content.innerHTML = `
            <h3 class="text-base font-extrabold mb-4 text-slate-800">${r ? 'Chỉnh sửa phòng' : 'Thêm phòng mới'}</h3>
            <div class="space-y-3">
                <input type="text" id="f-roomNum" value="${r ? r.roomNumber : ''}" placeholder="Số phòng (Ví dụ: 101)" class="w-full p-3 bg-slate-100 rounded-xl outline-none text-xs font-semibold">
                <input type="text" id="f-zone" value="${r ? r.zone : ''}" placeholder="Khu vực / Tầng (Ví dụ: Tầng 1)" class="w-full p-3 bg-slate-100 rounded-xl outline-none text-xs font-semibold">
                <input type="number" id="f-price" value="${r ? r.basePrice : ''}" placeholder="Giá thuê cơ bản (VNĐ)" class="w-full p-3 bg-slate-100 rounded-xl outline-none text-xs font-semibold">
                <button onclick="${r ? `updateRoomInfo('${id}')` : 'saveRoom()'}" class="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase shadow-md">Lưu</button>
                <button onclick="closeModal()" class="w-full py-2 text-slate-400 font-semibold text-xs">Hủy</button>
            </div>`;
    } else if (type === 'detail') {
        renderRoomDetail(id, content);
    }
};

window.updateRoomInfo = async (id) => {
    const roomNumber = document.getElementById('f-roomNum').value;
    const zone = document.getElementById('f-zone').value;
    const basePrice = Number(document.getElementById('f-price').value);
    await update(ref(db, `rooms/${id}`), { roomNumber, zone, basePrice });
    closeModal();
};

window.saveRoom = async () => {
    const roomNumber = document.getElementById('f-roomNum').value;
    const zone = document.getElementById('f-zone').value || "Mặc định";
    const basePrice = Number(document.getElementById('f-price').value);
    if (!roomNumber || !basePrice) return alert("Vui lòng nhập số phòng và giá!");
    const newRoomRef = push(ref(db, 'rooms'));
    await set(newRoomRef, {
        roomNumber, zone, basePrice, status: 'empty', 
        lastElectric: 0, lastWater: 0, tenantName: null, booking: null, checkInDate: null
    });
    closeModal();
};

window.deleteRoom = async (id) => {
    if (confirm("Bạn có chắc chắn muốn xoá phòng này không?")) {
        await remove(ref(db, `rooms/${id}`));
        closeModal();
    }
};

// --- 9. CÀI ĐẶT ĐƠN GIÁ DỊCH VỤ ---
function renderConfigSettings() {
    const container = document.getElementById('configContainer');
    if (!container) return;

    const icons = {
        electric: 'fa-bolt text-amber-500',
        water: 'fa-droplet text-blue-500',
        internet: 'fa-wifi text-indigo-500',
        garbage: 'fa-trash-can text-slate-400',
        parking: 'fa-motorcycle text-rose-500',
        default: 'fa-circle-dollar-to-slot text-indigo-400'
    };

    container.innerHTML = Object.keys(config).map(key => {
        const iconClass = icons[key] || icons.default;
        return `
            <div class="bg-white p-3 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col items-center relative">
                <button onclick="deleteConfig('${key}')" class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-slate-300 hover:text-rose-500">
                    <i class="fa fa-times text-[10px]"></i>
                </button>
                <div class="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center mb-1.5">
                    <i class="fa-solid ${iconClass} text-xs"></i>
                </div>
                <div class="text-center w-full">
                    <label class="text-[9px] font-bold text-slate-400 uppercase block mb-1 truncate px-1">${key}</label>
                    <input type="number" data-key="${key}" value="${config[key]}" 
                        class="config-input w-full bg-slate-50 border border-slate-100 rounded-xl p-1 font-extrabold text-indigo-600 text-center text-xs outline-none">
                </div>
            </div>
        `;
    }).join('');
}

window.openConfigModal = () => {
    const modal = document.getElementById('mainModal');
    const content = document.getElementById('modalContent');
    modal.classList.remove('hidden');
    content.innerHTML = `
        <h3 class="text-base font-extrabold text-slate-800 mb-3">Thêm dịch vụ thu phí</h3>
        <div class="space-y-3">
            <input type="text" id="newConfigName" placeholder="Tên dịch vụ (VD: Phí máy giặt)" class="w-full p-3 bg-slate-100 rounded-xl text-xs font-semibold outline-none">
            <input type="number" id="newConfigValue" placeholder="Đơn giá (VNĐ)" class="w-full p-3 bg-slate-100 rounded-xl text-xs font-bold text-indigo-600 outline-none">
            <button onclick="processAddNewConfig()" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase shadow-md">Thêm mới</button>
            <button onclick="closeModal()" class="w-full py-1 text-slate-400 font-semibold text-xs">Đóng</button>
        </div>
    `;
};

window.processAddNewConfig = async () => {
    const name = document.getElementById('newConfigName').value;
    const value = Number(document.getElementById('newConfigValue').value);
    if (!name) return alert("Vui lòng nhập tên dịch vụ!");
    const key = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
    config[key] = value;
    await set(ref(db, 'settings'), config);
    closeModal();
    renderConfigSettings();
};

window.deleteConfig = async (key) => {
    if (confirm(`Xóa bỏ hoàn toàn chi phí "${key}"?`)) {
        delete config[key];
        await set(ref(db, 'settings'), config);
        renderConfigSettings();
    }
};

window.saveSettings = async () => {
    const inputs = document.querySelectorAll('.config-input');
    const newConfig = {};
    inputs.forEach(input => {
        newConfig[input.getAttribute('data-key')] = Number(input.value);
    });
    await set(ref(db, 'settings'), newConfig);
    alert("Đã lưu đơn giá thành công!");
};

// --- 10. SỔ QUỸ THU - CHI ---
window.openTransactionModal = () => {
    const modal = document.getElementById('mainModal');
    const content = document.getElementById('modalContent');
    modal.classList.remove('hidden');

    content.innerHTML = `
        <div class="space-y-4 text-slate-800">
            <div class="text-center pb-2 border-b border-slate-100">
                <h3 class="text-base font-black uppercase text-indigo-600">Tạo Phiếu Thu / Chi</h3>
                <p class="text-[10px] text-slate-400 font-semibold">Ghi nhận các khoản thanh toán phát sinh</p>
            </div>

            <form onsubmit="event.preventDefault(); saveTransaction();" class="space-y-3">
                <div class="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                    <label class="flex items-center justify-center p-2 rounded-xl cursor-pointer has-[:checked]:bg-rose-500 has-[:checked]:text-white transition-all text-xs font-bold text-slate-600">
                        <input type="radio" name="trans_type" value="expense" checked class="hidden" onchange="toggleTransCategory(this.value)">
                        <i class="fa-solid fa-arrow-trend-down mr-1.5"></i> Phiếu Chi
                    </label>
                    <label class="flex items-center justify-center p-2 rounded-xl cursor-pointer has-[:checked]:bg-emerald-600 has-[:checked]:text-white transition-all text-xs font-bold text-slate-600">
                        <input type="radio" name="trans_type" value="income" class="hidden" onchange="toggleTransCategory(this.value)">
                        <i class="fa-solid fa-arrow-trend-up mr-1.5"></i> Phiếu Thu
                    </label>
                </div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Số tiền (VNĐ) (*)</label>
                    <input type="number" id="t-amount" placeholder="0" required class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-indigo-600 outline-none">
                </div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Hạng mục chi phí</label>
                    <select id="t-category" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none">
                        <option value="Sửa chữa / Bảo trì">Sửa chữa / Bảo trì</option>
                        <option value="Hóa đơn Điện/Nước tổng">Hóa đơn Điện/Nước tổng</option>
                        <option value="Mua sắm thiết bị / Đồ dùng">Mua sắm thiết bị / Đồ dùng</option>
                        <option value="Internet / Rác / Vệ sinh">Internet / Rác / Vệ sinh</option>
                        <option value="Khác">Khác</option>
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="space-y-1">
                        <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Ngày giao dịch</label>
                        <input type="date" id="t-date" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none">
                    </div>
                    <div class="space-y-1">
                        <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Thuộc phòng (tùy chọn)</label>
                        <select id="t-room" class="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none">
                            <option value="">-- Toàn bộ nhà trọ --</option>
                            ${rooms.map(r => `<option value="${r.roomNumber}">Phòng ${r.roomNumber}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Diễn giải / Ghi chú</label>
                    <textarea id="t-note" placeholder="Chi tiết nội dung chi phí..." class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none h-16"></textarea>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-2">
                    <button type="button" onclick="closeModal()" class="py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase">Hủy</button>
                    <button type="submit" class="py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase shadow-md active:scale-95 transition-all">Lưu Phiếu</button>
                </div>
            </form>
        </div>
    `;
};

window.toggleTransCategory = (type) => {
    const cat = document.getElementById('t-category');
    if (!cat) return;
    if (type === 'income') {
        cat.innerHTML = `
            <option value="Thu thanh lý đồ đạc">Thu thanh lý đồ đạc</option>
            <option value="Thu cọc giữ phòng">Thu cọc giữ phòng</option>
            <option value="Thu bồi thường hư hỏng">Thu bồi thường hư hỏng</option>
            <option value="Thu phát sinh khác">Thu phát sinh khác</option>
        `;
    } else {
        cat.innerHTML = `
            <option value="Sửa chữa / Bảo trì">Sửa chữa / Bảo trì</option>
            <option value="Hóa đơn Điện/Nước tổng">Hóa đơn Điện/Nước tổng</option>
            <option value="Mua sắm thiết bị / Đồ dùng">Mua sắm thiết bị / Đồ dùng</option>
            <option value="Internet / Rác / Vệ sinh">Internet / Rác / Vệ sinh</option>
            <option value="Khác">Khác</option>
        `;
    }
};

window.saveTransaction = async () => {
    const type = document.querySelector('input[name="trans_type"]:checked')?.value || 'expense';
    const amount = Number(document.getElementById('t-amount').value);
    const category = document.getElementById('t-category').value;
    const date = document.getElementById('t-date').value || new Date().toISOString().split('T')[0];
    const room = document.getElementById('t-room').value;
    const note = document.getElementById('t-note').value;

    if (!amount || amount <= 0) return alert("Vui lòng nhập số tiền hợp lệ!");

    const transData = {
        type,
        amount,
        category,
        date,
        room: room || 'Toàn khu',
        note,
        timestamp: Date.now()
    };

    try {
        await push(ref(db, 'transactions'), transData);
        alert(`Đã lưu phiếu ${type === 'expense' ? 'Chi' : 'Thu'} (${amount.toLocaleString()}đ) thành công!`);
        closeModal();
    } catch (e) {
        alert("Lỗi lưu phiếu: " + e.message);
    }
};

function renderTransactionsList() {
    const container = document.getElementById('transactionsList');
    if (!container) return;

    let totalIncome = 0;
    let totalExpense = 0;

    allTransactions.forEach(t => {
        if (t.type === 'income') totalIncome += Number(t.amount || 0);
        else totalExpense += Number(t.amount || 0);
    });

    if (document.getElementById('ledger-total-income')) document.getElementById('ledger-total-income').innerText = `${totalIncome.toLocaleString()}đ`;
    if (document.getElementById('ledger-total-expense')) document.getElementById('ledger-total-expense').innerText = `${totalExpense.toLocaleString()}đ`;

    if (allTransactions.length === 0) {
        container.innerHTML = `<p class="text-[11px] text-slate-400 text-center py-4">Chưa có phát sinh phiếu thu chi nào</p>`;
        return;
    }

    container.innerHTML = allTransactions.map(t => {
        const isExp = t.type === 'expense';
        return `
            <div class="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex justify-between items-center text-xs">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-xl ${isExp ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'} flex items-center justify-center font-bold text-xs">
                        <i class="fa-solid ${isExp ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                    </div>
                    <div>
                        <h5 class="font-extrabold text-slate-800">${t.category} ${t.room && t.room !== 'Toàn khu' ? `<span class="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">P.${t.room}</span>` : ''}</h5>
                        <p class="text-[10px] text-slate-400 font-medium">${t.date} ${t.note ? `• ${t.note}` : ''}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-black ${isExp ? 'text-rose-600' : 'text-emerald-600'}">
                        ${isExp ? '-' : '+'}${Number(t.amount).toLocaleString()}đ
                    </span>
                    <button onclick="deleteTransaction('${t.id}')" class="text-slate-300 hover:text-rose-500 p-1">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.deleteTransaction = async (id) => {
    if (!confirm("Xác nhận xóa phiếu thu chi này?")) return;
    try {
        await remove(ref(db, `transactions/${id}`));
    } catch (e) {
        alert("Lỗi khi xóa: " + e.message);
    }
};

// --- 11. SỬA VÀ XÓA HÓA ĐƠN ---
window.openEditBillModal = (year, month, billId) => {
    const bill = allBills.find(b => b.id === billId);
    if (!bill) return;

    const modal = document.getElementById('mainModal');
    const content = document.getElementById('modalContent');
    modal.classList.remove('hidden');

    const e = bill.electric || { old: 0, new: 0, rate: config.electric || 3500 };
    const w = bill.water || { old: 0, new: 0, rate: config.water || 15000 };
    const roomAmount = Number(bill.roomAmount || bill.basePrice || 0);
    const servicesAmount = Number(bill.servicesAmount || 0);

    content.innerHTML = `
        <div class="space-y-4 text-slate-800">
            <div class="flex justify-between items-center pb-2 border-b border-slate-100">
                <div>
                    <h3 class="text-base font-black uppercase text-indigo-600">Sửa Hóa Đơn</h3>
                    <p class="text-[10px] font-bold text-slate-400">P.${bill.roomNumber} - ${bill.tenantName} (Tháng ${bill.month}/${bill.year})</p>
                </div>
                <button onclick="closeModal()" class="w-7 h-7 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 flex items-center justify-center">
                    <i class="fa-solid fa-times text-xs"></i>
                </button>
            </div>

            <form onsubmit="event.preventDefault(); saveEditedBill('${year}', '${month}', '${billId}');" class="space-y-3">
                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Tiền phòng (VNĐ)</label>
                    <input type="number" id="edit-room-amount" value="${roomAmount}" oninput="recalcEditBillTotal()" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none">
                </div>

                <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-2">
                    <span class="text-[10px] font-extrabold uppercase text-slate-400">Chỉ số Điện (Đơn giá: ${Number(e.rate || 3500).toLocaleString()}đ)</span>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[9px] text-slate-400 font-semibold ml-1">Số cũ</label>
                            <input type="number" id="edit-e-old" value="${e.old}" data-rate="${e.rate || 3500}" oninput="recalcEditBillTotal()" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                        </div>
                        <div>
                            <label class="text-[9px] text-slate-400 font-semibold ml-1">Số mới</label>
                            <input type="number" id="edit-e-new" value="${e.new}" oninput="recalcEditBillTotal()" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-indigo-600 outline-none">
                        </div>
                    </div>
                </div>

                <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-2">
                    <span class="text-[10px] font-extrabold uppercase text-slate-400">Chỉ số Nước (Đơn giá: ${Number(w.rate || 15000).toLocaleString()}đ)</span>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[9px] text-slate-400 font-semibold ml-1">Số cũ</label>
                            <input type="number" id="edit-w-old" value="${w.old}" data-rate="${w.rate || 15000}" oninput="recalcEditBillTotal()" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                        </div>
                        <div>
                            <label class="text-[9px] text-slate-400 font-semibold ml-1">Số mới</label>
                            <input type="number" id="edit-w-new" value="${w.new}" oninput="recalcEditBillTotal()" class="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-blue-600 outline-none">
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="space-y-1">
                        <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Tổng dịch vụ (VNĐ)</label>
                        <input type="number" id="edit-services-amount" value="${servicesAmount}" oninput="recalcEditBillTotal()" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none">
                    </div>
                    <div class="space-y-1">
                        <label class="text-[9px] font-bold text-slate-400 uppercase ml-1">Giảm trừ (VNĐ)</label>
                        <input type="number" id="edit-discount" value="${bill.discount || 0}" oninput="recalcEditBillTotal()" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-amber-600 outline-none">
                    </div>
                </div>

                <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase ml-1">Trạng thái thanh toán</label>
                    <select id="edit-status" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none">
                        <option value="unpaid" ${bill.status === 'unpaid' ? 'selected' : ''}>Chưa thanh toán (Còn nợ)</option>
                        <option value="paid" ${bill.status === 'paid' ? 'selected' : ''}>Đã thanh toán (Hoàn tất)</option>
                    </select>
                </div>

                <div class="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex justify-between items-center">
                    <span class="text-xs font-extrabold uppercase text-slate-500">Tổng hóa đơn mới:</span>
                    <span id="edit-total-preview" class="text-base font-black text-indigo-600">${Math.round(bill.totalAmount).toLocaleString()}đ</span>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-2">
                    <button type="button" onclick="closeModal()" class="py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase">Hủy</button>
                    <button type="submit" class="py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase shadow-md active:scale-95 transition-all">Lưu thay đổi</button>
                </div>
            </form>
        </div>
    `;
};

window.recalcEditBillTotal = () => {
    const roomAmount = Number(document.getElementById('edit-room-amount')?.value) || 0;
    
    const eOld = Number(document.getElementById('edit-e-old')?.value) || 0;
    const eNew = Number(document.getElementById('edit-e-new')?.value) || 0;
    const eRate = Number(document.getElementById('edit-e-old')?.getAttribute('data-rate')) || 3500;
    const eCost = Math.max(0, eNew - eOld) * eRate;

    const wOld = Number(document.getElementById('edit-w-old')?.value) || 0;
    const wNew = Number(document.getElementById('edit-w-new')?.value) || 0;
    const wRate = Number(document.getElementById('edit-w-old')?.getAttribute('data-rate')) || 15000;
    const wCost = Math.max(0, wNew - wOld) * wRate;

    const servicesAmount = Number(document.getElementById('edit-services-amount')?.value) || 0;
    const discount = Number(document.getElementById('edit-discount')?.value) || 0;

    const total = Math.max(0, Math.round(roomAmount + eCost + wCost + servicesAmount - discount));
    const previewEl = document.getElementById('edit-total-preview');
    if (previewEl) previewEl.innerText = `${total.toLocaleString()}đ`;
};

window.saveEditedBill = async (year, month, billId) => {
    const bill = allBills.find(b => b.id === billId);
    if (!bill) return;

    const roomAmount = Number(document.getElementById('edit-room-amount').value) || 0;
    const eOld = Number(document.getElementById('edit-e-old').value) || 0;
    const eNew = Number(document.getElementById('edit-e-new').value) || 0;
    const eRate = Number(document.getElementById('edit-e-old').getAttribute('data-rate')) || 3500;
    
    const wOld = Number(document.getElementById('edit-w-old').value) || 0;
    const wNew = Number(document.getElementById('edit-w-new').value) || 0;
    const wRate = Number(document.getElementById('edit-w-old').getAttribute('data-rate')) || 15000;

    if (eNew < eOld) return alert("Số điện mới không được nhỏ hơn số cũ!");
    if (wNew < wOld) return alert("Số nước mới không được nhỏ hơn số cũ!");

    const diffE = eNew - eOld;
    const diffW = wNew - wOld;
    const eCost = diffE * eRate;
    const wCost = diffW * wRate;

    const servicesAmount = Number(document.getElementById('edit-services-amount').value) || 0;
    const discount = Number(document.getElementById('edit-discount').value) || 0;
    const status = document.getElementById('edit-status').value;
    const isPaid = status === 'paid';

    const totalAmount = Math.max(0, Math.round(roomAmount + eCost + wCost + servicesAmount - discount));

    const updatedData = {
        ...bill,
        roomAmount,
        electric: { old: eOld, new: eNew, usage: diffE, rate: eRate, cost: eCost },
        water: { old: wOld, new: wNew, usage: diffW, rate: wRate, cost: wCost },
        servicesAmount,
        discount,
        totalAmount,
        status
    };

    try {
        await update(ref(db, `bills/${year}/${month}/${billId}`), updatedData);

        if (bill.roomId) {
            await update(ref(db, `rooms/${bill.roomId}`), {
                lastElectric: eNew,
                lastWater: wNew,
                debtAmount: isPaid ? 0 : totalAmount,
                debtMonth: isPaid ? null : month
            });
        }

        alert("Cập nhật hóa đơn thành công!");
        closeModal();
        fetchAllBills();
    } catch (e) {
        alert("Lỗi cập nhật: " + e.message);
    }
};

window.deleteBill = async (year, month, billId) => {
    const bill = allBills.find(b => b.id === billId);
    if (!bill) return;

    if (!confirm(`Bạn có chắc chắn muốn xóa hóa đơn P.${bill.roomNumber} - Tháng ${month}/${year} (${bill.totalAmount.toLocaleString()}đ)? Dữ liệu không thể khôi phục!`)) {
        return;
    }

    try {
        await remove(ref(db, `bills/${year}/${month}/${billId}`));

        if (bill.roomId && bill.status === 'unpaid') {
            await update(ref(db, `rooms/${bill.roomId}`), {
                debtAmount: 0,
                debtMonth: null
            });
        }

        alert("Đã xóa hóa đơn thành công!");
        fetchAllBills();
    } catch (e) {
        alert("Lỗi khi xóa hóa đơn: " + e.message);
    }
};

// --- 12. TELEGRAM & TIN NHẮN MẪU ---
window.saveTelegramSettings = async () => {
    const botToken = document.getElementById('cfg-tele-token').value.trim();
    const chatId = document.getElementById('cfg-tele-chatid').value.trim();
    await update(ref(db, 'system_settings/tele'), { botToken, chatId });
    teleConfig = { botToken, chatId };
    alert("Đã lưu cấu hình Telegram thành công!");
};

window.testTelegramMessage = async () => {
    const botToken = document.getElementById('cfg-tele-token').value.trim() || teleConfig.botToken;
    const chatId = document.getElementById('cfg-tele-chatid').value.trim() || teleConfig.chatId;

    if (!botToken || !chatId) return alert("Vui lòng điền đủ Bot Token và Chat ID!");

    const text = "🔔 [PMS MANAGER 2026] Thông báo thử nghiệm kết nối Telegram Bot thành công!";
    try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
        const data = await res.json();
        if (data.ok) alert("Gửi tin nhắn Telegram thành công!");
        else alert("Lỗi gửi Telegram: " + data.description);
    } catch (e) {
        alert("Lỗi kết nối Telegram: " + e.message);
    }
};

window.sendTelegramBroadcast = async () => {
    if (!teleConfig.botToken || !teleConfig.chatId) {
        return alert("Vui lòng cấu hình Bot Token và Chat ID tại Tab Cài Đặt trước!");
    }
    const dueCount = rooms.filter(r => r.status === 'occupied').length;
    const text = `📢 BÁO CÁO PHÒNG TRỌ:\n- Tổng phòng đang ở: ${dueCount}\n- Kiểm tra và thu tiền phòng đúng hạn.`;
    
    await fetch(`https://api.telegram.org/bot${teleConfig.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: teleConfig.chatId, text })
    });
    alert("Đã bắn thông báo tình trạng đến Telegram!");
};

window.saveBillTemplate = async () => {
    const template = document.getElementById('cfg-bill-template').value;
    await update(ref(db, 'system_settings'), { template });
    defaultBillTemplate = template;
    alert("Đã lưu mẫu tin nhắn thành công!");
};

window.sendTenantReminderSMS = (roomId) => {
    const r = rooms.find(room => room.id === roomId);
    if (!r) return;

    const currentMonth = new Date().getMonth() + 1;
    let msg = defaultBillTemplate
        .replace('{ten}', r.tenantName || 'Bạn')
        .replace('{phong}', r.roomNumber)
        .replace('{thang}', currentMonth)
        .replace('{tien}', (r.debtAmount || r.basePrice || 0).toLocaleString());

    navigator.clipboard.writeText(msg);
    alert(`Đã sao chép tin nhắn gửi khách:\n\n${msg}`);
};

window.closeModal = () => document.getElementById('mainModal').classList.add('hidden');

// --- KHỞI CHẠY TẢI DỮ LIỆU BAN ĐẦU ---
fetchAllBills();