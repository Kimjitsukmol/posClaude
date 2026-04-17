// ============================================================
// 🚀 POS By Ice — script.js (Supabase Edition)
// ============================================================
// ⚙️ 1. กรอก URL และ Key ของ Supabase ที่นี่
//    ไปที่ Project Settings > API ใน Supabase Dashboard
// ============================================================
const SUPABASE_URL  = 'https://zzgzrnjriqombhdkkklz.supabase.co'; // ← เปลี่ยน
const SUPABASE_ANON = 'sb_publishable_swcv3sHOzdEyuvqhlnf-4g_cMzWIx9y';               // ← เปลี่ยน

// ============================================================
// 🔗 Supabase Client (ไม่ต้องติดตั้ง npm — ใช้ global จาก CDN)
// ============================================================
const _supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ============================================================
// 🖨️ AUTO-PRINT SETTING
// เก็บใน localStorage — ไม่ต้องดึงจาก Supabase ทุกครั้ง
// ============================================================
function isAutoPrintEnabled() {
    // default = เปิด (true) ถ้ายังไม่เคยตั้งค่า
    return localStorage.getItem('autoPrint') !== 'false';
}

function setAutoPrint(enabled) {
    localStorage.setItem('autoPrint', enabled ? 'true' : 'false');
    showToast(enabled ? '🖨️ ปริ้นอัตโนมัติ: เปิด' : '🖨️ ปริ้นอัตโนมัติ: ปิด — ปริ้นเองได้ที่เมนู บิล', 'success');
}

// sync toggle state เมื่อเปิด modal
function syncAutoPrintToggle() {
    const toggle = document.getElementById('autoPrintToggle');
    if (toggle) toggle.checked = isAutoPrintEnabled();
}

// ============================================================
// 📱 DEVICE DETECTION
// ============================================================
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const HAS_BLUETOOTH = typeof navigator.bluetooth !== 'undefined';

// แสดง alert แบบ iOS-friendly เมื่อ Bluetooth ไม่รองรับ
function showIOSNoPrintAlert() {
    showCustomAlert(
        '🍎 iPad ไม่รองรับการปริ้นผ่าน Bluetooth',
        'Apple บล็อก Web Bluetooth บน iOS/iPadOS ทุกรุ่น\n\n' +
        '✅ วิธีแก้: ใช้ Android (Xiaomi Pad 7) เพื่อปริ้นใบเสร็จ\n' +
        'iPad ยังคงใช้งาน POS ได้ปกติทุกอย่าง ยกเว้นปริ้นเท่านั้น'
    );
}

// ============================================================
// 📦 GLOBAL VARIABLES
// ============================================================
let menuData      = [];
let masterData    = [];
let cart          = [];
let currentOrders = [];
let currentPayOrder = null;
let historyBills  = [];
let lastOrderCount = -1;

const categories = ['เครื่องดื่ม', 'ขนม/ของว่าง', 'ของใช้ในบ้าน', 'อาหารแห้ง/เครื่องปรุง', 'อาหารสด', 'เบ็ดเตล็ด'];

let isCustomerMode = false;
let customerTable  = "";
let isQuickPayMode = false;
let notifiedOrders = new Set();
let isStoreOpen    = true;
let myLastOrders   = [];
let realtimeChannel = null;

// ============================================================
// 🖨️ BLUETOOTH THERMAL PRINTER — ESC/POS (Xprinter / GOOJPRT)
// รองรับ: Web Bluetooth API (Chrome Android / Xiaomi Pad 7)
// ============================================================
const PRINTER = {
    device: null,
    characteristic: null,
    // Xprinter / GOOJPRT / เครื่องปริ้นจีนทั่วไป ใช้ UUID ชุดนี้
    SERVICE_UUID: '000018f0-0000-1000-8000-00805f9b34fb',
    CHAR_UUID:    '00002af1-0000-1000-8000-00805f9b34fb',
    // fallback UUID ถ้าชุดแรกไม่ผ่าน (บางรุ่น)
    ALT_SERVICE:  '0000ff00-0000-1000-8000-00805f9b34fb',
    ALT_CHAR:     '0000ff02-0000-1000-8000-00805f9b34fb',

    isConnected() { return this.device && this.device.gatt.connected; },

    // จับคู่ Bluetooth
    async connect() {
        try {
            showToast('กำลังค้นหาเครื่องปริ้น...', 'warning');
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    this.SERVICE_UUID,
                    this.ALT_SERVICE,
                    '000018f0-0000-1000-8000-00805f9b34fb',
                ]
            });
            this.device.addEventListener('gattserverdisconnected', () => {
                this.characteristic = null;
                showToast('เครื่องปริ้นหลุดการเชื่อมต่อ', 'warning');
                updatePrinterStatusUI(false);
            });
            const server = await this.device.gatt.connect();
            // ลอง UUID หลักก่อน ถ้าไม่ได้ลอง fallback
            let service, char;
            try {
                service = await server.getPrimaryService(this.SERVICE_UUID);
                char    = await service.getCharacteristic(this.CHAR_UUID);
            } catch(e) {
                service = await server.getPrimaryService(this.ALT_SERVICE);
                char    = await service.getCharacteristic(this.ALT_CHAR);
            }
            this.characteristic = char;
            showToast(`✅ เชื่อมต่อ ${this.device.name || 'Printer'} แล้ว`, 'success');
            updatePrinterStatusUI(true);
            localStorage.setItem('lastPrinterName', this.device.name || 'Printer');
            return true;
        } catch(e) {
            if (e.name !== 'NotFoundError') {
                showCustomAlert('เชื่อมต่อไม่สำเร็จ', e.message || e.toString());
            }
            updatePrinterStatusUI(false);
            return false;
        }
    },

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
        this.device = null; this.characteristic = null;
        updatePrinterStatusUI(false);
        showToast('ยกเลิกการเชื่อมต่อแล้ว', 'warning');
    },

    // ส่งข้อมูลดิบ (Uint8Array) ไปเครื่องปริ้น แบ่ง chunk ละ 100 bytes
    async send(data) {
        if (!this.isConnected()) {
            const ok = await this.connect();
            if (!ok) return false;
        }
        const CHUNK = 100;
        for (let i = 0; i < data.length; i += CHUNK) {
            const chunk = data.slice(i, i + CHUNK);
            await this.characteristic.writeValueWithoutResponse(chunk);
            await new Promise(r => setTimeout(r, 30)); // หน่วงเล็กน้อยให้เครื่องรับทัน
        }
        return true;
    }
};

// ============================================================
// ============================================================
// 🖼️ CANVAS → BITMAP PRINTER (รองรับภาษาไทย 100%)
// วาดใบเสร็จบน HTML Canvas แล้วแปลงเป็น ESC/POS Raster Image
// ไม่ต้องพึ่ง charset ของเครื่องปริ้นเลย
// ============================================================
const ESC = 0x1B, GS = 0x1D;

const CMD = {
    INIT:   [ESC, 0x40],
    CUT:    [GS,  0x56, 0x01],
    FEED_N: n => [ESC, 0x64, n],
};

const PAPER_W  = 384;   // dots — กระดาษ 58mm @ 203dpi
const FONT_SZ  = 20;    // px ปกติ
const FONT_FAM = "'Kanit','Sarabun','Tahoma',sans-serif";
const LINE_H   = 28;    // px ระยะห่างแถว
const PAD_X    = 10;    // px margin ซ้าย-ขวา
const COL_W    = PAPER_W - PAD_X * 2;

// แปลง Canvas เป็น ESC/POS GS v 0 raster bytes
function canvasToEscPos(canvas) {
    const ctx  = canvas.getContext('2d');
    const w    = canvas.width;
    const h    = canvas.height;
    const px   = ctx.getImageData(0, 0, w, h).data;
    const byteW = Math.ceil(w / 8);
    const out   = [];

    out.push(ESC, 0x40);                                       // INIT
    out.push(GS, 0x76, 0x30, 0x00,                            // GS v 0
        byteW & 0xFF, (byteW >> 8) & 0xFF,
        h & 0xFF,     (h >> 8) & 0xFF);

    for (let row = 0; row < h; row++) {
        for (let bx = 0; bx < byteW; bx++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const col = bx * 8 + bit;
                if (col < w) {
                    const i = (row * w + col) * 4;
                    const gray = 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
                    if (gray < 128) byte |= (0x80 >> bit);
                }
            }
            out.push(byte);
        }
    }
    out.push(ESC, 0x64, 5);    // feed 5 lines
    out.push(GS, 0x56, 0x01);  // partial cut
    return new Uint8Array(out);
}

// วาดใบเสร็จบน Canvas
async function buildReceiptBytes(bill) {
    let shop = {};
    try { shop = await getShopInfo(); } catch(e) { shop = {}; }
    const shopName    = shop.name    || 'ร้านเจ้พินขายของชำ';
    const shopAddress = shop.address || '';
    const shopPhone   = shop.phone   || '';
    const shopFooter  = shop.footer  || 'ขอบคุณที่ใช้บริการค่ะ';

    if (!bill) bill = {};
    if (!bill.items) bill.items = [];
    if (typeof bill.items === 'string') { try { bill.items = JSON.parse(bill.items); } catch(e) { bill.items = []; } }

    const now      = bill.date ? new Date(bill.date) : new Date();
    const dateStr  = now.toLocaleDateString('th-TH', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const timeStr  = now.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
    const tableNo  = bill.table || bill.tableNo || 'Walk-in';
    const cm       = tableNo.match(/(.*)\s*\((.*?)\)\s*(\[ส่งที่:\s*(.*)\])?/);
    const custName = cm ? cm[1].trim() : tableNo;
    const custPhone= cm?.[2] || '';
    const custAddr = cm?.[4] || '';
    const items    = bill.items;
    const total    = parseFloat(bill.total  || bill.finalPrice || 0);
    const recv     = parseFloat(bill.receive|| bill.received   || total);
    const change   = parseFloat(bill.change || 0);
    const billId   = bill.billId || bill.orderId || ('B' + Date.now());

    // ── สร้าง row spec ──
    const rows = [];
    const R = (text, opts = {}) => rows.push({ text, ...opts });
    const DIV = (ch = '─') => R(ch.repeat(38), { align:'center', size: FONT_SZ - 5, color:'#888' });

    R(shopName,    { align:'center', bold:true, size: FONT_SZ + 6 });
    if (shopAddress) R(shopAddress, { align:'center', size: FONT_SZ - 2 });
    if (shopPhone)   R('โทร. ' + shopPhone, { align:'center', size: FONT_SZ - 2 });
    R('ใบเสร็จรับเงิน', { align:'center', bold:true, size: FONT_SZ + 2, mt:4 });
    DIV('═');
    R('เลขที่: ' + billId,                         { size: FONT_SZ - 2 });
    R('วันที่: ' + dateStr + '   ' + timeStr,       { size: FONT_SZ - 2 });
    if (custName && custName !== 'Walk-in' && custName !== 'หน้าร้าน')
        R('ลูกค้า: ' + custName + (custPhone ? ' ('+custPhone+')' : ''), { size: FONT_SZ - 2 });
    if (custAddr) R('ส่งที่: ' + custAddr, { size: FONT_SZ - 2 });
    DIV();

    // header รายการ (3 columns)
    rows.push({ type:'cols3', name:'รายการ', qty:'จน.', amt:'รวม', bold:true, size: FONT_SZ - 2 });
    DIV();

    // รายการสินค้า
    items.forEach(item => {
        const amt = (parseFloat(item.price||0) * parseInt(item.qty||1)).toLocaleString('th-TH',{minimumFractionDigits:2});
        rows.push({ type:'cols3', name: String(item.name||''), qty: String(item.qty||1), amt, size: FONT_SZ - 2 });
    });

    DIV();
    rows.push({ type:'cols2', left:'รวม ('+items.length+' รายการ)', right: total.toLocaleString('th-TH',{minimumFractionDigits:2})+' ฿', bold:true });
    rows.push({ type:'cols2', left:'รับเงิน',  right: recv.toLocaleString('th-TH',{minimumFractionDigits:2})+' ฿', size: FONT_SZ-2 });
    rows.push({ type:'cols2', left:'เงินทอน',  right: change.toLocaleString('th-TH',{minimumFractionDigits:2})+' ฿', size: FONT_SZ-2 });
    DIV('═');
    R(shopFooter, { align:'center', size: FONT_SZ - 2, mt:4 });
    R(' ',        { size: 12 });

    // ── คำนวณความสูง canvas ──
    const measure = document.createElement('canvas').getContext('2d');
    let totalH = 14;
    rows.forEach(row => {
        totalH += (row.mt || 0);
        totalH += row.type ? LINE_H : Math.ceil((row.size || FONT_SZ) * 1.4);
    });

    // ── วาด canvas ──
    const canvas = document.createElement('canvas');
    canvas.width  = PAPER_W;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, PAPER_W, totalH);
    ctx.fillStyle = '#000';

    let y = 14;
    rows.forEach(row => {
        y += (row.mt || 0);
        const sz   = row.size || FONT_SZ;
        const bold = row.bold ? '700' : '400';
        const lh   = row.type ? LINE_H : Math.ceil(sz * 1.4);

        if (row.type === 'cols3') {
            // ชื่อ 55% | จน 12% | รวม 33%
            const nW = Math.floor(COL_W * 0.55);
            const qW = Math.floor(COL_W * 0.12);
            const aW = COL_W - nW - qW;
            ctx.font = `${bold} ${sz}px ${FONT_FAM}`;
            ctx.textBaseline = 'top';
            ctx.fillText(String(row.name||'').substring(0,22), PAD_X, y);
            ctx.fillText(row.qty||'', PAD_X + nW + qW - ctx.measureText(row.qty||'').width, y);
            ctx.fillText(row.amt||'', PAPER_W - PAD_X - ctx.measureText(row.amt||'').width, y);
        } else if (row.type === 'cols2') {
            ctx.font = `${bold} ${sz}px ${FONT_FAM}`;
            ctx.textBaseline = 'top';
            ctx.fillText(row.left||'', PAD_X, y);
            ctx.fillText(row.right||'', PAPER_W - PAD_X - ctx.measureText(row.right||'').width, y);
        } else {
            ctx.font = `${bold} ${sz}px ${FONT_FAM}`;
            ctx.textBaseline = 'top';
            ctx.fillStyle = row.color || '#000';
            const align = row.align || 'left';
            let tx = PAD_X;
            const tw = ctx.measureText(row.text||'').width;
            if (align === 'center') tx = (PAPER_W - tw) / 2;
            if (align === 'right')  tx = PAPER_W - PAD_X - tw;
            ctx.fillText(row.text||'', tx, y);
            ctx.fillStyle = '#000';
        }
        y += lh;
    });

    return canvasToEscPos(canvas);
}

// ── ปริ้นทดสอบ ──
async function testPrint() {
    if (IS_IOS || !HAS_BLUETOOTH) {
        showIOSNoPrintAlert();
        return;
    }
    if (!PRINTER.isConnected()) {
        const ok = await PRINTER.connect();
        if (!ok) return;
    }
    const demoData = {
        billId:   'TEST-0001',
        date:     new Date().toISOString(),
        table:    'ทดสอบ',
        items:    [
            { name: 'น้ำดื่มมิเนเร่',       qty: 2, price: 10 },
            { name: 'มาม่ารสหมูสับ',         qty: 3, price: 6  },
            { name: 'ขนมปังแผ่นซอสมะเขือเทศ', qty: 1, price: 25 },
        ],
        total:   61, receive: 100, change: 39,
        note:    ''
    };
    await printReceipt(demoData);
}

// ฟังก์ชัน print หลัก — ใช้ได้จากทุกที่
async function printReceipt(billData) {
    try {
        showToast('กำลังส่งข้อมูลไปปริ้น...', 'warning');
        const bytes = await buildReceiptBytes(billData);   // ← await (async)
        const ok = await PRINTER.send(bytes);
        if (ok) showToast('🖨️ ปริ้นเรียบร้อย', 'success');
    } catch(e) {
        showCustomAlert('ปริ้นไม่สำเร็จ', e.message || e.toString());
    }
}

// อัปเดต UI สถานะเครื่องปริ้น (navbar + payment modal + settings modal)
function updatePrinterStatusUI(connected) {
    const slots = [
        { dot: 'printerStatusDot',  text: 'printerStatusText'  },
        { dot: 'printerStatusDot2', text: 'printerStatusText2' },
        { dot: 'printerStatusDot3', text: 'printerStatusText3' },
    ];
    slots.forEach(({ dot, text }) => {
        const dotEl  = document.getElementById(dot);
        const textEl = document.getElementById(text);
        if (!dotEl || !textEl) return;
        // บน iOS แสดงสถานะว่าไม่รองรับ
        if (IS_IOS || !HAS_BLUETOOTH) {
            dotEl.className  = 'w-2 h-2 rounded-full bg-gray-300';
            textEl.innerText = 'iPad ไม่รองรับ Bluetooth';
            return; // return ใน forEach แทน continue
        }
        if (connected) {
            dotEl.className  = 'w-2 h-2 rounded-full bg-green-400 animate-pulse';
            dotEl.style.width = dotEl.style.height = dot === 'printerStatusDot3' ? '12px' : '';
            textEl.innerText = PRINTER.device?.name || 'เชื่อมต่อแล้ว';
        } else {
            dotEl.className  = 'w-2 h-2 rounded-full bg-gray-400';
            textEl.innerText = dot === 'printerStatusDot2' ? 'เครื่องปริ้นยังไม่เชื่อมต่อ' : 'ยังไม่เชื่อมต่อ';
        }
    });
    // navbar button
    const btn = document.getElementById('btnConnectPrinter');
    if (btn) {
        // iOS: แสดงไอคอน disabled
        if (IS_IOS || !HAS_BLUETOOTH) {
            btn.innerHTML = '<i class="fas fa-bluetooth text-gray-500 opacity-40"></i><span class="hidden sm:flex flex-col items-start leading-none gap-0.5"><span class="text-[10px] font-normal opacity-50">ปริ้น</span><span class="text-[10px] opacity-50">iPad ไม่รองรับ</span></span>';
            btn.style.opacity = '0.6';
            return;
        }
        const name = PRINTER.device?.name || 'เชื่อมต่อแล้ว';
        btn.style.opacity = '1';
        btn.innerHTML = connected
            ? `<i class="fas fa-bluetooth text-blue-400"></i><span class="hidden sm:flex flex-col items-start leading-none gap-0.5"><span class="text-[10px] font-normal opacity-70">เครื่องปริ้น</span><span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span><span class="text-[10px]">${name}</span></span></span>`
            : `<i class="fas fa-bluetooth text-gray-400"></i><span class="hidden sm:flex flex-col items-start leading-none gap-0.5"><span class="text-[10px] font-normal opacity-70">เครื่องปริ้น</span><span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-gray-400"></span><span class="text-[10px]">ยังไม่เชื่อมต่อ</span></span></span>`;
    }
}

async function togglePrinterConnection() {
    if (IS_IOS || !HAS_BLUETOOTH) {
        showIOSNoPrintAlert();
        return;
    }
    if (PRINTER.isConnected()) { await PRINTER.disconnect(); }
    else { await PRINTER.connect(); }
}

// ปริ้นจากหน้า bill detail (ประวัติ)
async function printBillDetail(index) {
    const bill = historyBills[index];
    if (!bill) return;

    const btn   = document.getElementById('billDetailPrintBtn');
    const icon  = document.getElementById('billDetailPrintIcon');
    const label = document.getElementById('billDetailPrintLabel');

    // แสดงสถานะ กำลังพิมพ์...
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-not-allowed');
        btn.classList.remove('active:scale-95');
    }
    if (icon)  icon.className  = 'fas fa-circle-notch fa-spin';
    if (label) label.innerText = 'กำลังพิมพ์...';

    try {
        await printReceipt(bill);
        // แสดงสำเร็จสั้นๆ
        if (icon)  icon.className  = 'fas fa-check';
        if (label) label.innerText = 'พิมพ์แล้ว ✓';
        setTimeout(() => {
            if (icon)  icon.className  = 'fas fa-print';
            if (label) label.innerText = 'ปริ้นใบเสร็จ';
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-75', 'cursor-not-allowed');
                btn.classList.add('active:scale-95');
            }
        }, 2000);
    } catch(e) {
        // reset กลับถ้า error
        if (icon)  icon.className  = 'fas fa-print';
        if (label) label.innerText = 'ปริ้นใบเสร็จ';
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
            btn.classList.add('active:scale-95');
        }
    }
}


// ============================================================
// 🗄️ SUPABASE DB HELPERS  (แทน IndexedDB)
// ============================================================
async function dbGetAll(table) {
    const map = { menu: 'products', orders: 'orders', history: 'bills', settings: 'settings' };
    const t = map[table] || table;
    const { data, error } = await _supa.from(t).select('*');
    if (error) throw error;
    if (t === 'products')  return data.map(rowToProduct);
    if (t === 'orders')    return data.map(rowToOrder);
    if (t === 'bills')     return data.map(rowToBill);
    if (t === 'settings')  return data;
    return data;
}

async function dbGet(table, key) {
    const map = { menu: 'products', orders: 'orders', history: 'bills', settings: 'settings' };
    const t = map[table] || table;
    const colMap = { products: 'id', orders: 'order_id', bills: 'bill_id', settings: 'key' };
    const col = colMap[t] || 'id';
    const { data, error } = await _supa.from(t).select('*').eq(col, key).single();
    if (error) return null;
    if (t === 'products') return rowToProduct(data);
    if (t === 'orders')   return rowToOrder(data);
    if (t === 'bills')    return rowToBill(data);
    return data;
}

async function dbPut(table, obj) {
    const map = { menu: 'products', orders: 'orders', history: 'bills', settings: 'settings' };
    const t = map[table] || table;
    let row;
    if (t === 'products') row = productToRow(obj);
    else if (t === 'orders') row = orderToRow(obj);
    else if (t === 'bills') row = billToRow(obj);
    else row = obj;
    const { error } = await _supa.from(t).upsert(row, { onConflict: Object.keys(row)[0] });
    if (error) throw error;
    return true;
}

async function dbDelete(table, key) {
    const map = { menu: 'products', orders: 'orders', history: 'bills', settings: 'settings' };
    const t = map[table] || table;
    const colMap = { products: 'id', orders: 'order_id', bills: 'bill_id', settings: 'key' };
    const col = colMap[t] || 'id';
    const { error } = await _supa.from(t).delete().eq(col, key);
    if (error) throw error;
    return true;
}

// --- Row ↔ Object converters ---
function rowToProduct(r) {
    return { id: r.id, name: r.name, price: parseFloat(r.price||0), cost: parseFloat(r.cost||0),
             category: r.category||'เบ็ดเตล็ด', image: r.image||'', isHidden: r.is_hidden||false,
             stockQty: r.stock_qty||0, stockMin: r.stock_min||5 };
}
function productToRow(p) {
    return { id: p.id, name: p.name, price: p.price||0, cost: p.cost||0,
             category: p.category||'เบ็ดเตล็ด', image: p.image||'', is_hidden: p.isHidden||false,
             stock_qty: p.stockQty||0, stock_min: p.stockMin||5 };
}
function rowToOrder(r) {
    return { orderId: r.order_id, tableNo: r.table_no, orderType: r.order_type,
             status: r.status, items: r.items||[], totalPrice: parseFloat(r.total_price||0),
             note: r.note||'', customerName: r.customer_name||'', customerPhone: r.customer_phone||'',
             addrHouse: r.address_house||'', addrSoi: r.address_soi||'',
             deliveryStatus: r.delivery_status||'รอยืนยัน', timestamp: r.created_at };
}
function orderToRow(o) {
    return { order_id: o.orderId, table_no: o.tableNo||'', order_type: o.orderType||'ซื้อหน้าร้าน',
             status: o.status||'Pending', items: o.items||[], total_price: o.totalPrice||0,
             note: o.note||'', customer_name: o.customerName||'', customer_phone: o.customerPhone||'',
             address_house: o.addrHouse||'', address_soi: o.addrSoi||'',
             delivery_status: o.deliveryStatus||'รอยืนยัน' };
}
function rowToBill(r) {
    return { billId: r.bill_id, date: r.date, table: r.table_no, type: r.order_type,
             itemSummary: r.item_summary||'', items: r.items||[],
             total: parseFloat(r.total||0), receive: parseFloat(r.received||0),
             change: parseFloat(r.change_amount||0), note: r.note||'' };
}
function billToRow(b) {
    return { bill_id: b.billId, date: b.date||new Date().toISOString(),
             table_no: b.table||'', order_type: b.type||'หน้าร้าน',
             item_summary: b.itemSummary||b.items?.map(i=>i.name).join(', ')||'',
             items: b.items||[], total: b.total||0,
             received: b.receive||b.total||0, change_amount: b.change||0, note: b.note||'' };
}

// ============================================================
// ⚙️ CORE UTILS & UI
// ============================================================
function speak(text) {
    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'th-TH'; u.rate = 1.0;
        window.speechSynthesis.speak(u);
    }
}

function playNotificationSound() {
    const beep = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    beep.play().catch(()=>{});
}

function holdBill() {
    if (cart.length === 0) { showToast('ไม่มีรายการให้พักบิล', 'warning'); return; }
    let heldBills = JSON.parse(localStorage.getItem('heldBills') || "[]");
    const newBill = { id: Date.now(), timestamp: new Date().toISOString(), items: cart,
                      total: cart.reduce((s,i) => s + i.price*i.qty, 0) };
    heldBills.push(newBill);
    localStorage.setItem('heldBills', JSON.stringify(heldBills));
    cart = []; renderCart();
    showToast('พักบิลเรียบร้อย (' + heldBills.length + ' รายการ)', 'success');
}

function openRecallModal() {
    const heldBills = JSON.parse(localStorage.getItem('heldBills') || "[]");
    if (heldBills.length === 0) { showToast('ไม่มีบิลที่พักไว้', 'warning'); return; }
    const listContainer = document.getElementById('heldBillsList');
    listContainer.innerHTML = heldBills.map((bill, index) => {
        const timeStr = new Date(bill.timestamp).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
        return `<div class="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition flex justify-between items-center animate-fade-in">
            <div class="flex-1 cursor-pointer" onclick="recallBill(${index})">
                <div class="flex items-center gap-2"><span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded">${timeStr}</span><span class="font-bold text-gray-700">${bill.items.length} รายการ</span></div>
                <div class="text-sm text-gray-500 mt-1">ยอดรวม <span class="text-blue-600 font-bold">${bill.total.toLocaleString()} ฿</span></div>
            </div>
            <button onclick="deleteHeldBill(${index})" class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center ml-2"><i class="fas fa-trash-alt text-xs"></i></button>
        </div>`;
    }).join('');
    document.getElementById('recallModal').classList.remove('hidden');
}

function recallBill(index) {
    let heldBills = JSON.parse(localStorage.getItem('heldBills') || "[]");
    if (cart.length > 0) { if (!confirm("มีรายการค้างอยู่ในตะกร้า ต้องการเคลียร์และเรียกบิลเก่าไหม?")) return; }
    cart = heldBills[index].items; heldBills.splice(index, 1);
    localStorage.setItem('heldBills', JSON.stringify(heldBills));
    closeModal('recallModal'); renderCart(); showToast('เรียกบิลกลับมาแล้ว', 'success');
}

function deleteHeldBill(index) {
    if (!confirm("ต้องการลบบิลนี้ใช่ไหม?")) return;
    let heldBills = JSON.parse(localStorage.getItem('heldBills') || "[]");
    heldBills.splice(index, 1); localStorage.setItem('heldBills', JSON.stringify(heldBills));
    if (heldBills.length === 0) { closeModal('recallModal'); showToast('ลบบิลหมดแล้ว', 'success'); } else { openRecallModal(); }
}

function renderCategoryBar() {
    const bar = document.getElementById('categoryBar');
    bar.innerHTML = `<button onclick="filterMenu('All')" class="cat-btn bg-gradient-to-r from-blue-500 to-blue-400 text-white px-5 py-2 rounded-full shadow-md text-sm font-bold transition transform hover:scale-105 border border-blue-600 shrink-0">ทั้งหมด</button>` +
        categories.map(c => `<button onclick="filterMenu('${c}')" class="cat-btn bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 px-5 py-2 rounded-full shadow-sm text-sm font-medium transition border border-gray-200 shrink-0">${c}</button>`).join('');
}

function populateCategorySelects() {
    const opts = categories.map(c => `<option>${c}</option>`).join('');
    const mCat = document.getElementById('mCategory'); const eCat = document.getElementById('eCategory');
    if (mCat) mCat.innerHTML = opts; if (eCat) eCat.innerHTML = opts;
}

function initDateTime() {
    const weekdays = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
    const updateTime = () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit', hour12:false });
        document.getElementById('dateTimeDisplay').innerHTML = `${now.getDate()} ${weekdays[now.getDay()]} <span class="ml-3 text-white/90">เวลา ${timeStr} น.</span>`;
    };
    updateTime(); setInterval(updateTime, 1000);
}

// ============================================================
// 🖼️ IMAGE URL RESOLVER
// รองรับ 3 รูปแบบ:
//   1. Supabase Storage path  → แปลงเป็น public URL
//   2. data:image (base64)    → ใช้ตรง (รูปเก่า)
//   3. Google Drive ID/URL    → แปลง thumbnail URL (legacy)
// ============================================================
const STORAGE_BUCKET = 'product-images'; // ← ชื่อ bucket ใน Supabase Storage

function getDriveUrl(input) {
    if (!input) return '';
    // ✅ Supabase Storage path เช่น "products/8850157530057.jpg"
    if (!input.startsWith('http') && !input.startsWith('data:') && input.includes('/')) {
        const { data } = _supa.storage.from(STORAGE_BUCKET).getPublicUrl(input);
        return data?.publicUrl || '';
    }
    // ✅ Supabase Storage full URL
    if (input.includes('supabase') && input.includes('storage')) return input;
    // ✅ Base64 (รูปเก่าที่เคยเก็บใน DB)
    if (input.startsWith('data:image')) return input;
    // ✅ Google Drive (legacy)
    if (input.includes('drive.google.com/thumbnail')) return input;
    if (input.includes('http')) return input;
    // Google Drive ID
    return `https://drive.google.com/thumbnail?id=${input}&sz=w200`;
}

// อัปโหลดรูปไปยัง Supabase Storage แล้วคืน path
async function uploadImageToStorage(file, productId) {
    // บีบอัดก่อน upload
    const compressed = await compressImageToBlob(file, 800, 0.80);
    const ext = 'jpg';
    const path = `products/${productId}_${Date.now()}.${ext}`;
    const { data, error } = await _supa.storage
        .from(STORAGE_BUCKET)
        .upload(path, compressed, {
            contentType: 'image/jpeg',
            upsert: true
        });
    if (error) throw new Error('อัปโหลดรูปไม่สำเร็จ: ' + error.message);
    return data.path; // เก็บแค่ path ใน DB
}

// ลบรูปเก่าออกจาก Storage
async function deleteImageFromStorage(imagePath) {
    if (!imagePath || imagePath.startsWith('data:') || imagePath.startsWith('http')) return;
    await _supa.storage.from(STORAGE_BUCKET).remove([imagePath]);
}

// compressImage คืน Blob (สำหรับ upload Storage)
function compressImageToBlob(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } }
                else { if (h > maxWidth) { w *= maxWidth / h; h = maxWidth; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('Blob conversion failed'));
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// ============================================================
// 📱 QR ORDER SYSTEM — ระบบสั่งซื้อผ่าน QR Code
// ============================================================
function openQRModal() {
    document.getElementById('qrModal').classList.remove('hidden');
    const baseUrl = window.location.href.split('?')[0];
    const fullUrl = `${baseUrl}?mode=customer`;
    const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`;
    document.getElementById('qrImage').src = qrApi;
    const linkEl = document.getElementById('qrLink');
    linkEl.href = fullUrl;
    linkEl.innerText = fullUrl;
}

function copyQRLink() {
    const baseUrl = window.location.href.split('?')[0];
    const fullUrl = `${baseUrl}?mode=customer`;
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('คัดลอกลิงก์แล้ว — ส่งให้ลูกค้าได้เลย', 'success');
    }).catch(() => {
        // fallback สำหรับเบราว์เซอร์ที่ไม่รองรับ clipboard
        const ta = document.createElement('textarea');
        ta.value = fullUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('คัดลอกลิงก์แล้ว', 'success');
    });
}

// ============================================================
// 📦 STOCK MANAGEMENT
// ============================================================
async function openStockModal() {
    document.getElementById('stockModal').classList.remove('hidden');
    await renderStockTable();
}

async function renderStockTable(searchTerm = '') {
    const tbody = document.getElementById('stockTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-gray-400"><i class="fas fa-circle-notch fa-spin text-2xl"></i></td></tr>';
    try {
        let query = _supa.from('products').select('id,name,category,stock_qty,stock_min,price').order('name');
        const { data, error } = await query;
        if (error) throw error;
        let items = data || [];
        if (searchTerm) items = items.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.toLowerCase().includes(searchTerm.toLowerCase()));
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-gray-400">ไม่พบสินค้า</td></tr>'; return;
        }
        tbody.innerHTML = items.map(p => {
            const qty = p.stock_qty || 0; const min = p.stock_min || 5;
            let badge = qty <= 0
                ? `<span class="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">หมด</span>`
                : qty <= min
                    ? `<span class="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5 rounded-full">ใกล้หมด</span>`
                    : `<span class="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">ปกติ</span>`;
            const barPct = Math.min(Math.round((qty / Math.max(min * 3, 1)) * 100), 100);
            const barColor = qty <= 0 ? 'bg-red-400' : qty <= min ? 'bg-yellow-400' : 'bg-green-400';
            return `<tr class="border-b border-gray-100 hover:bg-gray-50 transition">
                <td class="p-3 text-xs text-gray-500 font-mono">${p.id}</td>
                <td class="p-3 font-bold text-gray-700">${p.name}</td>
                <td class="p-3 text-xs text-gray-500">${p.category}</td>
                <td class="p-3">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 bg-gray-200 rounded-full h-2"><div class="${barColor} h-2 rounded-full" style="width:${barPct}%"></div></div>
                        <span class="text-sm font-bold text-gray-800 w-8 text-right">${qty}</span>
                    </div>
                    ${badge}
                </td>
                <td class="p-3">
                    <input type="number" min="1" value="${min}" onchange="updateStockMin('${p.id}',this.value)"
                        class="w-16 border border-gray-200 rounded-lg p-1 text-sm text-center focus:border-blue-500 outline-none">
                </td>
                <td class="p-3 flex gap-1">
                    <button onclick="adjustStock('${p.id}','${p.name}',${qty},'add')" class="bg-green-500 text-white text-xs px-2 py-1 rounded-lg hover:bg-green-600 transition font-bold">+เพิ่ม</button>
                    <button onclick="adjustStock('${p.id}','${p.name}',${qty},'set')" class="bg-blue-500 text-white text-xs px-2 py-1 rounded-lg hover:bg-blue-600 transition font-bold">ตั้งค่า</button>
                </td>
            </tr>`;
        }).join('');
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-red-400">โหลดไม่ได้: ${e.message}</td></tr>`;
    }
}

async function updateStockMin(productId, newMin) {
    const min = parseInt(newMin) || 5;
    const { error } = await _supa.from('products').update({ stock_min: min }).eq('id', productId);
    if (!error) showToast('ตั้งค่าขั้นต่ำแล้ว', 'success');
}

async function adjustStock(productId, productName, currentQty, mode) {
    const prompt = mode === 'add'
        ? `เพิ่มสต็อก "${productName}" กี่ชิ้น? (ปัจจุบัน: ${currentQty})`
        : `ตั้งสต็อก "${productName}" เป็น? (ปัจจุบัน: ${currentQty})`;
    const val = window.prompt(prompt);
    if (val === null || val === '') return;
    const num = parseInt(val);
    if (isNaN(num) || num < 0) { showToast('กรุณากรอกตัวเลขที่ถูกต้อง', 'warning'); return; }
    const newQty = mode === 'add' ? currentQty + num : num;
    const { error } = await _supa.from('products').update({ stock_qty: newQty }).eq('id', productId);
    if (error) { showToast('อัปเดตไม่สำเร็จ', 'warning'); return; }
    showToast(`อัปเดตสต็อก "${productName}" → ${newQty} ชิ้น`, 'success');
    renderStockTable(document.getElementById('stockSearchInput')?.value || '');
}

// ============================================================
// 🔔 STOCK ALERTS
// ============================================================
async function checkStockAlerts() {
    try {
        const { data } = await _supa.from('stock_alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(20);
        if (!data || data.length === 0) {
            const badge = document.getElementById('stockAlertBadge');
            if (badge) badge.classList.add('hidden');
            return;
        }
        const badge = document.getElementById('stockAlertBadge');
        if (badge) { badge.innerText = data.length; badge.classList.remove('hidden'); }
    } catch(e) {}
}

async function openStockAlertModal() {
    document.getElementById('stockAlertModal').classList.remove('hidden');
    const list = document.getElementById('stockAlertList');
    list.innerHTML = '<div class="text-center p-6 text-gray-400"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>';
    try {
        const { data } = await _supa.from('stock_alerts').select('*').eq('is_read', false).order('created_at', { ascending: false });
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="text-center p-8 text-gray-400"><i class="fas fa-check-circle text-4xl text-green-400 mb-3 block"></i>ไม่มีการแจ้งเตือนค้างอยู่</div>';
            return;
        }
        list.innerHTML = data.map(a => {
            const isOut = a.alert_type === 'out';
            const icon = isOut ? 'fa-times-circle text-red-500' : 'fa-exclamation-triangle text-yellow-500';
            const label = isOut ? 'หมดแล้ว!' : 'ใกล้หมด';
            const bg = isOut ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200';
            return `<div class="${bg} border rounded-xl p-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <i class="fas ${icon} text-xl"></i>
                    <div>
                        <div class="font-bold text-gray-800">${a.product_name}</div>
                        <div class="text-xs text-gray-500">${label} — เหลือ <strong>${a.stock_qty}</strong> ชิ้น (ขั้นต่ำ ${a.stock_min})</div>
                        <div class="text-xs text-gray-400">${new Date(a.created_at).toLocaleString('th-TH')}</div>
                    </div>
                </div>
                <button onclick="dismissAlert(${a.id}, this)" class="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 bg-white border rounded-lg hover:bg-gray-50 transition">
                    <i class="fas fa-check"></i> รับทราบ
                </button>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = `<div class="text-center p-4 text-red-400">โหลดไม่ได้: ${e.message}</div>`;
    }
}

async function dismissAlert(alertId, btn) {
    btn.disabled = true;
    const { error } = await _supa.from('stock_alerts').update({ is_read: true }).eq('id', alertId);
    if (!error) { btn.closest('div.flex').remove(); checkStockAlerts(); }
}

async function dismissAllAlerts() {
    await _supa.from('stock_alerts').update({ is_read: true }).eq('is_read', false);
    closeModal('stockAlertModal'); checkStockAlerts(); showToast('รับทราบการแจ้งเตือนทั้งหมดแล้ว', 'success');
}

// ============================================================
// 💳 PROMPTPAY & QR
// ============================================================
async function initBankQR() {
    const promptPayID = localStorage.getItem('promptPayID');
    const amount = currentPayOrder ? currentPayOrder.totalPrice : 0;
    const imgEl = document.getElementById('bankQRImage');
    const labelEl = document.getElementById('ppLabel');
    if (!imgEl) return;
    if (promptPayID) {
        const payload = generatePayload(promptPayID, amount);
        imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${payload}`;
        if (labelEl) labelEl.innerText = `พร้อมเพย์: ${promptPayID}`;
        return;
    }
    try {
        const setting = await dbGet('settings', 'bankQR');
        if (setting && setting.value) {
            const val = setting.value;
            // ✅ Supabase Storage path (ใหม่)
            if (val.storagePath && val.bucket) {
                const { data } = _supa.storage.from(val.bucket).getPublicUrl(val.storagePath);
                imgEl.src = data.publicUrl + '?t=' + Date.now(); // cache bust
                if (labelEl) labelEl.innerText = "สแกนจ่ายเงิน";
            }
            // ✅ Base64 เก่า (backward compat)
            else if (val.image) {
                imgEl.src = val.image;
                if (labelEl) labelEl.innerText = "สแกนจ่ายเงิน (ภาพเก่า)";
            }
        } else {
            imgEl.src = "https://placehold.co/400x400?text=Set+PromptPay";
            if (labelEl) labelEl.innerText = "ยังไม่ได้ตั้งค่าพร้อมเพย์";
            localStorage.removeItem('bankQRID');
        }
    } catch(e) {
        imgEl.src = "https://placehold.co/400x400?text=Error";
    }
}

function handleQRClick() {
    const hasPP = localStorage.getItem('promptPayID');
    const hasBankQR = localStorage.getItem('bankQRID');
    if (hasPP) { openPromptPayModal(); } else if (hasBankQR) { openManageQRModal(true); } else { openManageQRModal(false); }
}

function openPromptPayModal() {
    document.getElementById('ppInput').value = localStorage.getItem('promptPayID') || '';
    document.getElementById('promptPayModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('ppInput').focus(), 300);
}

function savePromptPayID() {
    const newID = document.getElementById('ppInput').value;
    if (newID) {
        const cleanID = newID.trim().replace(/[^0-9]/g, '');
        if (cleanID.length === 10 || cleanID.length === 13) {
            localStorage.setItem('promptPayID', cleanID); showToast('บันทึก PromptPay แล้ว', 'success');
            initBankQR(); closeModal('promptPayModal');
        } else { alert("เบอร์โทรต้องมี 10 หลัก หรือ เลขบัตร 13 หลัก"); }
    } else { clearPromptPayID(); }
}

function clearPromptPayID() {
    localStorage.removeItem('promptPayID'); document.getElementById('ppInput').value = '';
    showToast('ลบ PromptPay แล้ว', 'success'); initBankQR(); closeModal('promptPayModal');
}

function checkAndUseOriginalQR() {
    if (localStorage.getItem('bankQRID')) {
        localStorage.removeItem('promptPayID'); initBankQR();
        showToast('กลับมาใช้รูป QR Code เดิมเรียบร้อย', 'success');
    } else { showToast('ไม่พบรูป QR Code เดิมในระบบ', 'warning'); }
}

function openManageQRModal(hasFile) {
    const modal = document.getElementById('manageQRModal');
    const statusText = document.getElementById('mqrStatusText'); const statusIcon = document.getElementById('mqrStatusIcon'); const btnDelete = document.getElementById('btnDeleteQR');
    if (hasFile) {
        statusText.innerText = "พบรูปภาพในระบบ"; statusText.className = 'text-green-600';
        statusIcon.innerHTML = '<i class="fas fa-check-circle text-green-500"></i>'; btnDelete.classList.remove('hidden');
    } else {
        statusText.innerText = "ไม่พบรูปภาพในระบบ"; statusText.className = 'text-gray-500';
        statusIcon.innerHTML = '<i class="fas fa-image"></i>'; btnDelete.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

async function deleteServerQR() {
    if (!confirm("ต้องการลบรูปภาพใช่หรือไม่?")) return;
    setLoading('btnDeleteQR', true, 'กำลังลบ...');
    try {
        await dbDelete('settings', 'bankQR');
        localStorage.removeItem('bankQRID'); initBankQR(); openManageQRModal(false); showToast('ลบรูปภาพเรียบร้อย', 'success');
    } catch(err) { alert('ลบไม่สำเร็จ: ' + err); }
    finally { setLoading('btnDeleteQR', false, 'ลบรูปภาพเดิม'); }
}

function crc16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) { let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF; x ^= x >> 4; crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF; }
    return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
}

function generatePayload(mobileNumber, amount) {
    const target = mobileNumber.replace(/[^0-9]/g, ''); let targetFormatted = target;
    if (target.length === 10 && target.startsWith('0')) { targetFormatted = '66' + target.substring(1); }
    const merchantIdTag = (targetFormatted.length >= 13) ? '02' : '01';
    const merchantInfoValue = '0016A000000677010111' + merchantIdTag + ('00' + targetFormatted.length).slice(-2) + targetFormatted;
    const merchantInfo = '29' + ('00' + merchantInfoValue.length).slice(-2) + merchantInfoValue;
    const country = '5802TH'; const currency = '5303764';
    let amountTag = ''; if (amount > 0) { const amtStr = parseFloat(amount).toFixed(2); amountTag = '54' + ('00' + amtStr.length).slice(-2) + amtStr; }
    const version = '000201'; const type = amount > 0 ? '010212' : '010211';
    const rawData = version + type + merchantInfo + country + currency + amountTag + '6304';
    return rawData + crc16(rawData);
}

// ============================================================
// ⌨️ KEYBOARD & NUMPAD
// ============================================================
let lastDotTime = 0;
function initGlobalShortcuts() {
    document.addEventListener('keydown', function(event) {
        const code = event.code; const key = event.key;
        if (code === 'NumpadAdd' || key === '+' || event.keyCode === 107 || code === 'NumpadDecimal' || key === '.' || event.keyCode === 110) {
            event.preventDefault(); event.stopPropagation();
        }
    }, true);
    document.addEventListener('keyup', function(event) {
        const code = event.code; const key = event.key;
        if (code === 'NumpadAdd' || key === '+' || event.keyCode === 107) {
            event.preventDefault(); event.stopPropagation();
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && !paymentModal.classList.contains('hidden')) { closeModal('paymentModal'); setTimeout(() => { const s = document.getElementById('searchInput'); if(s){s.focus();s.value='';} }, 100); }
            else { const s = document.getElementById('searchInput'); if(s) s.blur(); handleCheckoutClick(); }
            return false;
        }
        if (code === 'NumpadDecimal' || key === '.' || event.keyCode === 110 || event.keyCode === 190) {
            event.preventDefault(); event.stopPropagation();
            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && !paymentModal.classList.contains('hidden')) { closeModal('paymentModal'); setTimeout(() => { const s = document.getElementById('searchInput'); if(s){s.focus();s.value='';} }, 100); }
            else { const now = Date.now(); if (now - lastDotTime < 500) { const s = document.getElementById('searchInput'); if(s){s.focus();s.value='';} lastDotTime = 0; } else { lastDotTime = now; } }
            return false;
        }
    }, true);
}

function initQuickAddShortcuts() {
    const mPrice = document.getElementById('mPrice');
    if (!mPrice) return;
    mPrice.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const mName = document.getElementById('mName'); const mCode = document.getElementById('mCode');
            if (mName.value.trim() === "") { mName.value = "สินค้าทั่วไป"; }
            if (mPrice.value && mCode.value) {
                const payload = { id: mCode.value, name: mName.value, price: mPrice.value, category: document.getElementById('mCategory').value, image: "" };
                sendAddMenu(payload);
            } else { document.getElementById('btnSaveMenu').click(); }
        }
    });
}

function numpadPress(num, btnElement) {
    if (btnElement) { btnElement.classList.add('btn-pop'); setTimeout(() => btnElement.classList.remove('btn-pop'), 150); }
    const paymentModal = document.getElementById('paymentModal');
    const isPaymentOpen = !paymentModal.classList.contains('hidden');
    let targetInput = isPaymentOpen ? document.getElementById('inputReceived') : document.getElementById('searchInput');
    if (targetInput) { targetInput.value += num; targetInput.dispatchEvent(new Event('input', { bubbles: true })); }
}

function numpadAction(action) {
    const paymentModal = document.getElementById('paymentModal');
    const isPaymentOpen = !paymentModal.classList.contains('hidden');
    let targetInput = isPaymentOpen ? document.getElementById('inputReceived') : document.getElementById('searchInput');
    if (action === 'del') { targetInput.value = targetInput.value.slice(0, -1); targetInput.dispatchEvent(new Event('input', { bubbles: true })); targetInput.focus(); }
    else if (action === 'enter') { if (isPaymentOpen) { confirmPayment(); } else { processSearchEnter(); } }
}

function toggleSystemKeyboard() {
    const input = document.getElementById('searchInput'); const btn = document.getElementById('btnToggleKey');
    if (input.getAttribute('inputmode') === 'none') {
        input.setAttribute('inputmode', 'text'); btn.classList.add('bg-blue-500', 'text-white', 'border-blue-500'); btn.classList.remove('bg-white', 'text-gray-400', 'border-gray-200');
        input.placeholder = "พิมพ์ชื่อสินค้า..."; input.focus();
    } else {
        input.setAttribute('inputmode', 'none'); btn.classList.remove('bg-blue-500', 'text-white', 'border-blue-500'); btn.classList.add('bg-white', 'text-gray-400', 'border-gray-200');
        input.placeholder = "ยิงบาร์โค้ด..."; input.blur();
    }
}

// ============================================================
// 🥘 MENU & PRODUCTS
// ============================================================
async function fetchMenu() {
    const cached = localStorage.getItem('cachedMenuData');
    if (cached) { menuData = JSON.parse(cached); filterMenu('All'); }
    else { document.getElementById('loadingMenu').classList.remove('hidden'); }
    document.getElementById('noResults').classList.add('hidden');
    try {
        const data = await dbGetAll('menu');
        menuData = data || [];
        localStorage.setItem('cachedMenuData', JSON.stringify(menuData));
        masterData = [...menuData];
        filterMenu('All');
    } catch(e) { console.error("Error fetching menu", e); }
    finally { document.getElementById('loadingMenu').classList.add('hidden'); }
}

function getCategoryEmoji(category) {
    const map = { 'เครื่องดื่ม':'🥤', 'ขนม/ของว่าง':'🍪', 'ของใช้ในบ้าน':'🏠', 'อาหารแห้ง/เครื่องปรุง':'🧂', 'อาหารสด':'🥩', 'เบ็ดเตล็ด':'🛍️' };
    return map[category] || '📦';
}

function filterMenu(category) {
    let rawInput = document.getElementById('searchInput').value.toLowerCase().trim();
    const clearBtn = document.getElementById('clearSearchBtn');
    if (rawInput) clearBtn.classList.remove('hidden'); else clearBtn.classList.add('hidden');
    let searchText = rawInput;
    if (/^[0-9]{1,4}$/.test(rawInput) && parseInt(rawInput) > 0) { searchText = ""; }
    let dataSource = [];
    if (searchText !== "") {
        const combined = new Map();
        if (masterData.length > 0) { masterData.forEach(m => { if(m.id) combined.set(String(m.id), m); }); }
        menuData.forEach(m => { if(m.id) combined.set(String(m.id), m); });
        dataSource = Array.from(combined.values());
        if (dataSource.length === 0) dataSource = menuData;
    } else { dataSource = menuData; }
    if (category !== 'All' || searchText === '') {
        document.querySelectorAll('.cat-btn').forEach(btn => {
            const isActive = (btn.innerText === category) || (category === 'All' && btn.innerText === 'ทั้งหมด' && searchText === '');
            btn.className = isActive
                ? "cat-btn bg-gradient-to-r from-blue-500 to-blue-400 text-white px-6 py-2 rounded-full shadow-lg shadow-blue-200 text-sm font-bold transition transform scale-105 border border-blue-500 shrink-0"
                : "cat-btn bg-white text-gray-500 hover:bg-blue-50 hover:text-blue-600 px-6 py-2 rounded-full shadow-sm text-sm font-medium transition border border-gray-100 shrink-0";
        });
    }
    let filtered = dataSource;
    if (!searchText) { filtered = filtered.filter(m => !m.isHidden); filtered = filtered.filter(m => m.image && m.image.trim() !== ""); }
    if (category !== 'All') { filtered = filtered.filter(m => m.category === category); }
    if (searchText) {
        filtered = filtered.filter(m => m.name.toLowerCase().includes(searchText) || (m.id && String(m.id).toLowerCase().includes(searchText)));
        if (category === 'All') { document.querySelectorAll('.cat-btn').forEach(btn => btn.className = "cat-btn bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 px-5 py-2 rounded-full shadow-sm text-sm font-medium transition border border-gray-200 shrink-0"); }
    } else if (category === 'All') {
        filtered.sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category));
    }
    const grid = document.getElementById('menuGrid'); const noResults = document.getElementById('noResults');
    if (filtered.length === 0) { grid.classList.add('hidden'); noResults.classList.remove('hidden'); }
    else {
        grid.classList.remove('hidden'); noResults.classList.add('hidden');
        grid.innerHTML = filtered.map(item => {
            const editBtnHtml = isCustomerMode ? '' : `<button onclick="handleEditClick('${item.id}', event)" class="absolute top-2 right-2 bg-white/80 hover:bg-white text-gray-400 hover:text-blue-500 w-8 h-8 rounded-full shadow-sm backdrop-blur-sm z-10 flex items-center justify-center transition-all duration-200"><i class="fas fa-pencil-alt text-xs"></i></button>`;
            const imageUrl = getDriveUrl(item.image);
            const hasImage = imageUrl && imageUrl.length > 10;
            let imageHtml = hasImage
                ? `<img src="${imageUrl}" class="w-full h-full object-contain p-2 transition duration-500 group-hover:scale-110" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');"><div class="hidden w-full h-full bg-gray-50 flex flex-col items-center justify-center select-none text-blue-200"><i class="fas fa-box-open text-4xl mb-2 opacity-50"></i><div class="text-4xl">${getCategoryEmoji(item.category)}</div></div>`
                : `<div class="w-full h-full bg-gray-50 flex flex-col items-center justify-center select-none text-blue-200 group-hover:bg-blue-50 transition-colors"><i class="fas fa-box-open text-3xl mb-2 opacity-30"></i><div class="text-3xl">${getCategoryEmoji(item.category)}</div></div>`;
            // แสดง badge สต็อกถ้าใกล้หมด
            const stockBadge = !isCustomerMode && item.stockQty !== undefined && item.stockQty <= item.stockMin
                ? `<span class="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.stockQty <= 0 ? 'bg-red-500 text-white' : 'bg-yellow-400 text-yellow-900'}">
                    ${item.stockQty <= 0 ? 'หมด' : 'เหลือ ' + item.stockQty}</span>` : '';
            return `
            <div class="w-full bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden border border-gray-100 group relative transform hover:-translate-y-1 flex flex-col" onclick="handleAddToCart('${item.id}')">
                ${editBtnHtml}${stockBadge}
                <div class="w-full aspect-[2/1] sm:aspect-[16/7] bg-white relative overflow-hidden flex items-center justify-center p-1">${imageHtml}</div>
                <div class="px-3 py-2.5 flex justify-between items-center bg-gray-50 border-t border-gray-100 shrink-0">
                    <h3 class="font-bold text-gray-700 text-xs sm:text-sm truncate group-hover:text-blue-600 transition-colors flex-1 pr-2" title="${item.name}">${item.name}</h3>
                    <div class="text-blue-600 font-black text-sm sm:text-base whitespace-nowrap drop-shadow-sm">${item.price} ฿</div>
                </div>
            </div>`;
        }).join('');
    }
}

function handleAddToCart(itemId) {
    let item = masterData.find(m => m.id == itemId) || menuData.find(m => m.id == itemId);
    if (item) {
        addItemToCart(item, "-");
        setTimeout(() => { const s = document.getElementById('searchInput'); if(s && !isCustomerMode){s.focus();s.value='';} }, 100);
    }
}

function handleEditClick(itemId, e) {
    e.stopPropagation();
    let item = masterData.find(m => m.id == itemId) || menuData.find(m => m.id == itemId);
    if (item) {
        document.getElementById('editMenuModal').classList.remove('hidden');
        document.getElementById('eId').value = item.id;
        document.getElementById('eName').value = item.name;
        document.getElementById('ePrice').value = item.price;
        document.getElementById('eCategory').value = item.category;
        const eStock = document.getElementById('eStockQty'); const eMin = document.getElementById('eStockMin');
        if (eStock) eStock.value = item.stockQty || 0;
        if (eMin) eMin.value = item.stockMin || 5;
        // แสดงรูปปัจจุบัน
        const preview = document.getElementById('eImagePreview');
        const eFile = document.getElementById('eFile');
        if (eFile) eFile.value = ''; // reset file input
        if (preview) {
            const url = getDriveUrl(item.image);
            if (url) { preview.src = url; preview.classList.remove('hidden'); }
            else { preview.src = ''; preview.classList.add('hidden'); }
        }
    }
}

function previewEditImage(input) {
    const preview = document.getElementById('eImagePreview');
    if (!preview) return;
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { preview.src = e.target.result; preview.classList.remove('hidden'); };
        reader.readAsDataURL(input.files[0]);
    }
}

// ============================================================
// 🛒 CART
// ============================================================
function toggleCart(show) {
    const panel = document.getElementById('cartPanel'); const mobileBar = document.getElementById('mobileBottomBar');
    if (show) { panel.classList.remove('hidden'); panel.classList.add('flex', 'fixed', 'inset-0', 'z-50'); mobileBar.classList.add('translate-y-[150%]'); }
    else { if (window.innerWidth < 1024) { panel.classList.add('hidden'); panel.classList.remove('flex', 'fixed', 'inset-0', 'z-50'); if(cart.length > 0) mobileBar.classList.remove('translate-y-[150%]'); } }
}

function addToCart(index) { const item = menuData[index]; addItemToCart(item, "-"); }

function addItemToCart(item, spicy) {
    const existingIndex = cart.findIndex(c => c.id === item.id);
    if (existingIndex !== -1) {
        const existingItem = cart[existingIndex]; existingItem.qty++; cart.splice(existingIndex, 1); cart.unshift(existingItem); speak(existingItem.qty.toString());
    } else { cart.unshift({ ...item, qty: 1, spicy: '-' }); speak(item.price + " บาท"); }
    renderCart(); if (window.navigator.vibrate) window.navigator.vibrate(50);
}

function renderCart() {
    const container = document.getElementById('cartItems'); const totalEl = document.getElementById('totalPrice');
    const btnMobile = document.getElementById('btnOrderMobile'); const btnDesktop = document.getElementById('btnOrderDesktop');
    const countEl = document.getElementById('cartCountDesktop'); const mobileBar = document.getElementById('mobileBottomBar');
    const mobileCount = document.getElementById('mobileCartCount'); const mobileTotal = document.getElementById('mobileCartTotal');
    const miniTotal = document.getElementById('miniTotalDisplay'); const changeWrapper = document.getElementById('changeWrapper');
    if (cart.length === 0) {
        container.innerHTML = '<div class="h-full flex flex-col items-center justify-center text-gray-400 opacity-60"><i class="fas fa-cash-register text-6xl mb-4 text-blue-200"></i><p>สแกนสินค้า หรือ กดปุ่มเพื่อเปิด QR รับเงิน</p></div>';
        countEl.innerText = "0 รายการ"; mobileBar.classList.add('translate-y-[150%]');
        if(totalEl) totalEl.innerText = "0"; if(mobileTotal) mobileTotal.innerText = "0 ฿"; if(miniTotal) miniTotal.innerText = "0 ฿";
        if(btnDesktop) { btnDesktop.className = "h-12 bg-gradient-to-b from-gray-400 to-gray-500 text-white font-bold text-lg rounded-lg shadow-sm border-b-4 border-gray-600 transition-all flex flex-col items-center justify-center gap-1 cursor-not-allowed"; btnDesktop.disabled = true; btnDesktop.innerHTML = '<span class="text-xs font-normal opacity-80">ว่าง</span>'; }
        if(btnMobile) { btnMobile.innerHTML = '<span>QR รับเงิน</span> <i class="fas fa-qrcode"></i>'; btnMobile.className = "w-full bg-gradient-to-r from-green-600 to-green-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition flex justify-center items-center gap-2"; }
        return;
    }
    if(changeWrapper) { changeWrapper.classList.add('hidden','opacity-0','translate-y-4'); changeWrapper.classList.remove('flex','opacity-100','translate-y-0'); }
    if(totalEl) { totalEl.classList.remove('text-4xl','translate-y-[-5px]'); totalEl.classList.add('text-7xl'); }
    let btnClassDesktop = "", btnHtmlDesktop = "", btnHtmlMobile = "", btnClassMobile = "";
    if (isCustomerMode) {
        btnClassDesktop = "hidden"; btnHtmlMobile = '<span>ยืนยันรายการ</span> <i class="fas fa-check-circle"></i>';
        btnClassMobile = "w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition transform active:scale-95 flex justify-center items-center gap-2";
    } else {
        btnClassDesktop = "h-12 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-lg rounded-lg shadow-md border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center gap-1";
        btnHtmlDesktop = '<span class="text-xs font-normal opacity-80"></span><i class="fas fa-check-circle text-2xl"></i>';
        btnHtmlMobile = '<span>คิดเงิน</span> <i class="fas fa-arrow-right"></i>';
        btnClassMobile = "w-full bg-gradient-to-r from-blue-500 to-blue-400 hover:from-blue-600 hover:to-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition transform active:scale-95 flex justify-center items-center gap-2";
    }
    if(btnDesktop) { btnDesktop.disabled = false; btnDesktop.className = btnClassDesktop; btnDesktop.innerHTML = btnHtmlDesktop; }
    if(btnMobile) { btnMobile.innerHTML = btnHtmlMobile; btnMobile.className = btnClassMobile; }
    let total = 0; let count = 0;
    container.innerHTML = cart.map((item, idx) => {
        total += item.price * item.qty; count += item.qty;
        return `<div onclick="removeFromCart(${idx})" class="flex justify-between items-center bg-blue-50 p-3 sm:p-4 rounded-3xl border border-blue-100 shadow-lg mb-2 animate-fade-in cursor-pointer hover:bg-red-700 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group">
            <div class="flex-1 min-w-0 pr-3 border-r border-blue-200 group-hover:border-red-600 transition-colors"><div class="text-base font-bold text-gray-800 leading-tight group-hover:text-white transition-colors truncate">${item.name}</div><div class="text-sm text-gray-500 mt-1 group-hover:text-red-100 transition-colors">${item.price.toLocaleString()} บาท</div></div>
            <div class="flex flex-col items-center justify-center px-4"><span class="text-xs text-gray-400 font-medium tracking-wide mb-1 group-hover:text-red-200 transition-colors">จำนวน</span><span class="text-lg font-extrabold text-gray-800 leading-none group-hover:text-white transition-colors">${item.qty}</span></div>
            <div class="flex flex-col items-end justify-center pl-4 border-l border-blue-200 group-hover:border-red-600 transition-colors min-w-[90px]"><span class="text-xs text-gray-400 font-medium tracking-wide mb-1 group-hover:text-red-200 transition-colors">ราคารวม</span><div class="text-lg font-extrabold text-blue-500 leading-none whitespace-nowrap group-hover:text-white transition-colors">${(item.price * item.qty).toLocaleString()} บาท</div></div>
        </div>`;
    }).join('');
    const totalTxt = total.toLocaleString() + "";
    totalEl.innerText = totalTxt; countEl.innerText = count + " รายการ";
    mobileCount.innerText = count; mobileTotal.innerText = totalTxt + " ฿"; if(miniTotal) miniTotal.innerText = totalTxt + " ฿";
    const isDrawerOpen = !document.getElementById('cartPanel').classList.contains('hidden');
    if (!isDrawerOpen && window.innerWidth < 1024) { mobileBar.classList.remove('translate-y-[150%]'); }
}

function updateQty(idx, change) {
    cart[idx].qty += change; if (cart[idx].qty > 0) { speak(cart[idx].qty.toString()); }
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    renderCart(); setTimeout(() => { const s = document.getElementById('searchInput'); if(s && !isCustomerMode){s.focus();s.value='';} }, 100);
}

function removeFromCart(idx) {
    cart.splice(idx, 1); renderCart();
    setTimeout(() => { const s = document.getElementById('searchInput'); if(s && !isCustomerMode){s.focus();s.value='';} }, 100);
}

// ============================================================
// 🛒 CHECKOUT & ORDERS
// ============================================================
function handleCheckoutClick() {
    if (cart.length === 0) { quickCheckout(); return; }
    if (isCustomerMode) { isQuickPayMode = false; openConfirmOrderModal(); } else { quickCheckout(); }
}

function quickCheckout() {
    isQuickPayMode = true;
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    currentPayOrder = { orderId: null, totalPrice: total };
    const tableContainer = document.getElementById('quickPayTableNoContainer'); if (tableContainer) tableContainer.classList.add('hidden');
    try { initBankQR(); } catch(e) {}
    const modal = document.getElementById('paymentModal'); if (modal) modal.classList.remove('hidden');
    const modalTotal = document.getElementById('modalTotalPay'); if(modalTotal) modalTotal.innerText = total.toLocaleString();
    const modalChangeBox = document.getElementById('modalChangeBox');
    if(modalChangeBox) { modalChangeBox.classList.add('opacity-0','translate-y-2'); modalChangeBox.innerHTML = `เงินทอน: <span id="modalChangePay" class="text-green-600 text-5xl font-extrabold ml-2 drop-shadow-sm animate-heartbeat">0</span> <span class="ml-1 text-sm">฿</span>`; }
    const inputRec = document.getElementById('inputReceived'); if(inputRec) { inputRec.value = ''; setTimeout(() => inputRec.focus(), 100); }
    const totalPriceEl = document.getElementById('totalPrice'); const changeWrapper = document.getElementById('changeWrapper');
    if(totalPriceEl) { totalPriceEl.classList.remove('text-4xl','translate-y-[-10px]'); totalPriceEl.classList.add('text-7xl'); }
    if(changeWrapper) { changeWrapper.classList.add('hidden','opacity-0','translate-y-4'); changeWrapper.classList.remove('flex','opacity-100','translate-y-0'); }
    const btnConfirm = document.getElementById('btnConfirmPay'); if(btnConfirm) { btnConfirm.disabled = false; btnConfirm.classList.remove('opacity-50','cursor-not-allowed'); }
    if (total > 0) { speak("ยอดรวม " + total + " บาท"); }
    if(typeof renderPaymentReceipt === 'function') renderPaymentReceipt();
}

function openConfirmOrderModal() {
    document.getElementById('confirmOrderModal').classList.remove('hidden');
    document.getElementById('summaryList').innerHTML = cart.map(i => `<div class="flex justify-between border-b border-gray-200 border-dashed py-2 last:border-0"><span class="text-gray-700 text-sm">${i.name} x${i.qty}</span><span class="font-bold text-gray-800">${i.price*i.qty}</span></div>`).join('') +
        `<div class="flex justify-between font-bold mt-3 pt-3 border-t text-blue-600 text-lg"><span>รวมทั้งหมด</span><span>${document.getElementById('totalPrice').innerText}</span></div>`;
    const typeSelect = document.getElementById('orderType'); const typeDiv = typeSelect.parentElement;
    const addressSection = document.getElementById('addressSection'); const tableDiv = document.getElementById('tableNo').parentElement;
    const tableInput = document.getElementById('tableNo');
    if (isCustomerMode) {
        typeSelect.value = "ส่งเดลิเวอรี่"; typeDiv.classList.add('hidden'); tableDiv.classList.add('hidden'); addressSection.classList.add('hidden');
        const cName = localStorage.getItem('customerName') || 'ลูกค้า'; const cPhone = localStorage.getItem('customerPhone') || '-';
        const savedHouse = localStorage.getItem('customerAddrHouse') || ''; const savedSoi = localStorage.getItem('customerAddrSoi') || '';
        const addressStr = `[ส่งที่: ${savedHouse} ${savedSoi ? 'ซ.' + savedSoi : ''}]`;
        tableInput.value = `${cName} (${cPhone}) ${addressStr}`;
        document.getElementById('addrHouseNo').value = savedHouse; document.getElementById('addrSoi').value = savedSoi;
    } else {
        typeDiv.classList.remove('hidden'); tableDiv.classList.remove('hidden'); toggleAddressFields();
        tableDiv.querySelector('label').innerText = "ชื่อลูกค้า / คิวที่"; tableInput.placeholder = "เช่น 1 หรือ A";
    }
}

function toggleAddressFields() {
    const type = document.getElementById('orderType').value; const addrSection = document.getElementById('addressSection');
    if (type === 'ส่งเดลิเวอรี่') { addrSection.classList.remove('hidden'); } else { addrSection.classList.add('hidden'); }
}

async function submitOrder() {
    setLoading('btnSubmitOrder', true, 'กำลังบันทึก...');
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    if (isCustomerMode && total < 100) { setLoading('btnSubmitOrder', false, 'ยืนยันรายการ'); return; }
    if (isCustomerMode) { speak("ยอดรวม " + total.toLocaleString() + " บาท"); }
    const orderType = document.getElementById('orderType').value;
    let noteText = document.getElementById('orderNote').value.trim();
    let finalTableNo = document.getElementById('tableNo').value;
    const cName = localStorage.getItem('customerName') || '';
    const cPhone = localStorage.getItem('customerPhone') || '';
    const houseNo = document.getElementById('addrHouseNo')?.value.trim() || '';
    const soi = document.getElementById('addrSoi')?.value.trim() || '';
    if (orderType === 'ส่งเดลิเวอรี่' && isCustomerMode && (!houseNo || !soi)) {
        showCustomAlert('ข้อมูลที่อยู่ขาดหาย', 'กรุณากรอกที่อยู่จัดส่ง', '<i class="fas fa-map-marked-alt text-red-500"></i>');
        setLoading('btnSubmitOrder', false, 'ยืนยันรายการ'); return;
    }
    const orderId = "ORD-" + Date.now();
    const orderData = {
        orderId: orderId, tableNo: finalTableNo || "หน้าร้าน", orderType: orderType,
        items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, spicy: "-" })),
        totalPrice: total, note: noteText, status: 'Pending',
        customerName: cName, customerPhone: cPhone, addrHouse: houseNo, addrSoi: soi,
        deliveryStatus: 'รอยืนยัน', timestamp: new Date().toISOString()
    };
    try {
        await dbPut('orders', orderData);
        myLastOrders = { items: [...cart], total: total, note: noteText, timestamp: new Date().toISOString() };
        showToast('บันทึกรายการขายแล้ว!', 'success');
        if (isCustomerMode) { setTimeout(() => speak("ขอบคุณค่ะ"), 1500); } else { speak("บันทึกรายการแล้วค่ะ"); }
        cart = []; renderCart(); toggleCart(false); closeModal('confirmOrderModal');
        if(!isCustomerMode) document.getElementById('tableNo').value = '';
        document.getElementById('orderNote').value = ''; if(document.getElementById('addrHouseNo')) document.getElementById('addrHouseNo').value = ''; if(document.getElementById('addrSoi')) document.getElementById('addrSoi').value = '';
        if(isCustomerMode) openMyRecentOrder();
        updateKitchenBadge();
    } catch(err) {
        showCustomAlert('ผิดพลาด', 'ส่งออเดอร์ไม่สำเร็จ: ' + err, '<i class="fas fa-exclamation-circle text-red-500"></i>');
    } finally { setLoading('btnSubmitOrder', false, 'ยืนยันรายการ'); }
}

// ============================================================
// 🍳 KITCHEN / ORDERS PANEL
// ============================================================
async function updateKitchenBadge() {
    try {
        const { data } = await _supa.from('orders').select('order_id, status, table_no, created_at').neq('status', 'Paid');
        const waitingCount = (data || []).filter(o => o.status !== 'Served' && o.status !== 'Paid').length;
        const badge = document.getElementById('kitchenBadge');
        if (waitingCount > 0) { badge.innerText = waitingCount; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
        if (!isCustomerMode) {
            const isKitchenModalOpen = !document.getElementById('kitchenModal').classList.contains('hidden');
            if (lastOrderCount !== -1 && waitingCount > lastOrderCount) { playNotificationSound(); showToast('มีรายการใหม่เข้ามา!', 'warning'); }
        }
        lastOrderCount = waitingCount;
        if (isCustomerMode) {
            document.getElementById('queueCountDisplay').innerText = waitingCount;
            const cName = localStorage.getItem('customerName') || 'ลูกค้า'; const cPhone = localStorage.getItem('customerPhone') || '-';
            const savedHouse = localStorage.getItem('customerAddrHouse') || ''; const savedSoi = localStorage.getItem('customerAddrSoi') || '';
            const addressStr = `[ส่งที่: ${savedHouse} ${savedSoi ? 'ซ.' + savedSoi : ''}]`;
            const myIdentity = `${cName} (${cPhone}) ${addressStr}`;
            const { data: myOrders } = await _supa.from('orders').select('*').eq('table_no', myIdentity);
            (myOrders || []).forEach(order => {
                if (order.status === 'Served' && !notifiedOrders.has(order.order_id)) {
                    document.getElementById('deliveryNotificationModal').classList.remove('hidden');
                    playNotificationSound(); speak("สินค้ากำลังไปส่งค่ะ"); notifiedOrders.add(order.order_id);
                }
            });
        }
    } catch(e) {}
}

function startOrderPolling() { updateKitchenBadge().finally(() => { setTimeout(startOrderPolling, 5000); }); }

async function openKitchenModal() {
    document.getElementById('kitchenModal').classList.remove('hidden');
    await fetchOrders();
}

let _allOrders = []; // cache สำหรับ filter

async function fetchOrders() {
    const grid = document.getElementById('kitchenGrid');
    grid.innerHTML = '<div class="col-span-full text-center py-20"><i class="fas fa-circle-notch fa-spin text-4xl text-orange-400"></i><p class="mt-2 text-gray-400">กำลังโหลดออเดอร์...</p></div>';
    try {
        const { data, error } = await _supa.from('orders').select('*').neq('status', 'Paid').order('created_at', { ascending: true });
        if (error) throw error;
        _allOrders = (data || []).map(rowToOrder);
        currentOrders = _allOrders;
        // อัปเดต count
        const countEl = document.getElementById('kitchenOrderCount');
        if (countEl) countEl.innerText = _allOrders.length;
        renderKitchen(_allOrders);
        updateKitchenBadge();
    } catch (err) {
        grid.innerHTML = `<div class="col-span-full text-center text-red-500">Error: ${err.message}</div>`;
    }
}

// กรองออเดอร์ตาม tab
function filterKitchen(type) {
    // อัปเดต tab UI
    ['all','delivery','walkin'].forEach(t => {
        const btn = document.getElementById('kTab_' + t);
        if (!btn) return;
        if (t === type) {
            btn.className = 'px-3 py-1.5 bg-white/20 text-white transition';
        } else {
            btn.className = 'px-3 py-1.5 text-white/60 hover:bg-white/10 transition';
        }
    });
    // filter
    let filtered = _allOrders;
    if (type === 'delivery') filtered = _allOrders.filter(o => o.orderType === 'ส่งเดลิเวอรี่');
    if (type === 'walkin')   filtered = _allOrders.filter(o => o.orderType !== 'ส่งเดลิเวอรี่');
    renderKitchen(filtered);
}

function renderKitchen(orders) {
    const grid = document.getElementById('kitchenGrid');
    grid.innerHTML = '';
    if (!orders || orders.length === 0) {
        grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center text-gray-300 py-20 animate-fade-in">
            <i class="fas fa-motorcycle text-6xl mb-4"></i>
            <p class="text-lg font-bold">ไม่มีออเดอร์ค้างอยู่</p>
            <p class="text-sm mt-1">ออเดอร์ใหม่จะแสดงที่นี่ทันที</p>
        </div>`;
        return;
    }
    grid.innerHTML = orders.map(order => {
        const isServed   = order.status === 'Served';
        const isDelivery = order.orderType === 'ส่งเดลิเวอรี่';
        const dStatus    = order.deliveryStatus || 'รอยืนยัน';
        const statusColor = {
            'รอยืนยัน':       'bg-gray-100 text-gray-600',
            'กำลังจัดเตรียม': 'bg-blue-100 text-blue-700',
            'กำลังจัดส่ง':    'bg-yellow-100 text-yellow-800',
            'ส่งแล้ว':        'bg-green-100 text-green-800',
        };
        const headerBg   = isServed ? 'bg-green-500' : isDelivery ? 'bg-orange-500' : 'bg-blue-500';
        const cardBorder = isServed ? 'border-green-300' : isDelivery ? 'border-orange-300' : 'border-blue-300';
        const timeDiff   = Math.floor((new Date() - new Date(order.timestamp)) / 60000);
        let timeAgoText  = timeDiff < 1 ? 'เมื่อสักครู่' : timeDiff + ' นาทีที่แล้ว';
        if (timeDiff > 20 && !isServed) timeAgoText = '<span class="text-red-300 animate-pulse">⚠️ ' + timeAgoText + '</span>';
        const addrLine = (order.addrHouse || order.addrSoi)
            ? `<div class="px-4 pt-3"><div class="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-xl p-2.5 text-sm">
                <i class="fas fa-map-marker-alt text-orange-500 mt-0.5"></i>
                <div>
                    <div class="font-bold text-orange-800">${order.addrHouse||''} ${order.addrSoi ? 'ซ.'+order.addrSoi : ''}</div>
                    ${order.customerPhone ? '<div class="text-xs text-orange-600"><i class="fas fa-phone mr-1"></i>' + order.customerPhone + '</div>' : ''}
                </div></div></div>` : '';
        const deliveryStatusBtns = isDelivery ? `
            <div class="flex gap-1 flex-wrap px-3 pb-2">
                ${['รอยืนยัน','กำลังจัดเตรียม','กำลังจัดส่ง','ส่งแล้ว'].map(s =>
                    `<button onclick="setDeliveryStatus('${order.orderId}','${s}',this)"
                        class="flex-1 text-xs py-1.5 rounded-lg font-bold transition active:scale-95 min-w-[70px] ${dStatus===s ? (statusColor[s]||'bg-gray-100')+' ring-2 ring-offset-1 ring-orange-400' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}">
                        ${s==='กำลังจัดส่ง'?'🏍️ ':s==='ส่งแล้ว'?'✅ ':s==='กำลังจัดเตรียม'?'📦 ':'⏳ '}${s}
                    </button>`).join('')}
            </div>` : '';
        return `<div class="bg-white border-2 ${cardBorder} rounded-2xl shadow-md flex flex-col animate-fade-in overflow-hidden">
            <div class="${headerBg} px-4 py-3 text-white flex justify-between items-start">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-lg font-extrabold">${order.customerName || order.tableNo || 'Walk-in'}</span>
                        <span class="text-xs bg-white/20 px-2 py-0.5 rounded-full">${isDelivery ? '🏍️ ส่งถึงบ้าน' : '🏪 หน้าร้าน'}</span>
                    </div>
                    ${order.customerPhone ? '<div class="text-xs opacity-80 mt-0.5"><i class="fas fa-phone mr-1"></i>' + order.customerPhone + '</div>' : ''}
                </div>
                <div class="text-right shrink-0">
                    <div class="font-mono text-sm font-bold">${new Date(order.timestamp).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</div>
                    <div class="text-[10px] opacity-80">${timeAgoText}</div>
                </div>
            </div>
            ${addrLine}
            <div class="px-4 py-3 flex-1">
                ${order.note ? '<div class="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-900 text-xs p-2 rounded-r mb-2 font-bold"><i class="fas fa-comment-dots mr-1"></i>' + order.note + '</div>' : ''}
                <div class="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                    ${(order.items||[]).map(i => `<div class="flex items-center px-3 py-2 border-b border-gray-100 last:border-0"><div class="flex-1 font-bold text-gray-800 text-sm">${i.name}</div><div class="text-xs text-gray-400 mr-3">x${i.qty}</div><div class="font-bold text-blue-600 text-sm">${(i.price*i.qty).toLocaleString()} ฿</div></div>`).join('')}
                    <div class="flex justify-between items-center px-3 py-2 bg-gray-100">
                        <span class="text-xs font-bold text-gray-500">รวมทั้งหมด</span>
                        <span class="text-base font-extrabold text-blue-600">${order.totalPrice.toLocaleString()} ฿</span>
                    </div>
                </div>
            </div>
            ${deliveryStatusBtns}
            <div class="px-3 pb-3 flex gap-2">
                ${!isServed
                    ? `<button onclick="markServed('${order.orderId}',this)" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm shadow transition active:scale-95"><i class="fas fa-check mr-1"></i>จัดเสร็จ</button>`
                    : `<div class="flex-1 text-center text-green-600 font-bold py-2.5 bg-green-50 rounded-xl border border-green-200 text-sm"><i class="fas fa-check-double mr-1"></i>เรียบร้อยแล้ว</div>`}
                <button onclick="openPayment('${order.orderId}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-bold text-sm shadow transition active:scale-95">💰 ชำระเงิน</button>
            </div>
        </div>`;
    }).join('');
}

async function setDeliveryStatus(orderId, newStatus, btn) {
    btn.disabled = true;
    const { error } = await _supa.from('orders').update({ delivery_status: newStatus }).eq('order_id', orderId);
    if (!error) {
        showToast((newStatus==='กำลังจัดส่ง'?'🏍️ ':newStatus==='ส่งแล้ว'?'✅ ':'📦 ') + newStatus, 'success');
        if (newStatus === 'ส่งแล้ว') {
            await _supa.from('orders').update({ status: 'Served' }).eq('order_id', orderId);
        }
        await fetchOrders();
    }
    btn.disabled = false;
}

async function updateDeliveryStatus(orderId) {
    const statuses = ['รอยืนยัน', 'กำลังจัดเตรียม', 'กำลังจัดส่ง', 'ส่งแล้ว'];
    const choice = window.prompt(`เลือกสถานะ:\n${statuses.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\nพิมพ์เลข 1-4`);
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= statuses.length) return;
    const { error } = await _supa.from('orders').update({ delivery_status: statuses[idx] }).eq('order_id', orderId);
    if (!error) { showToast(`อัปเดตสถานะ: ${statuses[idx]}`, 'success'); fetchOrders(); }
}

async function markServed(orderId, btn) {
    const originalContent = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    try {
        const { error } = await _supa.from('orders').update({ status: 'Served' }).eq('order_id', orderId);
        if (error) throw error;
        fetchOrders(); showToast('จัดเสร็จแล้ว ✅', 'success');
    } catch(e) { btn.disabled = false; btn.innerHTML = originalContent; }
}

async function updateDeliveryStatus(orderId) {
    const statuses = ['รอยืนยัน', 'กำลังจัดเตรียม', 'กำลังจัดส่ง', 'ส่งแล้ว'];
    const statusStr = statuses.join('\n');
    const choice = window.prompt(`เลือกสถานะจัดส่ง:\n${statuses.map((s,i) => `${i+1}. ${s}`).join('\n')}\n\nพิมพ์เลข 1-4`);
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= statuses.length) return;
    const { error } = await _supa.from('orders').update({ delivery_status: statuses[idx] }).eq('order_id', orderId);
    if (!error) { showToast(`อัปเดตสถานะ: ${statuses[idx]}`, 'success'); fetchOrders(); }
}



function openPayment(orderId) {
    currentPayOrder = currentOrders.find(o => String(o.orderId) === String(orderId));
    if (!currentPayOrder) { showCustomAlert('ผิดพลาด', 'ไม่พบข้อมูลออเดอร์นี้'); return; }
    cart = JSON.parse(JSON.stringify(currentPayOrder.items)); renderCart(); toggleCart(true); closeModal('kitchenModal');
    isQuickPayMode = false; document.getElementById('quickPayTableNoContainer').classList.add('hidden');
    initBankQR(); document.getElementById('paymentModal').classList.remove('hidden');
    const totalEl = document.getElementById('modalTotalPay'); if(totalEl) totalEl.innerText = currentPayOrder.totalPrice.toLocaleString();
    const inputRec = document.getElementById('inputReceived'); if(inputRec) { inputRec.value = ''; setTimeout(() => inputRec.focus(), 300); }
    const modalChangeBox = document.getElementById('modalChangeBox'); if(modalChangeBox) { modalChangeBox.classList.add('opacity-0','translate-y-2'); const changeTxt = document.getElementById('modalChangePay'); if(changeTxt) changeTxt.innerText = "0"; }
    const btnConfirm = document.getElementById('btnConfirmPay'); if(btnConfirm) { btnConfirm.disabled = false; btnConfirm.classList.remove('opacity-50','cursor-not-allowed'); }
    speak("ยอดรวม " + currentPayOrder.totalPrice + " บาท");
    if(typeof renderPaymentReceipt === 'function') renderPaymentReceipt();
}

function addMoney(amount) { const input = document.getElementById('inputReceived'); input.value = Number(input.value) + amount; calcChange(); }
function setExactMoney() { document.getElementById('inputReceived').value = currentPayOrder.totalPrice; calcChange(); }
function clearMoney() { document.getElementById('inputReceived').value = ''; calcChange(); }

let ttsTimer = null;
function calcChange() {
    const total = currentPayOrder.totalPrice;
    const inputEl = document.getElementById('inputReceived');
    const received = Number(inputEl.value);
    const change = received - total;
    const btn = document.getElementById('btnConfirmPay');
    const modalChangeBox = document.getElementById('modalChangeBox');
    const mainChangeWrapper = document.getElementById('changeWrapper');
    const mainChangeText = document.getElementById('mainScreenChange');
    const mainTotalEl = document.getElementById('totalPrice');
    const modalTotalWrapper = document.getElementById('modalTotalWrapper');
    if (inputEl.value !== '') { if(modalTotalWrapper) modalTotalWrapper.classList.add('scale-50','opacity-40','-translate-y-2'); }
    else { if(modalTotalWrapper) modalTotalWrapper.classList.remove('scale-50','opacity-40','-translate-y-2'); }
    if (mainChangeWrapper && mainChangeText) {
        if (received >= total && total > 0) {
            mainChangeWrapper.classList.remove('hidden','opacity-0','translate-y-4'); mainChangeWrapper.classList.add('flex','opacity-100','translate-y-0');
            if(mainTotalEl) { mainTotalEl.classList.remove('text-7xl'); mainTotalEl.classList.add('text-4xl','translate-y-[-5px]'); }
            mainChangeText.innerText = change.toLocaleString() + " ฿"; mainChangeText.classList.remove('text-red-500'); mainChangeText.classList.add('text-green-600');
        } else {
            mainChangeWrapper.classList.add('hidden','opacity-0','translate-y-4'); mainChangeWrapper.classList.remove('flex','opacity-100','translate-y-0');
            if(mainTotalEl) { mainTotalEl.classList.remove('text-4xl','translate-y-[-5px]'); mainTotalEl.classList.add('text-7xl'); }
        }
    }
    if (received >= total && total > 0) {
        if(modalChangeBox) { modalChangeBox.classList.remove('opacity-0','translate-y-2'); modalChangeBox.innerHTML = `<div class="flex flex-col items-center justify-center w-full animate-fade-in text-center transform scale-110 transition-transform duration-500"><span class="text-green-600 text-sm font-bold tracking-wide mb-1">เงินทอน</span><div class="flex items-baseline justify-center gap-2"><span class="text-green-500 text-7xl font-black drop-shadow-md">${change.toLocaleString()}</span><span class="text-green-600 text-4xl font-extrabold">฿</span></div></div>`; }
        clearTimeout(ttsTimer); ttsTimer = setTimeout(() => { if(change > 0) speak("รับเงิน " + received + " บาท เงินทอน " + change + " บาท"); }, 800);
    } else { if(modalChangeBox) { modalChangeBox.classList.add('opacity-0','translate-y-2'); modalChangeBox.innerHTML = ''; } }
    if(btn) { btn.disabled = false; btn.classList.remove('opacity-50','cursor-not-allowed'); }
    if(received >= total) { inputEl.classList.replace('border-blue-500','border-green-500'); inputEl.classList.replace('text-blue-600','text-green-600'); }
    else { inputEl.classList.replace('border-green-500','border-blue-500'); inputEl.classList.replace('text-green-600','text-blue-600'); }
    if(typeof updateSlipChange === 'function') updateSlipChange();
}

function confirmPayment() {
    const inputRec = document.getElementById('inputReceived'); let received = Number(inputRec.value);
    if (!currentPayOrder) { showCustomAlert('Error','ข้อมูลผิดพลาด กรุณาปิดหน้าต่างแล้วลองใหม่'); return; }
    const total = currentPayOrder.totalPrice;
    if (received === 0) { received = total; inputRec.value = total; }
    if (received < total) { showToast('ยอดเงินไม่ครบ','warning'); playNotificationSound(); inputRec.classList.add('animate-pulse','bg-red-100'); setTimeout(() => inputRec.classList.remove('animate-pulse','bg-red-100'), 500); return; }
    const orderId = currentPayOrder.orderId; const finalChange = received - total;
    closeModal('paymentModal');
    const leftPanel = document.getElementById('leftPanel'); if(leftPanel) leftPanel.classList.remove('blur-sm','opacity-50','pointer-events-none');
    speak("ขอบคุณค่ะ");
    if(inputRec) inputRec.value = '';
    const modalChangeBox = document.getElementById('modalChangeBox'); if(modalChangeBox) { modalChangeBox.classList.add('opacity-0','translate-y-2'); const mc = document.getElementById('modalChangePay'); if(mc) mc.innerText = "0"; }
    let payload = {}; let itemsToSave = [];
    if (isQuickPayMode) {
        itemsToSave = cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price }));
        const quickPayInput = document.getElementById('quickPayTableNo'); let customName = (quickPayInput ? quickPayInput.value : "").trim(); if(!customName) customName = "Walk-in";
        payload = { tableNo: customName, finalPrice: total, received: received, change: finalChange, items: itemsToSave, orderType: "ซื้อหน้าร้าน" };
    } else {
        payload = { orderId: orderId, tableNo: currentPayOrder.tableNo, orderType: currentPayOrder.orderType, items: currentPayOrder.items, finalPrice: total, received: received, change: finalChange };
    }
    cart = []; toggleCart(false); renderCart();
    setTimeout(() => {
        const totalEl = document.getElementById('totalPrice'); const changeWrapper = document.getElementById('changeWrapper'); const mainScreenChange = document.getElementById('mainScreenChange');
        if(totalEl) { totalEl.innerText = total.toLocaleString() + " ฿"; totalEl.classList.remove('text-7xl'); totalEl.classList.add('text-4xl','translate-y-[-5px]'); }
        if(changeWrapper && mainScreenChange) { mainScreenChange.innerText = finalChange.toLocaleString() + " ฿"; mainScreenChange.classList.remove('text-red-500'); mainScreenChange.classList.add('text-green-600'); changeWrapper.classList.remove('hidden','opacity-0','translate-y-4'); changeWrapper.classList.add('flex','opacity-100','translate-y-0'); }
    }, 50);
    sendPaymentRequest(payload, isQuickPayMode);
    setTimeout(() => {
        if(cart.length === 0) {
            const totalEl = document.getElementById('totalPrice'); const changeWrapper = document.getElementById('changeWrapper');
            if(changeWrapper) { changeWrapper.classList.add('hidden','opacity-0','translate-y-4'); changeWrapper.classList.remove('flex','opacity-100','translate-y-0'); }
            if(totalEl) { totalEl.innerText = "0"; totalEl.classList.remove('text-4xl','translate-y-[-5px]'); totalEl.classList.add('text-7xl'); }
        }
        const searchInput = document.getElementById('searchInput'); if(searchInput) { searchInput.focus(); searchInput.value = ''; }
    }, 300);
}

async function sendPaymentRequest(payload, isQuickPay) {
    try {
        const billId = "B" + Date.now();
        const historyData = {
            billId: billId, date: new Date().toISOString(), table: payload.tableNo,
            type: payload.orderType || 'หน้าร้าน',
            itemSummary: payload.items.map(i => i.name).join(', '),
            items: payload.items, total: payload.finalPrice,
            receive: payload.received, change: payload.change, note: payload.note || ''
        };
        await dbPut('history', historyData);
        // 🖨️ ปริ้นอัตโนมัติ — เฉพาะเมื่อเปิดใช้งาน + เครื่องปริ้นเชื่อมต่ออยู่
        if (isAutoPrintEnabled() && PRINTER.isConnected() && !IS_IOS && HAS_BLUETOOTH) {
            await printReceipt(historyData);
        }
        // ตัดสต็อกผ่าน Supabase RPC function
        const itemsWithId = payload.items.filter(i => i.id && i.id.toString().indexOf('MANUAL') === -1);
        if (itemsWithId.length > 0) {
            await _supa.rpc('deduct_stock_on_bill', { bill_items: itemsWithId });
            // รีเฟรชเมนูเพื่ออัปเดต badge สต็อก
            localStorage.removeItem('cachedMenuData');
            fetchMenu();
            // เช็ค alert
            checkStockAlerts();
        }
        if (!isQuickPay && payload.orderId) {
            await _supa.from('orders').update({ status: 'Paid' }).eq('order_id', payload.orderId);
        }
        showToast('ชำระเงินเรียบร้อย', 'success');
        if (!isQuickPay) fetchOrders();
    } catch(err) {
        showCustomAlert('ผิดพลาด', 'บันทึกบิลไม่สำเร็จ: ' + err);
    }
}

// ============================================================
// 📊 REPORTS & HISTORY
// ============================================================
function openEditMenu(index, e) {
    e.stopPropagation(); const item = menuData[index];
    document.getElementById('editMenuModal').classList.remove('hidden');
    document.getElementById('eId').value = item.id; document.getElementById('eName').value = item.name;
    document.getElementById('ePrice').value = item.price; document.getElementById('eCategory').value = item.category;
}
function openAddMenuModal() { document.getElementById('addModal').classList.remove('hidden'); }

let salesModalTimer = null;
async function openSalesModal() {
    document.getElementById('salesModal').classList.remove('hidden');
    document.getElementById('saleToday').innerText = '...'; document.getElementById('saleYest').innerText = '...'; document.getElementById('saleMonth').innerText = '...';
    if (salesModalTimer) clearTimeout(salesModalTimer);
    try {
        const history = await dbGetAll('history');
        let today = 0, yesterday = 0, month = 0;
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const yestDate = new Date(now.getTime() - 86400000);
        const yestStr = `${yestDate.getFullYear()}-${String(yestDate.getMonth()+1).padStart(2,'0')}-${String(yestDate.getDate()).padStart(2,'0')}`;
        const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        history.forEach(b => {
            const localBDate = new Date(b.date);
            const bDateStr = `${localBDate.getFullYear()}-${String(localBDate.getMonth()+1).padStart(2,'0')}-${String(localBDate.getDate()).padStart(2,'0')}`;
            const bMonthStr = `${localBDate.getFullYear()}-${String(localBDate.getMonth()+1).padStart(2,'0')}`;
            if (bDateStr === todayStr) today += parseFloat(b.total || 0);
            if (bDateStr === yestStr) yesterday += parseFloat(b.total || 0);
            if (bMonthStr === monthStr) month += parseFloat(b.total || 0);
        });
        document.getElementById('saleToday').innerText = today.toLocaleString();
        document.getElementById('saleYest').innerText = yesterday.toLocaleString();
        document.getElementById('saleMonth').innerText = month.toLocaleString();
        salesModalTimer = setTimeout(() => { closeModal('salesModal'); }, 5000);
    } catch(e) {}
}

async function openHistoryModal() {
    document.getElementById('historyModal').classList.remove('hidden');
    const list = document.getElementById('historyList');
    list.innerHTML = '<tr><td colspan="3" class="text-center p-10 text-gray-400"><i class="fas fa-circle-notch fa-spin text-2xl mb-2"></i><br>กำลังโหลดรายการ...</td></tr>';
    try {
        const data = await dbGetAll('history');
        data.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        historyBills = data.slice(0, 200);
        renderHistoryList();
        const badgeCount = document.querySelector('#historyModal h3 span');
        if (badgeCount) badgeCount.innerText = `ล่าสุด ${historyBills.length} บิล`;
    } catch(e) {
        list.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-red-400">โหลดข้อมูลไม่ได้</td></tr>';
    }
}

function renderHistoryList() {
    const list = document.getElementById('historyList');
    if (!historyBills || historyBills.length === 0) { list.innerHTML = '<tr><td colspan="3" class="text-center p-10 text-gray-300">ไม่พบประวัติการขาย</td></tr>'; return; }
    list.innerHTML = historyBills.map((b, index) => {
        let dateStr = "-"; let timeStr = "-";
        try { const d = new Date(b.date); dateStr = d.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'2-digit'}); timeStr = d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}); } catch(e) {}
        return `<tr onclick="openBillDetail(${index})" class="hover:bg-blue-50 transition duration-150 cursor-pointer group border-b border-gray-100 last:border-0">
            <td class="p-3 font-mono align-top pt-3 group-hover:text-blue-600"><div class="text-[10px] text-gray-400 font-bold leading-none mb-1">${dateStr}</div><div class="text-sm font-bold text-gray-700">${timeStr}</div></td>
            <td class="p-3 text-gray-700 align-top pt-3"><span class="line-clamp-1 leading-relaxed font-medium group-hover:text-blue-800">${b.itemSummary}</span><span class="text-[10px] text-gray-400 block mt-0.5">ID: ${b.billId}</span></td>
            <td class="p-3 text-right font-bold text-gray-800 align-top pt-3 whitespace-nowrap text-base group-hover:text-blue-600">${parseFloat(b.total).toLocaleString()}</td>
        </tr>`;
    }).join('');
}

function openBillDetail(index) {
    const bill = historyBills[index]; if (!bill) return;
    const d = new Date(bill.date);
    const dateStr = d.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'});
    const timeStr = d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const tableNo = bill.table || 'N/A';
    const customerMatch = tableNo.match(/(.*)\s*\((.*?)\)\s*(\[ส่งที่:\s*.*\])?/);
    const customerName = customerMatch ? customerMatch[1].trim() : tableNo;
    const customerPhone = customerMatch && customerMatch[2] ? customerMatch[2].trim() : '';
    const customerAddress = customerMatch && customerMatch[3] ? customerMatch[3] : '';
    let totalQty = 0; let itemCount = bill.items.length;
    const itemsHtml = bill.items.map(item => {
        totalQty += item.qty; const itemTotal = item.price * item.qty;
        return `<div class="leading-tight mb-1"><div class="break-words">${item.qty} ${item.name}</div><div class="flex justify-end gap-2 mt-0.5"><span class="w-14 text-right">${item.price.toLocaleString('th-TH',{minimumFractionDigits:2})}</span><span class="w-16 text-right">${itemTotal.toLocaleString('th-TH',{minimumFractionDigits:2})}</span></div></div>`;
    }).join('');
    const content = document.getElementById('billDetailContent');
    content.innerHTML = `<div class="flex-1 overflow-y-auto bg-gray-100 p-4 flex flex-col items-center justify-start relative">
        <button onclick="closeModal('billDetailModal')" class="absolute top-4 right-4 bg-white hover:bg-red-50 text-gray-400 hover:text-red-500 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-sm z-20 active:scale-95 border border-gray-200"><i class="fas fa-times text-lg"></i></button>
        <div class="bg-white w-full max-w-[280px] text-gray-800 text-[11px] shadow-sm p-4 pb-6 relative font-mono shrink-0 mb-5 mt-8">
            <div class="text-center mb-3"><h3 class="font-bold text-[14px]">ร้านเจ้พินขายของชำ</h3><p>29/30 บ่อวิน ศรีราชา ชลบุรี 20230</p><p class="mt-2 font-bold text-[13px]">ใบเสร็จรับเงิน</p></div>
            <div class="mb-2 space-y-0.5"><div class="flex gap-2"><span>เลขที่:</span><span>${bill.billId}</span></div><div class="flex gap-2"><span>วันที่:</span><span>${dateStr} ${timeStr}</span></div><div class="flex gap-2"><span>ลูกค้า:</span><span>${customerName}${customerPhone ? ` (${customerPhone})` : ''}</span></div>${customerAddress ? `<div class="flex gap-2"><span>ส่งที่:</span><span>${customerAddress.replace('[ส่งที่:','').replace(']','').trim()}</span></div>` : ''}</div>
            <div class="border-t border-b border-dashed py-2 my-2"><div class="flex justify-between text-[9px] font-bold mb-1"><span class="flex-1">รายการ</span><span class="w-14 text-right">ราคา</span><span class="w-16 text-right">รวม</span></div>${itemsHtml}</div>
            <div class="mt-2 space-y-0.5"><div class="flex justify-between font-bold text-[13px]"><span>รวม (${itemCount} รายการ)</span><span>${parseFloat(bill.total).toLocaleString('th-TH',{minimumFractionDigits:2})}</span></div><div class="flex justify-between"><span>รับเงิน</span><span>${parseFloat(bill.receive||0).toLocaleString('th-TH',{minimumFractionDigits:2})}</span></div><div class="flex justify-between"><span>เงินทอน</span><span>${parseFloat(bill.change||0).toLocaleString('th-TH',{minimumFractionDigits:2})}</span></div></div>
            <p class="text-center mt-4 text-[10px]">ขอบคุณที่ใช้บริการค่ะ</p>
        </div>
    </div>`;
    document.getElementById('billDetailModal').classList.remove('hidden');
    // เพิ่มปุ่มปริ้น
    // reset ปุ่มปริ้นกลับสภาพเดิมเมื่อเปิดบิลใหม่
    const printBtn  = document.getElementById('billDetailPrintBtn');
    const printIcon = document.getElementById('billDetailPrintIcon');
    const printLbl  = document.getElementById('billDetailPrintLabel');
    if (printBtn) {
        printBtn.disabled = false;
        printBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        printBtn.classList.add('active:scale-95');
        printBtn.onclick = () => printBillDetail(index);
    }
    if (printIcon) printIcon.className  = 'fas fa-print';
    if (printLbl)  printLbl.innerText   = 'ปริ้นใบเสร็จ';
}

// ============================================================
// 🏬 STORE STATUS
// ============================================================
async function initStoreStatus() {
    try {
        const status = await dbGet('settings', 'storeStatus');
        isStoreOpen = status ? (status.value?.isOpen !== false) : true;
        updateStoreUI();
        if (isCustomerMode && !isStoreOpen) { document.getElementById('storeClosedModal').classList.remove('hidden'); }
    } catch(e) {}
}

async function toggleStoreStatus() {
    if (isCustomerMode) return;
    const newStatus = !isStoreOpen; isStoreOpen = newStatus; updateStoreUI();
    try {
        await dbPut('settings', { key: 'storeStatus', value: { isOpen: newStatus } });
        showToast(isStoreOpen ? 'เปิดรับออเดอร์แล้ว' : 'ปิดรับออเดอร์แล้ว', 'success');
    } catch(e) { isStoreOpen = !newStatus; updateStoreUI(); showToast('เปลี่ยนสถานะไม่สำเร็จ', 'warning'); }
}

function updateStoreUI() {
    const bg = document.getElementById('storeToggleBg'); const dot = document.getElementById('storeToggleDot'); const text = document.getElementById('storeStatusText');
    if (isStoreOpen) { bg.className = "w-10 h-5 rounded-full relative transition-colors duration-300 shadow-inner flex items-center bg-green-500"; dot.style.transform = "translateX(20px)"; text.innerText = "เปิด"; }
    else { bg.className = "w-10 h-5 rounded-full relative transition-colors duration-300 shadow-inner flex items-center bg-red-500"; dot.style.transform = "translateX(0px)"; text.innerText = "ปิด"; }
}

// ============================================================
// 📱 CUSTOMER MODE
// ============================================================
function checkLoginStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const isCustomer = urlParams.get('mode') === 'customer';
    if (isCustomer) { checkCustomerIdentity(); }
    initStoreStatus();
}

function checkCustomerIdentity() {
    const savedName = localStorage.getItem('customerName'); const savedPhone = localStorage.getItem('customerPhone');
    const savedHouseNo = localStorage.getItem('customerAddrHouse'); const savedSoi = localStorage.getItem('customerAddrSoi');
    if (!savedName || !savedPhone || !savedHouseNo || !savedSoi) {
        document.getElementById('customerIdentityModal').classList.remove('hidden');
        if (savedHouseNo) document.getElementById('custIdHouseNo').value = savedHouseNo;
        if (savedSoi) document.getElementById('custIdSoi').value = savedSoi;
    } else { document.getElementById('customerTableDisplay').innerText = savedName; }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('customerIdentityForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('custIdName').value.trim(); const phone = document.getElementById('custIdPhone').value.trim();
            const houseNo = document.getElementById('custIdHouseNo').value.trim(); const soi = document.getElementById('custIdSoi').value.trim();
            if (!name || !phone || !houseNo || !soi) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน','warning'); return; }
            if (phone.length < 9 || isNaN(phone)) { showToast('เบอร์โทรศัพท์ไม่ถูกต้อง','warning'); return; }
            localStorage.setItem('customerName', name); localStorage.setItem('customerPhone', phone);
            localStorage.setItem('customerAddrHouse', houseNo); localStorage.setItem('customerAddrSoi', soi);
            document.getElementById('customerIdentityModal').classList.add('hidden');
            document.getElementById('customerTableDisplay').innerText = name;
            showToast(`ยินดีต้อนรับคุณ ${name}`, 'success'); speak("ยินดีต้อนรับค่ะ");
        });
    }
});

function openMyRecentOrder() {
    const modal = document.getElementById('myOrderModal'); const content = document.getElementById('myOrderContent');
    if (myLastOrders && myLastOrders.items && myLastOrders.items.length > 0) {
        const total = myLastOrders.total; const orderNote = myLastOrders.note || '';
        let addressString = "ไม่ระบุ"; let remainingNote = orderNote;
        const addressMatch = orderNote.match(/\[ส่งที่:\s*(.*?)\]/);
        if (addressMatch && addressMatch[1]) { addressString = addressMatch[1]; remainingNote = orderNote.replace(addressMatch[0],'').trim(); }
        const cName = localStorage.getItem('customerName') || 'ลูกค้า'; const cPhone = localStorage.getItem('customerPhone') || '-';
        let html = `<div class="text-center mb-6"><h3 class="text-xl font-extrabold text-blue-600 mb-1">ใบเสร็จ (ออเดอร์ล่าสุด)</h3><p class="text-xs text-gray-500">ขอบคุณที่ใช้บริการค่ะ</p></div>
            <div class="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 shadow-inner">
                <div class="font-bold text-sm text-gray-700 mb-2 border-b pb-2 border-dashed"><i class="fas fa-user-tag mr-2 text-blue-500"></i> ${cName} <span class="text-xs text-gray-500">(${cPhone})</span></div>
                <div class="text-sm text-gray-600"><i class="fas fa-map-marker-alt mr-2 text-red-500"></i>จัดส่ง: <span class="font-bold">${addressString}</span></div>
                ${remainingNote ? `<div class="text-xs text-gray-500 mt-2 pt-2 border-t border-dashed">หมายเหตุ: ${remainingNote}</div>` : ''}
                <div class="text-xs text-gray-500 mt-2 pt-2 border-t">เวลาสั่ง: ${new Date(myLastOrders.timestamp).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</div>
            </div><div class="space-y-3">`;
        myLastOrders.items.forEach(item => { const itemTotal = item.price * item.qty; html += `<div class="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm"><div><h4 class="font-bold text-gray-700">${item.name}</h4><div class="text-xs text-gray-500">${item.price} x ${item.qty}</div></div><div class="font-bold text-blue-600">${itemTotal.toLocaleString()} ฿</div></div>`; });
        html += `</div><div class="mt-4 pt-4 border-t border-dashed border-gray-300 flex justify-between items-center"><span class="text-gray-600 font-bold">รวมทั้งหมด</span><span class="text-2xl font-bold text-blue-600">${total.toLocaleString()} ฿</span></div>
            <div class="mt-6 text-center"><p class="text-green-600 font-bold text-sm mb-2"><i class="fas fa-check-circle"></i> ทางร้านได้รับออเดอร์แล้ว</p><button onclick="closeModal('myOrderModal')" class="bg-gray-800 text-white w-full py-3 rounded-xl font-bold hover:bg-gray-900 transition">ปิดหน้าต่าง</button></div>`;
        content.innerHTML = html;
    } else { content.innerHTML = '<div class="text-center py-10"><i class="fas fa-shopping-basket text-4xl text-gray-300 mb-2"></i><p class="text-gray-400">ยังไม่มีรายการที่สั่งล่าสุด</p></div>'; }
    modal.classList.remove('hidden');
}

function checkMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode'); const table = urlParams.get('table');
    if (mode === 'customer') {
        isCustomerMode = true; customerTable = table || "ไม่ระบุ";
        const adminToolbar = document.getElementById('adminToolbar'); if(adminToolbar) adminToolbar.classList.add('hidden');
        const customerToolbar = document.getElementById('customerToolbar'); if(customerToolbar) customerToolbar.classList.remove('hidden');
        const tableDisplay = document.getElementById('customerTableDisplay'); if(tableDisplay) tableDisplay.innerText = customerTable;
        const tableInput = document.getElementById('tableNo'); if(tableInput) { tableInput.value = customerTable; tableInput.readOnly = true; tableInput.classList.add('bg-gray-100','cursor-not-allowed'); }
        const searchInput = document.getElementById('searchInput'); if(searchInput) { searchInput.placeholder = "พิมพ์ชื่อสินค้าที่ต้องการค้นหา..."; searchInput.setAttribute('inputmode','text'); }
        const searchIcon = document.getElementById('topSearchIcon'); if(searchIcon) searchIcon.className = 'fas fa-search text-blue-500';
        const btnToggleKey = document.getElementById('btnToggleKey'); if(btnToggleKey) btnToggleKey.classList.add('hidden');
        const floatingSearch = document.getElementById('floatingSearchContainer'); if(floatingSearch) floatingSearch.classList.add('hidden');
        const holdBillContainer = document.getElementById('holdBillContainer'); if(holdBillContainer) holdBillContainer.classList.add('hidden');
    } else {
        isCustomerMode = false;
        const adminToolbar = document.getElementById('adminToolbar'); if(adminToolbar) adminToolbar.classList.remove('hidden');
        const customerToolbar = document.getElementById('customerToolbar'); if(customerToolbar) customerToolbar.classList.add('hidden');
        const searchInput = document.getElementById('searchInput'); if(searchInput) { searchInput.placeholder = "ยิงบาร์โค้ด..."; searchInput.setAttribute('inputmode','none'); }
        const searchIcon = document.getElementById('topSearchIcon'); if(searchIcon) searchIcon.className = 'fas fa-barcode text-gray-400';
        const btnToggleKey = document.getElementById('btnToggleKey'); if(btnToggleKey) btnToggleKey.classList.remove('hidden');
        const floatingSearch = document.getElementById('floatingSearchContainer'); if(floatingSearch) floatingSearch.classList.remove('hidden');
        const holdBillContainer = document.getElementById('holdBillContainer'); if(holdBillContainer) holdBillContainer.classList.remove('hidden');
    }
}

// ============================================================
// 🔑 AUTH
// ============================================================
function confirmLogout() { localStorage.removeItem('isLoggedIn'); localStorage.removeItem('userPhone'); location.reload(); }

function submitChangePassword() {
    const phoneVal = document.getElementById('changePassPhone').value.trim(); const newPass = document.getElementById('newPasswordInput').value.trim();
    if (!phoneVal) { alert("กรุณาระบุเบอร์โทรศัพท์"); return; } if (!newPass) { alert("กรุณากรอกรหัสผ่านใหม่"); return; }
    setLoading('btnSubmitChangePass', true, 'กำลังบันทึก...');
    setTimeout(() => { showToast('เปลี่ยนรหัสผ่านเรียบร้อย','success'); closeModal('changePassModal'); localStorage.setItem('userPhone', phoneVal); setLoading('btnSubmitChangePass', false, 'บันทึกรหัสผ่านใหม่'); }, 500);
}

// ============================================================
// 🧩 MODALS & UI HELPERS
// ============================================================
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    if (id === 'paymentModal') { const leftPanel = document.getElementById('leftPanel'); if(leftPanel) leftPanel.classList.remove('blur-sm','opacity-50','pointer-events-none'); const mw = document.getElementById('modalTotalWrapper'); if(mw) mw.classList.remove('scale-50','opacity-40','-translate-y-2'); }
    setTimeout(() => { const s = document.getElementById('searchInput'); if(s && !isCustomerMode){s.focus();s.value='';} }, 100);
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast'); const iconContainer = toast.querySelector('div:first-child'); const icon = iconContainer.querySelector('i');
    if (type === 'warning') { toast.classList.remove('border-green-500'); toast.classList.add('border-yellow-500'); iconContainer.classList.replace('bg-green-100','bg-yellow-100'); icon.classList.replace('text-green-600','text-yellow-600'); icon.className = 'fas fa-bell'; }
    else { toast.classList.add('border-green-500'); toast.classList.remove('border-yellow-500'); iconContainer.classList.replace('bg-yellow-100','bg-green-100'); icon.classList.replace('text-yellow-600','text-green-600'); icon.className = 'fas fa-check'; }
    document.getElementById('toastMsg').innerText = msg; toast.style.transform = 'translateX(0)';
    setTimeout(() => { toast.style.transform = 'translateX(150%)'; }, 3000);
}

function showCustomAlert(title, msg, icon = '<i class="fas fa-info-circle text-blue-500"></i>') { document.getElementById('alertTitle').innerText = title; document.getElementById('alertMsg').innerText = msg; document.getElementById('alertIcon').innerHTML = icon; document.getElementById('customAlert').classList.remove('hidden'); }
function closeCustomAlert() { document.getElementById('customAlert').classList.add('hidden'); }

function setLoading(btnId, isLoading, text) {
    const btn = document.getElementById(btnId); if (!btn) return;
    let span = btn.querySelector('.btn-text'); let icon = btn.querySelector('i.fas');
    if (!span) { const ot = btn.innerText; btn.innerHTML = `<span class="btn-text">${ot}</span> <i class="fas fa-save"></i>`; span = btn.querySelector('.btn-text'); icon = btn.querySelector('i.fas'); }
    if (isLoading) { btn.disabled = true; btn.classList.add('opacity-75','cursor-not-allowed'); if(span && !span.dataset.originalText) { span.dataset.originalText = span.innerText; } if(span) span.innerText = text; if(icon && !icon.dataset.originalClass) { icon.dataset.originalClass = icon.className; } if(icon) icon.className = "fas fa-circle-notch fa-spin"; }
    else { btn.disabled = false; btn.classList.remove('opacity-75','cursor-not-allowed'); if(span && span.dataset.originalText) { span.innerText = span.dataset.originalText; delete span.dataset.originalText; } if(icon && icon.dataset.originalClass) { icon.className = icon.dataset.originalClass; delete icon.dataset.originalClass; } }
}

function togglePaymentMenu() { const menu = document.getElementById('paymentSettingsMenu'); if(menu) menu.classList.toggle('hidden'); }

function makeDraggable(draggableElement, dragHandle) {
    let pos1=0, pos2=0, pos3=0, pos4=0;
    const handle = dragHandle || draggableElement;
    handle.onmousedown = dragMouseDown; handle.ontouchstart = dragMouseDown;
    function dragMouseDown(e) { e = e||window.event; e.preventDefault(); let clientX = e.clientX; let clientY = e.clientY; if(e.touches&&e.touches.length){clientX=e.touches[0].clientX;clientY=e.touches[0].clientY;} pos3=clientX;pos4=clientY; document.onmouseup=closeDragElement;document.onmousemove=elementDrag;document.ontouchend=closeDragElement;document.ontouchmove=elementDrag; }
    function elementDrag(e) { e=e||window.event;e.preventDefault();let clientX=e.clientX;let clientY=e.clientY;if(e.touches&&e.touches.length){clientX=e.touches[0].clientX;clientY=e.touches[0].clientY;}pos1=pos3-clientX;pos2=pos4-clientY;pos3=clientX;pos4=clientY;draggableElement.style.top=(draggableElement.offsetTop-pos2)+"px";draggableElement.style.left=(draggableElement.offsetLeft-pos1)+"px"; }
    function closeDragElement() { document.onmouseup=null;document.onmousemove=null;document.ontouchend=null;document.ontouchmove=null; }
}

// ============================================================
// 🔍 SEARCH
// ============================================================
function processSearchEnter() {
    const searchInput = document.getElementById('searchInput'); const val = searchInput.value; const trimVal = val.trim();
    if (trimVal) {
        if (/^[0-9]{1,4}$/.test(trimVal)) { const price = parseInt(trimVal); if(price>0){addManualItem(price);}else{searchInput.value='';} }
        else { scanBarcode(trimVal); }
    } else { if(cart.length>0){updateQty(0,1);} }
}

function handleSearchKeydown(event) {
    const searchInput = document.getElementById('searchInput'); const paymentModal = document.getElementById('paymentModal');
    if (event.key === '+' || event.code === 'NumpadAdd' || event.keyCode === 107) { event.preventDefault(); if(paymentModal&&!paymentModal.classList.contains('hidden')){closeModal('paymentModal');setTimeout(()=>searchInput.focus(),100);}else{searchInput.blur();handleCheckoutClick();} return; }
    if (event.key === '.' || event.code === 'NumpadDecimal' || event.keyCode === 110 || event.keyCode === 190) { event.preventDefault(); if(paymentModal&&!paymentModal.classList.contains('hidden')){closeModal('paymentModal');setTimeout(()=>searchInput.focus(),100);}else{searchInput.value='';} return; }
    if (event.key === 'Enter' || event.code === 'NumpadEnter' || event.keyCode === 13) { event.preventDefault(); processSearchEnter(); }
    if (searchInput.value === '' && event.key === 'Backspace') { if(cart.length>0&&cart[0].qty>1){updateQty(0,-1);} return; }
}

function checkPaymentEnter(e) {
    if (e.key === '+' || e.code === 'NumpadAdd' || e.keyCode === 107 || e.key === '.' || e.code === 'NumpadDecimal' || e.keyCode === 110 || e.keyCode === 190) { e.preventDefault(); closeModal('paymentModal'); setTimeout(()=>{const s=document.getElementById('searchInput');if(s){s.focus();s.value='';}},100); return; }
    if ((e.key === '0' || e.keyCode === 48 || e.keyCode === 96) && e.target.value === '') { e.preventDefault(); return; }
    if (e.key === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13) { e.preventDefault(); const inputVal = Number(document.getElementById('inputReceived').value); if(inputVal===0){setExactMoney();confirmPayment();return;} if(!document.getElementById('btnConfirmPay').disabled){confirmPayment();}else{playNotificationSound();} }
}

function addManualItem(price) { const manualItem = { id: "MANUAL-"+Date.now(), name: "สินค้าทั่วไป", price: price, category:"เบ็ดเตล็ด", image:"", isHidden:true }; addItemToCart(manualItem,"-"); document.getElementById('searchInput').value = ''; }

function scanBarcode(code) {
    const cleanCode = String(code).trim(); const lowerCode = cleanCode.toLowerCase();
    let item = masterData.find(m => String(m.id).trim() === cleanCode) || menuData.find(m => String(m.id).trim() === cleanCode) || masterData.find(m => m.name.toLowerCase() === lowerCode) || menuData.find(m => m.name.toLowerCase() === lowerCode);
    if (item) { addItemToCart(item,"-"); document.getElementById('searchInput').value=''; showToast(`เพิ่ม ${item.name} แล้ว`,'success'); }
    else { speak("ไม่มี"); playNotificationSound(); openQuickAddModal(cleanCode); }
}

function openQuickAddModal(barcode) { openAddMenuModal(); document.getElementById('mCode').value = barcode; document.getElementById('mName').value = ""; document.getElementById('mPrice').value = ""; setTimeout(()=>{document.getElementById('mPrice').focus();},300); }

function searchMenu() { if(document.activeElement&&document.activeElement.id==='searchInput'){return;} filterMenu('All'); }
function clearSearch() { document.getElementById('searchInput').value=''; searchMenu(); }
function syncSearch(val) { const mainInput = document.getElementById('searchInput'); mainInput.value=val; searchMenu(); const btnClear = document.getElementById('btnClearFloat'); if(val){btnClear.classList.remove('hidden');}else{btnClear.classList.add('hidden');} }
function clearFloatingSearch() { const floatInput = document.getElementById('floatingSearchInput'); floatInput.value=''; syncSearch(''); floatInput.focus(); }

document.addEventListener('click', function(event) {
    const menu = document.getElementById('paymentSettingsMenu'); const btnMenu = document.querySelector('button[onclick="togglePaymentMenu()"]');
    if (menu && !menu.classList.contains('hidden')) { if(!menu.contains(event.target)&&btnMenu&&!btnMenu.contains(event.target)){menu.classList.add('hidden');} }
    if (isCustomerMode) return;
    const targetTag = event.target.tagName ? event.target.tagName.toLowerCase() : '';
    const isInput = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select';
    const ignoreModals = ['paymentModal','addModal','editMenuModal','promptPayModal','confirmOrderModal','changePassModal','productModal','stockModal','stockAlertModal'];
    const isAnyInputModalOpen = ignoreModals.some(modalId => { const modal = document.getElementById(modalId); return modal && !modal.classList.contains('hidden'); });
    const isNumpadClick = event.target.closest('#embeddedNumpadPanel') !== null;
    const isFloatingSearchClick = event.target.closest('#floatingSearchContainer') !== null;
    if (!isInput && !isAnyInputModalOpen && !isNumpadClick && !isFloatingSearchClick) {
        setTimeout(() => { const s = document.getElementById('searchInput'); if(s){s.focus();s.value='';} }, 100);
    }
});

// ============================================================
// 📋 MENU FORMS — Add / Edit / Delete
// ============================================================
// compressImage คืน base64 string (ใช้ใน legacy path)
function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const canvas = document.createElement('canvas'); let w=img.width,h=img.height; if(w>h){if(w>maxWidth){h*=maxWidth/w;w=maxWidth;}}else{if(h>maxWidth){w*=maxWidth/h;h=maxWidth;}} canvas.width=w;canvas.height=h; const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);resolve(canvas.toDataURL('image/jpeg',quality)); }; img.onerror=error=>reject(error); }; reader.onerror=error=>reject(error);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const addMenuForm = document.getElementById('addMenuForm');
    if (addMenuForm) {
        addMenuForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const fileInput = document.getElementById('mFile');
            const file = fileInput.files[0];
            const mCode = document.getElementById('mCode').value.trim() || ('P' + Date.now());

            setLoading('btnSaveMenu', true, 'กำลังบันทึก...');
            try {
                let imageValue = '';
                if (file) {
                    setLoading('btnSaveMenu', true, 'กำลังอัปโหลดรูป...');
                    imageValue = await uploadImageToStorage(file, mCode);
                }
                const payload = {
                    id: mCode,
                    name: document.getElementById('mName').value,
                    price: document.getElementById('mPrice').value,
                    category: document.getElementById('mCategory').value,
                    image: imageValue,
                    stockQty: parseInt(document.getElementById('mStockQty')?.value || 0),
                    stockMin: parseInt(document.getElementById('mStockMin')?.value || 5)
                };
                await sendAddMenu(payload);
            } catch(err) {
                console.error(err);
                setLoading('btnSaveMenu', false, 'บันทึก');
                showCustomAlert('Error', 'บันทึกไม่สำเร็จ: ' + err.message);
            }
        });
    }

    const editForm = document.getElementById('editMenuForm');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            setLoading('btnEditSave', true, 'กำลังบันทึก...');
            try {
                const id = document.getElementById('eId').value;
                let item = masterData.find(m => m.id == id) || menuData.find(m => m.id == id);
                if (item) {
                    // ถ้ามีไฟล์รูปใหม่ → อัปโหลด Storage แล้วลบรูปเก่า
                    const editFile = document.getElementById('eFile')?.files[0];
                    if (editFile) {
                        setLoading('btnEditSave', true, 'กำลังอัปโหลดรูปใหม่...');
                        const oldPath = item.image;
                        item.image = await uploadImageToStorage(editFile, item.id);
                        // ลบรูปเก่าออกจาก Storage (ถ้าเก็บใน Storage)
                        deleteImageFromStorage(oldPath);
                    }
                    item.name = document.getElementById('eName').value;
                    item.price = parseFloat(document.getElementById('ePrice').value);
                    item.category = document.getElementById('eCategory').value;
                    const eStock = document.getElementById('eStockQty'); const eMin = document.getElementById('eStockMin');
                    if (eStock) item.stockQty = parseInt(eStock.value) || 0;
                    if (eMin) item.stockMin = parseInt(eMin.value) || 5;
                    await dbPut('menu', item);
                    localStorage.removeItem('cachedMenuData');
                    showToast('แก้ไขสำเร็จ', 'success'); closeModal('editMenuModal'); fetchMenu();
                }
            } catch(err) { showCustomAlert('Error', 'ไม่สามารถบันทึกได้: ' + err.message); }
            finally { setLoading('btnEditSave', false, 'บันทึก'); }
        });
    }
});

async function uploadBankQRFile(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const imgEl = document.getElementById('bankQRImage');
    const originalSrc = imgEl.src;
    imgEl.style.opacity = '0.5';

    // แสดง preview ทันที
    const reader = new FileReader();
    reader.onload = e => { imgEl.src = e.target.result; };
    reader.readAsDataURL(file);

    try {
        // อัปโหลดไป Storage bucket: qr-codes/bank_qr.jpg
        const compressed = await compressImageToBlob(file, 600, 0.80);
        const { data, error } = await _supa.storage
            .from('qr-codes')
            .upload('bank_qr.jpg', compressed, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;

        // เก็บแค่ path ใน settings
        await dbPut('settings', { key: 'bankQR', value: { storagePath: data.path, bucket: 'qr-codes' } });
        localStorage.setItem('bankQRID', 'storage');
        localStorage.removeItem('promptPayID');
        showToast('อัปโหลด QR Code สำเร็จ', 'success');
        initBankQR();
        closeModal('manageQRModal');
    } catch(err) {
        imgEl.src = originalSrc;
        showCustomAlert('Error', 'อัปโหลดไม่สำเร็จ: ' + err.message);
    } finally {
        imgEl.style.opacity = '1';
    }
}

async function sendAddMenu(payload) {
    setLoading('btnSaveMenu', false, 'บันทึก');
    const tempId = payload.id || ("P" + Date.now());
    const newItem = {
        id: tempId,
        name: payload.name,
        price: parseFloat(payload.price),
        category: payload.category || 'ทั่วไป',
        image: payload.image || '',   // Storage path หรือ '' (ไม่ใช่ base64)
        isHidden: false,
        stockQty: payload.stockQty || 0,
        stockMin: payload.stockMin || 5
    };
    addItemToCart(newItem, "-");
    document.getElementById('searchInput').value = '';
    closeModal('addModal');
    menuData.push(newItem); masterData.push(newItem);
    const activeCategoryBtn = document.querySelector('.cat-btn.bg-gradient-to-r');
    const currentCat = activeCategoryBtn ? activeCategoryBtn.innerText : 'All';
    filterMenu(currentCat === 'ทั้งหมด' ? 'All' : currentCat);
    document.getElementById('addMenuForm').reset();
    localStorage.removeItem('cachedMenuData');
    try {
        await dbPut('menu', newItem);
        showToast('เพิ่มสินค้าสำเร็จ', 'success');
    } catch(err) {
        showCustomAlert('ผิดพลาด', 'บันทึกสินค้าลงฐานข้อมูลไม่สำเร็จ');
    }
}

async function confirmDeleteMenu() {
    setLoading('btnDeleteMenu', true, 'ลบ...');
    try { await dbDelete('menu', document.getElementById('eId').value); showToast('ลบสินค้าแล้ว','success'); closeModal('editMenuModal'); fetchMenu(); }
    catch(err) { showCustomAlert('ผิดพลาด','ลบสินค้าไม่สำเร็จ'); }
    finally { setLoading('btnDeleteMenu', false, 'ลบ'); }
}
function deleteMenu() { openConfirmActionModal('ยืนยันการลบสินค้า','คุณแน่ใจหรือไม่ที่จะลบสินค้านี้?','<i class="fas fa-trash-alt"></i>', confirmDeleteMenu); }
function openConfirmActionModal(title, msg, iconHtml, confirmHandler) { document.getElementById('confirmActionTitle').innerText = title; document.getElementById('confirmActionMsg').innerText = msg; document.getElementById('confirmActionIcon').innerHTML = iconHtml; const confirmBtn = document.getElementById('btnConfirmAction'); confirmBtn.onclick = () => { closeModal('confirmActionModal'); confirmHandler(); }; document.getElementById('confirmActionModal').classList.remove('hidden'); }

// ============================================================
// 💾 EXPORT / IMPORT
// ============================================================
function openExportModal() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('exportStartDate').value = today;
    document.getElementById('exportEndDate').value = today;
    document.getElementById('exportModal').classList.remove('hidden');
    loadShopInfoToForm();
    syncAutoPrintToggle(); // sync สถานะ toggle
}

async function exportProductsCSV() {
    try {
        const { data } = await _supa.from('products').select('id,name,price,cost,category,stock_qty,stock_min').order('name');
        if (!data || data.length === 0) { showToast('ไม่มีข้อมูลสินค้า','warning'); return; }
        let csv = 'รหัสสินค้า,ชื่อสินค้า,ราคาขาย,ต้นทุน,หมวดหมู่,สต็อก,สต็อกขั้นต่ำ\n';
        data.forEach(p => { csv += `"${p.id}","${p.name}","${p.price}","${p.cost||0}","${p.category}","${p.stock_qty||0}","${p.stock_min||5}"\n`; });
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='products_'+new Date().toISOString().split('T')[0]+'.csv'; a.click(); URL.revokeObjectURL(url);
        showToast('ดาวน์โหลด CSV สำเร็จ','success');
    } catch(e) { showCustomAlert('Error','Export ไม่สำเร็จ'); }
}

async function handleImportCSV(event) {
    const file = event.target.files[0]; if (!file) return;
    showToast('กำลังนำเข้าข้อมูล...','warning');
    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result; const rows = text.split(/\r?\n/); let successCount = 0; let updateCount = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i].trim(); if(!row) continue;
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length >= 3) {
                const id = cols[0].replace(/^"|"$/g,'').trim(); const name = cols[1].replace(/^"|"$/g,'').trim();
                const price = parseFloat(cols[2].replace(/^"|"$/g,'').trim()); const cost = cols[3] ? parseFloat(cols[3].replace(/^"|"$/g,'').trim()) : 0;
                const stock = cols[5] ? parseInt(cols[5].replace(/^"|"$/g,'').trim()) : 0;
                if (id && name && !isNaN(price)) {
                    const existing = await dbGet('menu', id);
                    await dbPut('menu', { id, name, price, cost: isNaN(cost)?0:cost, category:"เบ็ดเตล็ด", image:"", isHidden:false, stockQty: stock||0, stockMin:5 });
                    if (existing) updateCount++; else successCount++;
                }
            }
        }
        event.target.value = ''; closeModal('exportModal');
        showToast(`เพิ่มใหม่ ${successCount} รายการ, อัปเดต ${updateCount} รายการ`,'success'); fetchMenu();
        localStorage.removeItem('cachedMenuData');
    };
    reader.readAsText(file, 'UTF-8');
}

async function executeExportPDF() {
    const type = document.getElementById('exportType').value; const start = document.getElementById('exportStartDate').value; const end = document.getElementById('exportEndDate').value;
    if (!start || !end) { showToast('กรุณาเลือกวันที่ให้ครบ','warning'); return; }
    setLoading('btnDoExport', true, 'สร้างรายงาน...');
    try {
        const { data: allHistory } = await _supa.from('bills').select('*').gte('date', start+'T00:00:00').lte('date', end+'T23:59:59').order('date');
        const filtered = allHistory || [];
        let title = type === 'MonthlySales' ? 'รายงานสรุปยอดขายรายเดือน' : type === 'DailySales' ? 'รายงานสรุปยอดขายรายวัน' : 'รายงานรายละเอียดบิลขาย';
        let htmlContent = `<html><head><title>${title}</title><style>@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600&display=swap');body{font-family:'Sarabun',sans-serif;padding:40px;color:#333;}.header{text-align:center;margin-bottom:30px;border-bottom:2px solid #333;padding-bottom:15px;}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px;}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left;}th{background:#f8fafc;font-weight:bold;text-align:center;}.text-right{text-align:right;}.text-center{text-align:center;}.total-row{font-weight:bold;background:#f1f5f9;}</style></head><body><div class="header"><h1>${title}</h1><p>ข้อมูลตั้งแต่ ${start} ถึง ${end}</p></div>`;
        if (type === 'DailySales' || type === 'MonthlySales') {
            let totalAmount = 0; filtered.forEach(b => totalAmount += parseFloat(b.total||0));
            htmlContent += `<p style="font-size:20px;font-weight:bold;text-align:center;">ยอดรวม: ${totalAmount.toLocaleString('th-TH',{minimumFractionDigits:2})} บาท (${filtered.length} บิล)</p>`;
            htmlContent += `<table><tr><th>วันที่</th><th>จำนวนบิล</th><th>ยอดรวม (บาท)</th></tr>`;
            const breakdown = {}; const billCount = {};
            filtered.forEach(b => { const d = b.date.split('T')[0]; let key = type==='MonthlySales' ? d.substring(0,7) : d; breakdown[key]=(breakdown[key]||0)+parseFloat(b.total||0); billCount[key]=(billCount[key]||0)+1; });
            Object.keys(breakdown).sort().forEach(d => { htmlContent += `<tr><td class="text-center">${d}</td><td class="text-center">${billCount[d]}</td><td class="text-right">${breakdown[d].toLocaleString('th-TH',{minimumFractionDigits:2})}</td></tr>`; });
            htmlContent += `</table>`;
        } else {
            let totalAmount = 0;
            htmlContent += `<table><tr><th>รหัสบิล</th><th>วัน/เวลา</th><th>รายการสินค้า</th><th>ยอดรวม</th></tr>`;
            filtered.sort((a,b) => new Date(a.date)-new Date(b.date)).forEach(b => { totalAmount += parseFloat(b.total||0); htmlContent += `<tr><td>${b.bill_id}</td><td>${new Date(b.date).toLocaleString('th-TH')}</td><td>${b.item_summary}</td><td class="text-right">${parseFloat(b.total).toLocaleString('th-TH',{minimumFractionDigits:2})}</td></tr>`; });
            htmlContent += `<tr class="total-row"><td colspan="3" class="text-right">รวมทั้งหมด</td><td class="text-right">${totalAmount.toLocaleString('th-TH',{minimumFractionDigits:2})}</td></tr></table>`;
        }
        htmlContent += `</body></html>`;
        const printWindow = window.open('','_blank'); printWindow.document.write(htmlContent); printWindow.document.close();
        showToast('สร้างรายงานเรียบร้อย','success'); closeModal('exportModal');
    } catch(err) { showCustomAlert('ผิดพลาด','สร้างรายงานไม่สำเร็จ: '+err); }
    finally { setLoading('btnDoExport', false, 'พิมพ์รายงาน PDF'); }
}

// ============================================================
// 💰 RECEIPT
// ============================================================
function renderPaymentReceipt() {
    const container = document.getElementById('paymentReceiptItems'); if(!container) return;
    const dateEl = document.getElementById('slipDate'); const orderNoEl = document.getElementById('slipOrderNo'); const now = new Date();
    if(dateEl) dateEl.innerText = now.toLocaleDateString('th-TH',{year:'numeric',month:'2-digit',day:'2-digit'}) + ' ' + now.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if(orderNoEl) orderNoEl.innerText = currentPayOrder&&currentPayOrder.orderId ? currentPayOrder.orderId : ("W-"+Math.floor(Math.random()*100000));
    let total = 0; let totalQty = 0;
    const itemsHtml = cart.map(item => { const itemTotal = item.price*item.qty; total+=itemTotal; totalQty+=item.qty;
        return `<div class="leading-tight mb-1"><div class="break-words">${item.qty} ${item.name}</div><div class="flex justify-end gap-2 mt-0.5"><span class="w-16 text-right">${item.price.toLocaleString('th-TH',{minimumFractionDigits:2})}</span><span class="w-16 text-right">${itemTotal.toLocaleString('th-TH',{minimumFractionDigits:2})}</span></div></div>`;
    }).join('');
    container.innerHTML = itemsHtml;
    const totalFormatted = total.toLocaleString('th-TH',{minimumFractionDigits:2});
    if(document.getElementById('paymentReceiptTotal')) document.getElementById('paymentReceiptTotal').innerText = totalFormatted;
    if(document.getElementById('paymentReceiptTotal2')) document.getElementById('paymentReceiptTotal2').innerText = totalFormatted;
    if(document.getElementById('slipItemCount')) document.getElementById('slipItemCount').innerText = cart.length;
    if(document.getElementById('slipTotalQty')) document.getElementById('slipTotalQty').innerText = totalQty;
    updateSlipChange();
}

function updateSlipChange() {
    const inputEl = document.getElementById('inputReceived'); const recvEl = document.getElementById('slipReceived'); const changeEl = document.getElementById('slipChange');
    if(!recvEl||!changeEl) return;
    let received = Number(inputEl.value) || 0;
    let total = currentPayOrder ? currentPayOrder.totalPrice : cart.reduce((sum,i)=>sum+i.price*i.qty,0);
    recvEl.innerText = (received===0 ? "0.00" : received.toLocaleString('th-TH',{minimumFractionDigits:2}));
    let change = received - total; if(change<0||received===0) change = 0;
    changeEl.innerText = change.toLocaleString('th-TH',{minimumFractionDigits:2});
}

// ============================================================
// 📊 DASHBOARD
// ============================================================
let mySalesChart=null, mySales7DaysChart=null, myTop5PieChart=null;

async function openDashboardModal() {
    closeModal('exportModal');
    document.getElementById('dashboardModal').classList.remove('hidden');
    document.getElementById('dashLoading').classList.remove('hidden');
    document.getElementById('dashContent').classList.add('hidden');
    try {
        const { data: history } = await _supa.from('bills').select('*').order('date', { ascending: false }).limit(1000);
        const profitInput = document.getElementById('dashProfitInput');
        const profitMarginVal = profitInput ? parseFloat(profitInput.value)||12.5 : 12.5;
        const profitPercent = profitMarginVal / 100;
        const label1 = document.getElementById('dashProfitLabel1'); const label2 = document.getElementById('dashProfitLabel2');
        if(label1) label1.innerText = profitMarginVal; if(label2) label2.innerText = profitMarginVal;
        const now = new Date(); const todayStr = now.toISOString().split('T')[0];
        const yesterday = new Date(now.getTime() - 86400000); const yesterdayStr = yesterday.toISOString().split('T')[0];
        const currentYear = now.getFullYear(); const currentMonth = now.getMonth(); const thisMonthStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}`;
        let todaySales=0,todayProfit=0,yesterdaySales=0,thisMonthSales=0,thisMonthProfit=0;
        (history||[]).forEach(b => {
            const bDate = b.date.split('T')[0]; const bMonth = b.date.substring(0,7);
            const t = parseFloat(b.total||0); const p = t * profitPercent;
            if(bDate===todayStr){todaySales+=t;todayProfit+=p;}
            if(bDate===yesterdayStr)yesterdaySales+=t;
            if(bMonth===thisMonthStr){thisMonthSales+=t;thisMonthProfit+=p;}
        });
        const setEl = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
        setEl('dashTodaySales', todaySales.toLocaleString()); setEl('dashTodayProfit', todayProfit.toLocaleString());
        setEl('dashYestSales', yesterdaySales.toLocaleString()); setEl('dashMonthSales', thisMonthSales.toLocaleString());
        setEl('dashMonthProfit', thisMonthProfit.toLocaleString());
        // --- 7 day chart ---
        const labels7=[],salesData7=[],profitData7=[];
        for(let i=6;i>=0;i--){const d=new Date(now.getTime()-i*86400000);const ds=d.toISOString().split('T')[0];const day=d.toLocaleDateString('th-TH',{weekday:'short'});labels7.push(day);const daySales=(history||[]).filter(b=>b.date.split('T')[0]===ds).reduce((s,b)=>s+parseFloat(b.total||0),0);salesData7.push(daySales);profitData7.push(daySales*profitPercent);}
        const avgArr7 = salesData7.filter(x=>x>0);
        setEl('avg7Days','เฉลี่ย: '+(avgArr7.length>0?Math.round(avgArr7.reduce((a,b)=>a+b,0)/avgArr7.length).toLocaleString():0)+' ฿/วัน');
        if(mySales7DaysChart){mySales7DaysChart.destroy();}const ctx7=document.getElementById('sales7DaysChart');
        if(ctx7){mySales7DaysChart=new Chart(ctx7,{type:'bar',data:{labels:labels7,datasets:[{label:'ยอดขาย',data:salesData7,backgroundColor:'rgba(59,130,246,0.7)'},{label:'กำไรประมาณ',data:profitData7,backgroundColor:'rgba(16,185,129,0.5)'}]},options:{responsive:true,maintainAspectRatio:false}});}
        document.getElementById('dashLoading').classList.add('hidden'); document.getElementById('dashContent').classList.remove('hidden');
    } catch(e) { document.getElementById('dashLoading').classList.add('hidden'); showCustomAlert('Error','โหลด Dashboard ไม่สำเร็จ: '+e.message); }
}

// ============================================================
// ⚡ REALTIME — รับออเดอร์ใหม่แบบ Live
// ============================================================
function initRealtime() {
    if (realtimeChannel) realtimeChannel.unsubscribe();
    realtimeChannel = _supa.channel('pos-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
            if (!isCustomerMode) {
                playNotificationSound(); showToast('📦 ออเดอร์ใหม่เข้ามา!', 'warning');
                const isKitchenOpen = !document.getElementById('kitchenModal').classList.contains('hidden');
                if (isKitchenOpen) fetchOrders();
                updateKitchenBadge();
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_alerts' }, payload => {
            if (!isCustomerMode) {
                const a = payload.new;
                showToast(`⚠️ สต็อก "${a.product_name}" ${a.alert_type === 'out' ? 'หมดแล้ว!' : 'ใกล้หมด'}`, 'warning');
                checkStockAlerts();
            }
        })
        .subscribe();
}

// ============================================================
// 🚀 INITIALIZATION
// ============================================================
window.onload = async () => {
    // ตรวจว่ายังไม่ได้ตั้งค่า Supabase
    if (SUPABASE_URL.includes('YOUR_PROJECT') || SUPABASE_ANON.includes('YOUR_ANON_KEY')) {
        document.body.innerHTML = `<div class="min-h-screen flex items-center justify-center bg-gray-100 p-6"><div class="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full"><div class="text-center mb-6"><div class="text-5xl mb-3">⚙️</div><h2 class="text-2xl font-bold text-gray-800">ตั้งค่า Supabase ก่อนใช้งาน</h2></div><div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 space-y-2"><p><strong>1.</strong> สมัครฟรีที่ <a href="https://supabase.com" class="underline text-blue-600" target="_blank">supabase.com</a></p><p><strong>2.</strong> สร้าง Project ใหม่</p><p><strong>3.</strong> ไปที่ SQL Editor แล้วรัน <code class="bg-blue-100 px-1 rounded">supabase_setup.sql</code></p><p><strong>4.</strong> ไปที่ Settings → API แล้วคัดลอก Project URL และ anon key</p><p><strong>5.</strong> แก้ไข <code class="bg-blue-100 px-1 rounded">SUPABASE_URL</code> และ <code class="bg-blue-100 px-1 rounded">SUPABASE_ANON</code> ใน script.js</p></div></div></div>`;
        return;
    }

    checkMode();
    checkLoginStatus();
    initStoreStatus();
    initDateTime();
    fetchMenu();
    renderCategoryBar();
    populateCategorySelects();
    startOrderPolling();
    initGlobalShortcuts();
    initQuickAddShortcuts();
    initRealtime();
    checkStockAlerts();
    getShopInfo(); // โหลด cache ข้อมูลร้านไว้ล่วงหน้า

    const modal = document.getElementById("draggableModal");
    const header = document.getElementById("modalHeader");
    if (modal && header) { makeDraggable(modal, header); }

    setTimeout(() => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput && !isCustomerMode) { searchInput.focus(); searchInput.value = ''; }
    }, 500);
};

// ============================================================
// 🔧 MISSING FUNCTIONS — เพิ่มเติมฟังก์ชันที่ HTML เรียกใช้
// ============================================================

// ── Numpad toggle (แถบตัวเลข desktop) ──
function toggleEmbeddedNumpad() {
    const keys = document.getElementById('embeddedKeys');
    const bar  = document.getElementById('minimizedBar');
    if (!keys || !bar) return;
    const isHidden = keys.classList.contains('hidden');
    keys.classList.toggle('hidden', !isHidden);
    bar.classList.toggle('hidden', isHidden);
}

// ── Backup & Restore (Export JSON) ──
async function backupData() {
    setLoading('btnBackup', true, 'กำลังสำรอง...');
    try {
        const [menuItems, bills, orders, settings] = await Promise.all([
            dbGetAll('menu'), dbGetAll('history'), dbGetAll('orders'), dbGetAll('settings')
        ]);
        const backup = {
            version: '2.0-supabase',
            timestamp: new Date().toISOString(),
            menu: menuItems,
            history: bills,
            orders: orders,
            settings: settings
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `POS_Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('สำรองข้อมูลสำเร็จ', 'success');
    } catch(e) {
        showCustomAlert('ผิดพลาด', 'สำรองข้อมูลไม่สำเร็จ: ' + e.message);
    } finally {
        setLoading('btnBackup', false, 'สร้างไฟล์ Backup');
    }
}

async function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('⚠️ การกู้คืนจะเขียนทับข้อมูลที่มีอยู่ ต้องการดำเนินการต่อไหม?')) {
        event.target.value = ''; return;
    }
    setLoading('btnRestore', true, 'กำลังกู้คืน...');
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const backup = JSON.parse(e.target.result);
            if (!backup.menu && !backup.history) throw new Error('ไฟล์ Backup ไม่ถูกต้อง');
            let count = 0;
            // restore menu/products
            if (backup.menu?.length) {
                for (const item of backup.menu) {
                    try { await dbPut('menu', item); count++; } catch(e) {}
                }
            }
            // restore bills
            if (backup.history?.length) {
                for (const bill of backup.history) {
                    try { await dbPut('history', bill); count++; } catch(e) {}
                }
            }
            event.target.value = '';
            localStorage.removeItem('cachedMenuData');
            showToast(`กู้คืนสำเร็จ ${count} รายการ — กำลังรีโหลด...`, 'success');
            setTimeout(() => location.reload(), 2000);
        } catch(err) {
            setLoading('btnRestore', false, 'กู้คืน (ย้ายเครื่อง)');
            showCustomAlert('Error', 'ไฟล์ Backup ไม่ถูกต้อง: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// ── นำเข้าประวัติบิลจาก CSV ──
function importHistoryCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    showToast('กำลังประมวลผลบิล...', 'warning');
    const reader = new FileReader();
    reader.onload = async function(e) {
        const rows = e.target.result.split(/\r?\n/);
        let count = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i].trim(); if (!row) continue;
            const cols = []; let inQ = false, cur = '';
            for (const ch of row) {
                if (ch === '"') { inQ = !inQ; }
                else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
                else { cur += ch; }
            }
            cols.push(cur);
            if (cols.length >= 4) {
                const totalAmount = parseFloat(cols[3].replace(/[^0-9.-]/g, '')) || 0;
                const newBill = {
                    billId: 'CSV-' + Date.now() + '-' + i,
                    date: new Date().toISOString(),
                    table: 'นำเข้าจากระบบเก่า',
                    type: 'นำเข้าข้อมูล',
                    itemSummary: cols[1] || '',
                    items: [{ name: cols[1] || 'สินค้า', qty: 1, price: totalAmount }],
                    total: totalAmount, receive: totalAmount, change: 0, note: 'Imported'
                };
                try { await dbPut('history', newBill); count++; } catch(e) {}
            }
        }
        event.target.value = '';
        closeModal('exportModal');
        showToast(`นำเข้าสำเร็จ ${count} รายการ`, 'success');
    };
    reader.readAsText(file, 'UTF-8');
}

// ── ลบบิล ──
function deleteCurrentBill(billId) {
    const target = document.getElementById('deleteBillIdTarget');
    if (target) target.value = billId;
    document.getElementById('deleteBillModal')?.classList.remove('hidden');
}

async function executeDeleteBill() {
    const billId = document.getElementById('deleteBillIdTarget')?.value;
    if (!billId) return;
    const btn = document.getElementById('btnConfirmDeleteBill');
    if (btn) { btn.disabled = true; btn.innerText = 'กำลังลบ...'; }
    try {
        await dbDelete('history', billId);
        historyBills = historyBills.filter(b => b.billId !== billId);
        renderHistoryList();
        closeModal('deleteBillModal');
        closeModal('billDetailModal');
        showToast('ลบบิลเรียบร้อย', 'success');
    } catch(e) {
        showCustomAlert('ผิดพลาด', 'ลบบิลไม่สำเร็จ: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'ยืนยันลบ'; }
    }
}

// ── Export Products PDF (ตารางสินค้าทั้งหมด) ──
async function exportProductsPDF() {
    try {
        const { data: products } = await _supa.from('products').select('id,name,price,category,stock_qty').order('name');
        if (!products?.length) { showToast('ไม่มีข้อมูลสินค้า', 'warning'); return; }
        showToast('กำลังสร้าง PDF...', 'warning');
        const html = `<html><head><title>รายการสินค้า</title>
        <style>@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap');
        body{font-family:'Sarabun',sans-serif;padding:30px;color:#333;}
        h2{text-align:center;color:#1e3a8a;margin-bottom:5px;}
        p.sub{text-align:center;color:#666;font-size:12px;margin-bottom:20px;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        th,td{border:1px solid #d1d5db;padding:8px;text-align:left;}
        th{background:#f3f4f6;font-weight:600;}
        tr:nth-child(even){background:#f9fafb;}
        .text-right{text-align:right;}</style></head><body>
        <h2>รายการสินค้าทั้งหมด</h2>
        <p class="sub">ข้อมูล ณ วันที่ ${new Date().toLocaleDateString('th-TH')} — จำนวน ${products.length} รายการ</p>
        <table><thead><tr><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th class="text-right">ราคา (฿)</th><th class="text-right">สต็อก</th></tr></thead><tbody>
        ${products.map(p => `<tr><td style="font-family:monospace">${p.id}</td><td>${p.name}</td><td>${p.category||'-'}</td><td class="text-right">${parseFloat(p.price).toLocaleString('th-TH',{minimumFractionDigits:2})}</td><td class="text-right">${p.stock_qty||0}</td></tr>`).join('')}
        </tbody></table></body></html>`;
        const w = window.open('', '_blank');
        w.document.write(html); w.document.close();
        setTimeout(() => w.print(), 500);
    } catch(e) {
        showCustomAlert('ผิดพลาด', 'สร้าง PDF ไม่สำเร็จ: ' + e.message);
    }
}

// ── Export Dashboard PDF ──
async function exportDashboardPDF() {
    setLoading('btnExportDash', true, 'กำลัง Export...');
    try {
        showToast('กำลังเปิดหน้าต่างพิมพ์...', 'warning');
        const dashEl = document.getElementById('dashContent');
        if (!dashEl) return;
        // ใช้ print dialog ของ browser โดยตรง (ง่ายและรองรับไทยได้ดี)
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Dashboard Report</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
        <style>body{font-family:'Sarabun',sans-serif;padding:20px;font-size:13px;}
        table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:6px;}
        th{background:#f3f4f6;}.no-print{display:none;}</style></head>
        <body><h2 style="text-align:center">รายงาน Dashboard — ${new Date().toLocaleDateString('th-TH')}</h2>
        ${dashEl.innerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
        </body></html>`);
        w.document.close();
    } catch(e) {
        showCustomAlert('ผิดพลาด', 'Export ไม่สำเร็จ: ' + e.message);
    } finally {
        setLoading('btnExportDash', false, 'Export PDF');
    }
}

// ── Product Modal (จัดการสินค้าจาก legacy button) ──
async function loadProductModal() {
    const tbody = document.getElementById('productTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-400"><i class="fas fa-circle-notch fa-spin"></i> กำลังโหลด...</td></tr>';
    const { data } = await _supa.from('products').select('id,name,price,category').order('name');
    const products = data || [];
    // ค้นหา
    const search = (document.getElementById('modalSearchInput')?.value || '').toLowerCase();
    const filtered = search
        ? products.filter(p => p.name.toLowerCase().includes(search) || p.id.toLowerCase().includes(search))
        : products;
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-400">ไม่พบสินค้า</td></tr>'; return;
    }
    tbody.innerHTML = filtered.map(p => `
        <tr class="hover:bg-gray-50 border-b border-gray-100">
            <td class="p-3 font-mono text-xs text-gray-500">${p.id}</td>
            <td class="p-3 font-bold text-gray-700">${p.name}</td>
            <td class="p-3 text-blue-600 font-bold">${parseFloat(p.price).toLocaleString('th-TH', {minimumFractionDigits:2})}</td>
            <td class="p-3 flex gap-2">
                <button onclick="quickEditProduct('${p.id}')" class="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 transition font-bold">แก้ไข</button>
                <button onclick="quickDeleteProduct('${p.id}','${p.name.replace(/'/g,"\\'")}',this)" class="text-xs bg-red-50 text-red-500 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100 transition font-bold">ลบ</button>
            </td>
        </tr>`).join('');

    // ค้นหา suggestion ราคา
    const costEl = document.getElementById('costPrice'); const profitEl = document.getElementById('profitPercent'); const suggestEl = document.getElementById('suggestedPrice');
    if (costEl && profitEl && suggestEl) {
        const calc = () => {
            const cost = parseFloat(costEl.value) || 0;
            const profit = parseFloat(profitEl.value) || 0;
            suggestEl.innerText = (cost * (1 + profit / 100)).toFixed(2);
        };
        costEl.oninput = calc; profitEl.oninput = calc;
    }
}

function quickEditProduct(productId) {
    const item = masterData.find(m => m.id == productId) || menuData.find(m => m.id == productId);
    if (item) {
        document.getElementById('productModal')?.classList.add('hidden');
        handleEditClick(item.id, { stopPropagation: () => {} });
    }
}

async function quickDeleteProduct(productId, productName, btn) {
    if (!confirm(`ลบสินค้า "${productName}" ใช่ไหม?`)) return;
    btn.disabled = true; btn.innerText = '...';
    try {
        await dbDelete('menu', productId);
        menuData = menuData.filter(m => m.id != productId);
        masterData = masterData.filter(m => m.id != productId);
        localStorage.removeItem('cachedMenuData');
        showToast(`ลบ "${productName}" แล้ว`, 'success');
        loadProductModal();
        filterMenu('All');
    } catch(e) {
        btn.disabled = false; btn.innerText = 'ลบ';
        showCustomAlert('ผิดพลาด', 'ลบไม่สำเร็จ: ' + e.message);
    }
}
