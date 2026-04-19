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

// ============================================================
// 🏪 SHOP INFO — ข้อมูลร้านสำหรับใบเสร็จ
// ============================================================
let _shopInfo = null; // cache

async function getShopInfo() {
    if (_shopInfo) return _shopInfo;
    try {
        const s = await dbGet('settings', 'shopInfo');
        _shopInfo = (s && s.value) ? s.value : {};
    } catch(e) {
        console.warn('getShopInfo error:', e);
        _shopInfo = {};
    }
    return _shopInfo || {};
}

async function saveShopInfo() {
    const name    = document.getElementById('shopNameInput')?.value.trim()    || '';
    const address = document.getElementById('shopAddressInput')?.value.trim() || '';
    const phone   = document.getElementById('shopPhoneInput')?.value.trim()   || '';
    const footer  = document.getElementById('shopFooterInput')?.value.trim()  || 'ขอบคุณที่ใช้บริการค่ะ';
    const newInfo = { name, address, phone, footer };
    // อัปเดต cache ทันที
    _shopInfo = newInfo;
    await dbPut('settings', { key: 'shopInfo', value: newInfo });
    showToast('บันทึกข้อมูลร้านแล้ว ✅', 'success');
}

async function loadShopInfoToForm() {
    const info = await getShopInfo();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('shopNameInput',    info.name    || '');
    set('shopAddressInput', info.address || '');
    set('shopPhoneInput',   info.phone   || '');
    set('shopFooterInput',  info.footer  || 'ขอบคุณที่ใช้บริการค่ะ');
}

// ═══════════════════════════════════════════════════════════
// 🛵 DELIVERY SETTINGS — เปิด/ปิดรับออเดอร์ + ยอดขั้นต่ำ
// ═══════════════════════════════════════════════════════════
// cache ค่าล่าสุด (ไว้ใช้ตอน enforce ยอดขั้นต่ำ)
let _deliverySettings = { isActive: true, minOrder: 100 };

async function getDeliverySettings() {
    try {
        const s = await dbGet('settings', 'deliverySettings');
        if (s && s.value) {
            _deliverySettings = {
                isActive: s.value.isActive !== false,  // default true
                minOrder: parseFloat(s.value.minOrder) || 100
            };
        }
    } catch(e) { console.warn('load delivery settings err:', e); }
    return _deliverySettings;
}

async function saveDeliverySettings() {
    const toggle = document.getElementById('deliveryActiveToggle');
    const minInput = document.getElementById('deliveryMinOrderInput');
    const isActive = toggle ? toggle.checked : true;
    const minOrder = minInput ? (parseFloat(minInput.value) || 0) : 100;

    if (minOrder < 0) {
        showToast('ยอดขั้นต่ำต้องมากกว่าหรือเท่ากับ 0', 'warning');
        return;
    }

    const newSettings = { isActive, minOrder };
    _deliverySettings = newSettings;
    try {
        await dbPut('settings', { key: 'deliverySettings', value: newSettings });
        showToast(`บันทึกการตั้งค่าเดลิเวอรี่แล้ว ${isActive ? '✅ เปิดรับออเดอร์' : '🚫 ปิดรับออเดอร์'}`, 'success');
        updateDeliveryStatusLabel();
    } catch(e) {
        showToast('บันทึกไม่สำเร็จ: ' + (e.message || e), 'warning');
    }
}

async function loadDeliverySettingsToForm() {
    const s = await getDeliverySettings();
    const toggle = document.getElementById('deliveryActiveToggle');
    const minInput = document.getElementById('deliveryMinOrderInput');
    if (toggle) toggle.checked = s.isActive;
    if (minInput) minInput.value = s.minOrder;
    updateDeliveryStatusLabel();
}

function updateDeliveryStatusLabel() {
    const toggle = document.getElementById('deliveryActiveToggle');
    const label = document.getElementById('deliveryStatusLabel');
    if (!toggle || !label) return;
    if (toggle.checked) {
        label.innerText = '✅ เปิดรับออเดอร์เดลิเวอรี่';
        label.className = 'mt-2 text-xs font-bold text-center py-1.5 rounded-lg bg-green-100 text-green-700 border border-green-200';
    } else {
        label.innerText = '🚫 ปิดรับออเดอร์เดลิเวอรี่';
        label.className = 'mt-2 text-xs font-bold text-center py-1.5 rounded-lg bg-red-100 text-red-700 border border-red-200';
    }
}

// เช็คสถานะเดลิเวอรี่ — เรียกตอนโหมดลูกค้าเข้าระบบ
// ถ้าปิด → แสดง storeClosedModal และบล็อกการใช้งาน
async function checkDeliveryStatus() {
    const s = await getDeliverySettings();
    if (!s.isActive) {
        const modal = document.getElementById('storeClosedModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        return false;
    }
    return true;
}


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

const categories = ['สินค้าเดลิเวอรี่', 'เครื่องดื่ม', 'ขนม/ของว่าง', 'ของใช้ในบ้าน', 'อาหารแห้ง/เครื่องปรุง', 'อาหารสด', 'เบ็ดเตล็ด'];

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

    // ── Header: ชื่อร้าน + ที่อยู่ + เบอร์โทร ──
    R(shopName, { align:'center', bold:true, size: FONT_SZ + 6 });
    if (shopAddress) {
        // ถ้าที่อยู่ยาวเกิน 32 ตัว ตัดแบ่ง 2 บรรทัด
        const maxChars = 32;
        if (shopAddress.length > maxChars) {
            // หาจุดตัดที่ space ที่ใกล้ maxChars ที่สุด
            const breakAt = shopAddress.lastIndexOf(' ', maxChars) || maxChars;
            R(shopAddress.substring(0, breakAt).trim(),  { align:'center', size: FONT_SZ - 3 });
            R(shopAddress.substring(breakAt).trim(),     { align:'center', size: FONT_SZ - 3 });
        } else {
            R(shopAddress, { align:'center', size: FONT_SZ - 3 });
        }
    }
    if (shopPhone) R('โทร. ' + shopPhone, { align:'center', size: FONT_SZ - 3 });
    DIV('─');
    R('ใบเสร็จรับเงิน', { align:'center', bold:true, size: FONT_SZ + 2 });
    DIV('═');
    R('เลขที่: ' + billId,                   { size: FONT_SZ - 2 });
    R('วันที่: ' + dateStr + '  ' + timeStr, { size: FONT_SZ - 2 });
    if (custName && custName !== 'Walk-in' && custName !== 'หน้าร้าน')
        R('ลูกค้า: ' + custName + (custPhone ? ' ('+custPhone+')' : ''), { size: FONT_SZ - 2 });
    if (custAddr) R('ส่งที่: ' + custAddr, { size: FONT_SZ - 2 });
    DIV();

    // header รายการ (3 columns)
    rows.push({ type:'cols3', name:'รายการ', qty:'จน.', amt:'รวม', bold:true, size: FONT_SZ - 2 });
    DIV();

    // รายการสินค้า
    items.forEach(item => {
        const qty = parseInt(item.qty || 1);
        const unitPrice = parseFloat(item.price || 0);
        const amt = (unitPrice * qty).toLocaleString('th-TH', { minimumFractionDigits: 2 });
        // บรรทัดบน: ชื่อสินค้า + จำนวน + ยอดรวม
        rows.push({ type:'cols3', name: String(item.name || ''), qty: String(qty), amt, size: FONT_SZ - 2 });
        // ✅ บรรทัดล่าง: x จำนวน @ ราคาต่อหน่วย (ตัวเล็กเอียง สีเทา)
        const unitStr = `  ${qty} x ${unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿/หน่วย`;
        rows.push({ text: unitStr, size: FONT_SZ - 6, align: 'left', color: '#555' });
    });

    DIV();
    rows.push({ type:'cols2', left:'รวม ('+items.length+' รายการ)', right: total.toLocaleString('th-TH',{minimumFractionDigits:2})+' ฿', bold:true });
    rows.push({ type:'cols2', left:'รับเงิน',  right: recv.toLocaleString('th-TH',{minimumFractionDigits:2})+' ฿', size: FONT_SZ-2 });
    rows.push({ type:'cols2', left:'เงินทอน',  right: change.toLocaleString('th-TH',{minimumFractionDigits:2})+' ฿', size: FONT_SZ-2 });
    DIV('═');
    R(shopFooter, { align:'center', size: FONT_SZ - 2, mt:4 });
    R(' ',        { size: 8 });

    // ── โหลด QR images (ถ้ามี) ──
    // QR 1: รูปจาก Supabase Storage (bankQR ที่ตั้งค่าไว้)
    // QR 2: ลิงก์สั่งซื้อออนไลน์ สร้างจาก QR API
    // PAPER_W = 384 dots, QR_SIZE = 256 → ~67% ของกระดาษ = ~39mm บนกระดาษจริง
    // ⭐️ ขอจาก API ขนาด "เท่ากับ" QR_SIZE เพื่อไม่ต้อง resize (ป้องกัน blur)
    const QR_SIZE = 256;
    const QR_GAP  = 12;

    // ฟังก์ชันโหลดรูปเป็น HTMLImageElement
    const loadImg = (src) => new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null); // ถ้าโหลดไม่ได้ให้ข้าม
        img.src = src;
    });

    // โหลด QR สั่งซื้อออนไลน์เสมอ
    // ⭐️ ขอ QR จาก API ขนาดเท่ากับ QR_SIZE (จะได้ไม่ต้อง resize → ไม่เบลอ)
    // ⭐️ margin=2 = quiet zone รอบ QR (จำเป็นสำหรับการสแกน)
    // ⭐️ ecc=H = error correction สูง ทนทานต่อการปริ้นเลือนได้ดีกว่า
    const orderUrl  = window.location.href.split('?')[0] + '?mode=customer';
    const orderQRSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&margin=2&ecc=H&data=${encodeURIComponent(orderUrl)}`;

    // โหลด bankQR จาก Storage (ถ้ามี)
    let bankQRSrc = null;
    try {
        const s = await dbGet('settings', 'bankQR');
        if (s && s.value) {
            if (s.value.storagePath && s.value.bucket) {
                const { data } = _supa.storage.from(s.value.bucket).getPublicUrl(s.value.storagePath);
                bankQRSrc = data?.publicUrl || null;
            } else if (s.value.image) {
                bankQRSrc = s.value.image; // base64 เก่า
            }
        }
    } catch(e) { bankQRSrc = null; }

    // โหลดรูปทั้งสอง parallel
    const [bankQRImg, orderQRImg] = await Promise.all([
        bankQRSrc ? loadImg(bankQRSrc) : Promise.resolve(null),
        loadImg(orderQRSrc),
    ]);

    const hasBank  = !!bankQRImg;
    const hasOrder = !!orderQRImg;
    const qrCount  = (hasBank ? 1 : 0) + (hasOrder ? 1 : 0);

    // ── คำนวณความสูง canvas ──
    let totalH = 14;
    rows.forEach(row => {
        totalH += (row.mt || 0);
        totalH += row.type ? LINE_H : Math.ceil((row.size || FONT_SZ) * 1.4);
    });
    // เพิ่มพื้นที่สำหรับ QR section (label + QR + caption)
    const QR_SECTION_H = qrCount === 2 ? (QR_SIZE*2 + 100) : qrCount === 1 ? (QR_SIZE + 50) : 0;
    totalH += QR_SECTION_H;

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
            const nW = Math.floor(COL_W * 0.55);
            const qW = Math.floor(COL_W * 0.12);
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

    // ── วาด QR Codes ท้ายใบเสร็จ ──
    if (qrCount > 0) {
        y += 8;

        // ⭐️ สำคัญมาก: ปิด image smoothing เพื่อให้ pixel ของ QR คมชัด
        // ไม่งั้นจะเบลอ → เครื่องปริ้น thermal threshold เป็น 1-bit จะกลายเป็นจุดขาดๆ → สแกนไม่ได้
        ctx.imageSmoothingEnabled = false;

        if (qrCount === 2) {
            // วาดสอง QR เรียงบน-ล่าง กึ่งกลาง
            const qx = Math.floor((PAPER_W - QR_SIZE) / 2);

            // ── QR บน: bankQR (ชำระเงิน) ──
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.strokeRect(qx - 4, y - 4, QR_SIZE + 8, QR_SIZE + 8);
            ctx.drawImage(bankQRImg, qx, y, QR_SIZE, QR_SIZE);
            y += QR_SIZE + 8;
            ctx.font = `400 ${FONT_SZ - 4}px ${FONT_FAM}`;
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#444';
            const lbl1 = 'สแกนเพื่อชำระเงิน';
            ctx.fillText(lbl1, (PAPER_W - ctx.measureText(lbl1).width) / 2, y);
            y += 24;

            // เส้นคั่น
            ctx.fillStyle = '#eee';
            ctx.fillRect(PAD_X, y, COL_W, 1);
            ctx.fillStyle = '#000';
            y += 10;

            // ── QR ล่าง: order online ──
            ctx.strokeStyle = '#ddd';
            ctx.strokeRect(qx - 4, y - 4, QR_SIZE + 8, QR_SIZE + 8);
            ctx.drawImage(orderQRImg, qx, y, QR_SIZE, QR_SIZE);
            y += QR_SIZE + 8;
            ctx.font = `400 ${FONT_SZ - 4}px ${FONT_FAM}`;
            ctx.fillStyle = '#444';
            const lbl2 = 'สแกนเพื่อสั่งซื้อออนไลน์';
            ctx.fillText(lbl2, (PAPER_W - ctx.measureText(lbl2).width) / 2, y);
            y += 20;

        } else {
            // วาด QR เดี่ยว กึ่งกลาง
            const img  = hasBank ? bankQRImg : orderQRImg;
            const lbl  = hasBank ? 'ชำระเงิน' : 'สั่งซื้อออนไลน์';
            const qx   = Math.floor((PAPER_W - QR_SIZE) / 2);

            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.strokeRect(qx - 4, y - 4, QR_SIZE + 8, QR_SIZE + 8);
            ctx.drawImage(img, qx, y, QR_SIZE, QR_SIZE);
            y += QR_SIZE + 8;

            ctx.font = `400 ${FONT_SZ - 5}px ${FONT_FAM}`;
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#444';
            ctx.fillText(lbl, (PAPER_W - ctx.measureText(lbl).width) / 2, y);
            y += 20;
        }

        ctx.fillStyle = '#000';
    }

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
            // สำหรับ dot ใน navbar (printerStatusDot) — ใช้ขนาดเล็ก 1.5
            if (dot === 'printerStatusDot') {
                dotEl.className = 'absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-gray-300 ring-1 ring-white/80';
            } else {
                dotEl.className  = 'w-2 h-2 rounded-full bg-gray-300';
            }
            textEl.innerText = 'iPad ไม่รองรับ Bluetooth';
            return; // return ใน forEach แทน continue
        }
        if (connected) {
            if (dot === 'printerStatusDot') {
                // navbar: จุดเล็กๆ สีเขียว pulse
                dotEl.className = 'absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ring-1 ring-white/80';
            } else {
                dotEl.className  = 'w-2 h-2 rounded-full bg-green-400 animate-pulse';
                dotEl.style.width = dotEl.style.height = dot === 'printerStatusDot3' ? '12px' : '';
            }
            textEl.innerText = PRINTER.device?.name || 'เชื่อมต่อแล้ว';
        } else {
            if (dot === 'printerStatusDot') {
                dotEl.className = 'absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-gray-400 ring-1 ring-white/80';
            } else {
                dotEl.className  = 'w-2 h-2 rounded-full bg-gray-400';
            }
            textEl.innerText = dot === 'printerStatusDot2' ? 'เครื่องปริ้นยังไม่เชื่อมต่อ' : 'ยังไม่เชื่อมต่อ';
        }
    });
    // navbar button — ไม่เขียนทับ innerHTML (รักษา layout icon-only ไว้), แค่ปรับ opacity/tooltip
    const btn = document.getElementById('btnConnectPrinter');
    if (btn) {
        // iOS: แสดงไอคอน disabled
        if (IS_IOS || !HAS_BLUETOOTH) {
            btn.style.opacity = '0.5';
            btn.title = 'iPad ไม่รองรับ Bluetooth';
            return;
        }
        btn.style.opacity = '1';
        const name = PRINTER.device?.name;
        btn.title = connected
            ? `เครื่องปริ้น: ${name || 'เชื่อมต่อแล้ว'}`
            : 'เครื่องปริ้น: ยังไม่เชื่อมต่อ';
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
    // ✅ paginate: ดึงทีละ 1000 จนครบทุกแถว (แก้ปัญหา Supabase default limit 1000)
    const PAGE_SIZE = 1000;
    let all = [];
    let from = 0;
    while (true) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await _supa.from(t).select('*').range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    if (t === 'products')  return all.map(rowToProduct);
    if (t === 'orders')    return all.map(rowToOrder);
    if (t === 'bills')     return all.map(rowToBill);
    if (t === 'settings')  return all;
    return all;
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
// ═══════════════════════════════════════════════════════════
// 📦 STOCK MANAGEMENT — Server-side search + Mobile-first
// ═══════════════════════════════════════════════════════════
let _stockSearchTimer = null;
const STOCK_PAGE_SIZE = 50; // แสดงทีละ 50 รายการ (ป้องกัน load เกิน 1000)

async function openStockModal() {
    document.getElementById('stockModal').classList.remove('hidden');
    const searchEl = document.getElementById('stockSearchInput');
    if (searchEl) searchEl.value = '';
    await renderStockTable('');
}

// debounce การพิมพ์เพื่อไม่ให้ query รัวๆ
function onStockSearchInput(value) {
    const clearBtn = document.getElementById('btnClearStockSearch');
    if (clearBtn) clearBtn.classList.toggle('hidden', !value);
    clearTimeout(_stockSearchTimer);
    _stockSearchTimer = setTimeout(() => renderStockTable(value), 250);
}

function clearStockSearch() {
    const el = document.getElementById('stockSearchInput');
    if (el) { el.value = ''; el.focus(); }
    document.getElementById('btnClearStockSearch')?.classList.add('hidden');
    renderStockTable('');
}

async function renderStockTable(searchTerm = '') {
    const content = document.getElementById('stockContent');
    const statusText = document.getElementById('stockStatusText');
    if (!content) return;

    content.innerHTML = '<div class="text-center p-10 text-gray-400"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>';
    if (statusText) statusText.innerText = 'กำลังโหลด...';

    try {
        // ✅ Normalize input
        const s = String(searchTerm || '').trim().replace(/\s+/g, '');

        // ✅ Build query — ใช้ server-side search ไม่ดึงทุก row มา filter ใน JS
        let query = _supa.from('products').select('id,name,category,stock_qty,stock_min,price,cost', { count: 'exact' });

        if (s) {
            // ค้นหาแบบ: id ตรงเป๊ะ (สำหรับบาร์โค้ด) OR ชื่อมีคำที่ค้น OR id มีคำที่ค้น
            // ใช้ .or() ของ Supabase — escape comma และ paren ใน search
            const safe = s.replace(/[,()]/g, '');
            query = query.or(`id.ilike.%${safe}%,name.ilike.%${safe}%`);
        }

        // ดึงสูงสุด STOCK_PAGE_SIZE แถว (เร็วทันใจบนมือถือ)
        query = query.order('name').range(0, STOCK_PAGE_SIZE - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        const items = data || [];
        const total = count || items.length;

        // อัปเดต status bar
        if (statusText) {
            if (s) {
                statusText.innerText = `🔍 พบ ${total.toLocaleString()} รายการ${total > items.length ? ` (แสดง ${items.length})` : ''}`;
            } else {
                statusText.innerText = `📦 ทั้งหมด ${total.toLocaleString()} รายการ${total > items.length ? ` (แสดง ${items.length} ล่าสุด — พิมพ์เพื่อค้นหา)` : ''}`;
            }
        }

        // ── ไม่พบ ──
        if (items.length === 0) {
            const safeSearch = String(searchTerm).replace(/'/g, "\\'").replace(/</g, '&lt;');
            content.innerHTML = `<div class="text-center p-8">
                <div class="text-gray-400 mb-4">
                    <i class="fas fa-search text-4xl mb-3"></i>
                    <div class="text-base">ไม่พบสินค้าที่ตรงกับ</div>
                    <div class="font-mono bg-gray-100 px-3 py-1 rounded mt-2 inline-block text-gray-700 break-all">${safeSearch || '-'}</div>
                </div>
                ${searchTerm ? `<button onclick="quickAddProductFromBarcode('${safeSearch}')"
                    class="bg-blue-500 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-bold transition active:scale-95 shadow-lg">
                    <i class="fas fa-plus mr-2"></i>เพิ่มสินค้าใหม่ด้วยรหัสนี้
                </button>` : ''}
            </div>`;
            return;
        }

        // ── Render: Card layout บนมือถือ + Table บนเดสก์ท็อป ──
        content.innerHTML = `
            <!-- Mobile: Card layout (แสดงเฉพาะ < md breakpoint) -->
            <div class="md:hidden p-2 space-y-2">
                ${items.map(p => renderStockCard(p)).join('')}
            </div>

            <!-- Desktop: Table layout (แสดงเฉพาะ >= md breakpoint) -->
            <div class="hidden md:block">
                <table class="w-full text-sm">
                    <thead class="sticky top-0 z-10 bg-gray-100">
                        <tr class="border-b-2 border-gray-200">
                            <th class="p-2 text-left text-xs font-bold text-gray-600 uppercase">รหัส</th>
                            <th class="p-2 text-left text-xs font-bold text-gray-600 uppercase min-w-[140px]">ชื่อสินค้า</th>
                            <th class="p-2 text-left text-xs font-bold text-gray-600 uppercase">หมวดหมู่</th>
                            <th class="p-2 text-right text-xs font-bold text-gray-600 uppercase">ทุน</th>
                            <th class="p-2 text-right text-xs font-bold text-gray-600 uppercase">ราคาขาย</th>
                            <th class="p-2 text-center text-xs font-bold text-gray-600 uppercase">กำไร</th>
                            <th class="p-2 text-left text-xs font-bold text-gray-600 uppercase min-w-[140px]">สต็อก</th>
                            <th class="p-2 text-center text-xs font-bold text-gray-600 uppercase">ขั้นต่ำ</th>
                            <th class="p-2 text-center text-xs font-bold text-gray-600 uppercase">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white">
                        ${items.map(p => renderStockRow(p)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch(e) {
        console.error('renderStockTable error:', e);
        content.innerHTML = `<div class="text-center p-6 text-red-500">
            <i class="fas fa-exclamation-triangle text-3xl mb-2"></i><br>
            โหลดข้อมูลไม่ได้: ${e.message || e}
        </div>`;
        if (statusText) statusText.innerText = '❌ โหลดไม่สำเร็จ';
    }
}

// ── Render สินค้า 1 รายการแบบการ์ด (สำหรับมือถือ) ──
function renderStockCard(p) {
    const qty = p.stock_qty || 0;
    const min = p.stock_min || 5;
    const price = parseFloat(p.price || 0);
    const cost  = parseFloat(p.cost || 0);
    const profit = price - cost;
    const profitPct = cost > 0 ? Math.round((profit / cost) * 100) : 0;
    const profitColor = profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-500';

    let badgeStyle, badgeText, leftBorderColor;
    if (qty <= 0)        { badgeStyle = 'bg-red-100 text-red-700';     badgeText = '🚫 หมด';     leftBorderColor = 'border-l-red-500'; }
    else if (qty <= min) { badgeStyle = 'bg-yellow-100 text-yellow-800'; badgeText = '⚠️ ใกล้หมด'; leftBorderColor = 'border-l-yellow-500'; }
    else                 { badgeStyle = 'bg-green-100 text-green-700'; badgeText = '✓ ปกติ';     leftBorderColor = 'border-l-green-500'; }

    const safeId   = String(p.id).replace(/'/g, "\\'");
    const safeName = String(p.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `<div class="bg-white rounded-xl shadow-sm border-l-4 ${leftBorderColor} border-y border-r border-gray-200 p-3 active:bg-gray-50 transition">
        <!-- Row 1: ชื่อ + badge -->
        <div class="flex items-start justify-between gap-2 mb-2">
            <input type="text" value="${safeName}"
                   onblur="updateProductField('${safeId}','name',this.value,this)"
                   onkeydown="if(event.key==='Enter')this.blur()"
                   class="flex-1 font-bold text-gray-800 text-base border border-transparent focus:border-blue-400 focus:bg-blue-50 rounded px-2 py-1 outline-none -mx-1 -my-0.5" />
            <span class="${badgeStyle} text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap shrink-0">${badgeText}</span>
        </div>

        <!-- Row 2: รหัส + หมวด -->
        <div class="text-[11px] text-gray-500 mb-3 flex items-center gap-2 flex-wrap">
            <span class="font-mono bg-gray-100 px-2 py-0.5 rounded">${p.id}</span>
            <span>·</span>
            <span>${p.category || 'เบ็ดเตล็ด'}</span>
        </div>

        <!-- Row 3: ทุน / ราคา / กำไร (3 ช่อง) -->
        <div class="grid grid-cols-3 gap-2 mb-3">
            <div class="bg-gray-50 rounded-lg p-2">
                <div class="text-[10px] text-gray-500 font-bold mb-0.5">ทุน</div>
                <input type="number" inputmode="decimal" step="0.01" min="0" value="${cost}"
                       onblur="updateProductField('${safeId}','cost',this.value,this)"
                       onkeydown="if(event.key==='Enter')this.blur()"
                       class="w-full bg-transparent text-base font-bold text-gray-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-300 rounded px-1" />
            </div>
            <div class="bg-blue-50 rounded-lg p-2">
                <div class="text-[10px] text-blue-600 font-bold mb-0.5">ราคาขาย</div>
                <input type="number" inputmode="decimal" step="0.01" min="0" value="${price}"
                       onblur="updateProductField('${safeId}','price',this.value,this)"
                       onkeydown="if(event.key==='Enter')this.blur()"
                       class="w-full bg-transparent text-base font-bold text-blue-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-400 rounded px-1" />
            </div>
            <div class="bg-green-50 rounded-lg p-2">
                <div class="text-[10px] text-green-700 font-bold mb-0.5">กำไร</div>
                <div class="text-base font-bold ${profitColor} leading-tight">${profit.toFixed(2)}</div>
                <div class="text-[9px] ${profitColor} opacity-75">${profitPct}%</div>
            </div>
        </div>

        <!-- Row 4: สต็อก progress + จำนวน + ปุ่ม -->
        <div class="flex items-center gap-2">
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <span class="text-2xl font-extrabold text-gray-800">${qty}</span>
                    <div class="flex-1">
                        <div class="bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div class="${qty <= 0 ? 'bg-red-400' : qty <= min ? 'bg-yellow-400' : 'bg-green-400'} h-2 rounded-full transition-all"
                                 style="width:${Math.min(Math.round((qty / Math.max(min * 3, 1)) * 100), 100)}%"></div>
                        </div>
                        <div class="text-[10px] text-gray-500 mt-0.5">ขั้นต่ำ:
                            <input type="number" inputmode="numeric" min="1" value="${min}"
                                   onblur="updateStockMin('${safeId}',this.value)"
                                   onkeydown="if(event.key==='Enter')this.blur()"
                                   class="w-12 bg-transparent text-gray-700 font-bold text-center border-b border-gray-300 focus:border-blue-500 outline-none" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
                <button onclick="adjustStock('${safeId}','${safeName}',${qty},'add')"
                        class="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow-sm active:scale-95 flex items-center gap-1">
                    <i class="fas fa-plus"></i><span>เพิ่ม</span>
                </button>
                <button onclick="adjustStock('${safeId}','${safeName}',${qty},'set')"
                        class="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow-sm active:scale-95 flex items-center gap-1">
                    <i class="fas fa-edit"></i><span>ตั้ง</span>
                </button>
            </div>
        </div>
    </div>`;
}

// ── Render สินค้า 1 รายการแบบ table row (สำหรับเดสก์ท็อป) ──
function renderStockRow(p) {
    const qty = p.stock_qty || 0;
    const min = p.stock_min || 5;
    const price = parseFloat(p.price || 0);
    const cost  = parseFloat(p.cost || 0);
    const profit = price - cost;
    const profitPct = cost > 0 ? Math.round((profit / cost) * 100) : 0;
    const profitClass = profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-500';
    const badge = qty <= 0
        ? `<span class="inline-block bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">หมด</span>`
        : qty <= min
            ? `<span class="inline-block bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full">ใกล้หมด</span>`
            : `<span class="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">ปกติ</span>`;
    const barPct = Math.min(Math.round((qty / Math.max(min * 3, 1)) * 100), 100);
    const barColor = qty <= 0 ? 'bg-red-400' : qty <= min ? 'bg-yellow-400' : 'bg-green-400';
    const safeId = String(p.id).replace(/'/g, "\\'");
    const safeName = String(p.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `<tr class="border-b border-gray-100 hover:bg-green-50/30 transition">
        <td class="p-2 text-[10px] text-gray-500 font-mono whitespace-nowrap">${p.id}</td>
        <td class="p-2">
            <input type="text" value="${safeName}"
                   onblur="updateProductField('${safeId}','name',this.value,this)"
                   onkeydown="if(event.key==='Enter')this.blur()"
                   class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 text-sm font-bold text-gray-700 bg-transparent focus:bg-white outline-none" />
        </td>
        <td class="p-2 text-xs text-gray-500">${p.category || '-'}</td>
        <td class="p-2">
            <input type="number" step="0.01" min="0" value="${cost}"
                   onblur="updateProductField('${safeId}','cost',this.value,this)"
                   onkeydown="if(event.key==='Enter')this.blur()"
                   class="w-20 border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 text-right text-sm bg-transparent focus:bg-white outline-none" />
        </td>
        <td class="p-2">
            <input type="number" step="0.01" min="0" value="${price}"
                   onblur="updateProductField('${safeId}','price',this.value,this)"
                   onkeydown="if(event.key==='Enter')this.blur()"
                   class="w-20 border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 text-right text-sm font-bold text-blue-600 bg-transparent focus:bg-white outline-none" />
        </td>
        <td class="p-2 text-center">
            <span class="${profitClass} font-bold text-xs whitespace-nowrap">
                ${profit.toFixed(2)}<span class="text-[10px] opacity-70"> (${profitPct}%)</span>
            </span>
        </td>
        <td class="p-2">
            <div class="flex items-center gap-2">
                <div class="flex-1 bg-gray-200 rounded-full h-2 min-w-[40px]"><div class="${barColor} h-2 rounded-full" style="width:${barPct}%"></div></div>
                <span class="text-sm font-bold text-gray-800 w-8 text-right">${qty}</span>
            </div>
            <div class="mt-1">${badge}</div>
        </td>
        <td class="p-2 text-center">
            <input type="number" min="1" value="${min}"
                   onblur="updateStockMin('${safeId}',this.value)"
                   onkeydown="if(event.key==='Enter')this.blur()"
                   class="w-14 border border-gray-200 rounded-lg p-1 text-sm text-center focus:border-blue-500 outline-none" />
        </td>
        <td class="p-2">
            <div class="flex gap-1 justify-center">
                <button onclick="adjustStock('${safeId}','${safeName}',${qty},'add')"
                        class="bg-green-500 hover:bg-green-600 text-white text-[10px] px-2 py-1 rounded-lg font-bold whitespace-nowrap" title="เพิ่มสต็อก">
                    <i class="fas fa-plus"></i>
                </button>
                <button onclick="adjustStock('${safeId}','${safeName}',${qty},'set')"
                        class="bg-blue-500 hover:bg-blue-600 text-white text-[10px] px-2 py-1 rounded-lg font-bold whitespace-nowrap" title="ตั้งค่า">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        </td>
    </tr>`;
}

// ═══════════════════════════════════════════════════════════
// แก้ไขชื่อ / ทุน / ราคา ของสินค้า inline
// ═══════════════════════════════════════════════════════════
async function updateProductField(productId, field, newValue, inputEl) {
    let updateData = {};
    if (field === 'name') {
        const trimmed = (newValue || '').trim();
        if (!trimmed) {
            showToast('ชื่อสินค้าห้ามว่าง', 'warning');
            // refresh เพื่อคืนค่าเดิม
            renderStockTable(document.getElementById('stockSearchInput')?.value || '');
            return;
        }
        updateData.name = trimmed;
    } else if (field === 'cost' || field === 'price') {
        const num = parseFloat(newValue);
        if (isNaN(num) || num < 0) {
            showToast('ตัวเลขไม่ถูกต้อง', 'warning');
            renderStockTable(document.getElementById('stockSearchInput')?.value || '');
            return;
        }
        updateData[field] = num;
    } else {
        return;
    }

    // เช็คว่าเปลี่ยนจริงหรือไม่ (เผื่อ onblur ถูก trigger โดยไม่ได้แก้)
    const { data: current } = await _supa.from('products').select(field).eq('id', productId).single();
    if (current && String(current[field]) === String(updateData[field])) return; // ไม่เปลี่ยน

    const { error } = await _supa.from('products').update(updateData).eq('id', productId);
    if (error) {
        showToast('อัปเดตไม่สำเร็จ: ' + error.message, 'warning');
        renderStockTable(document.getElementById('stockSearchInput')?.value || '');
        return;
    }
    showToast(`อัปเดต${field === 'name' ? 'ชื่อ' : field === 'cost' ? 'ทุน' : 'ราคา'}แล้ว`, 'success');
    // refresh เพื่อคำนวณกำไรใหม่และล้าง cache เมนู
    localStorage.removeItem('cachedMenuData');
    // ใช้ flash effect ที่ input แทน re-render ทั้งตาราง (ดีกว่าเพราะ user อาจกำลังแก้ field อื่นอยู่)
    if (inputEl) {
        inputEl.style.backgroundColor = '#d1fae5';
        setTimeout(() => { inputEl.style.backgroundColor = ''; }, 600);
    }
    // re-render เฉพาะเมื่อเปลี่ยน price/cost เพราะกำไรเปลี่ยน
    if (field === 'cost' || field === 'price') {
        setTimeout(() => renderStockTable(document.getElementById('stockSearchInput')?.value || ''), 650);
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

// ── ฟังก์ชันช่วย: ถ้าสแกน barcode แล้วไม่พบ ให้เปิด form เพิ่มสินค้าใหม่ พร้อม pre-fill รหัส ──
function quickAddProductFromBarcode(barcode) {
    closeModal('stockModal');
    openAddMenuModal();
    setTimeout(() => {
        const codeInput = document.getElementById('mCode');
        if (codeInput) {
            codeInput.value = barcode;
            // โฟกัสไปที่ช่องชื่อให้ user กรอกต่อ
            const nameInput = document.getElementById('mName');
            if (nameInput) nameInput.focus();
        }
    }, 200);
    showToast(`พร้อมเพิ่มสินค้าใหม่ด้วยรหัส: ${barcode}`, 'success');
}

// ═══════════════════════════════════════════════════════════
// 📷 BARCODE SCANNER (html5-qrcode)
// ═══════════════════════════════════════════════════════════
let _barcodeScanner = null;
let _barcodeTargetInputId = null;
let _barcodeCurrentCamera = 'environment'; // 'environment' = กล้องหลัง (default)

async function openBarcodeScanner(targetInputId = 'stockSearchInput') {
    _barcodeTargetInputId = targetInputId;

    // ── ขั้นตอนที่ 1: เช็คความพร้อมของระบบ ก่อนเปิด modal ──
    // 1A. ไลบรารีโหลดมาหรือยัง
    if (typeof Html5Qrcode === 'undefined') {
        alert('❌ ไลบรารีสแกนบาร์โค้ดยังไม่พร้อม\n\nกรุณา:\n1. ตรวจสอบว่าเครือข่ายอินเทอร์เน็ตปกติ\n2. รีเฟรชหน้าจอ (Pull-to-refresh)');
        return;
    }
    // 1B. เบราว์เซอร์รองรับกล้องไหม (mediaDevices API)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('❌ เบราว์เซอร์นี้ไม่รองรับการเข้าถึงกล้อง\n\nกรุณาใช้ Chrome หรือ Safari เวอร์ชันใหม่');
        return;
    }
    // 1C. ต้อง HTTPS (หรือ localhost) เท่านั้น — เป็นข้อบังคับของเบราว์เซอร์
    const isSecure = window.isSecureContext ||
                     location.protocol === 'https:' ||
                     location.hostname === 'localhost' ||
                     location.hostname === '127.0.0.1';
    if (!isSecure) {
        alert('❌ การใช้กล้องต้องใช้ HTTPS\n\nหน้านี้เปิดผ่าน ' + location.protocol + ' ซึ่งเบราว์เซอร์ไม่อนุญาตให้เข้าถึงกล้อง\n\nกรุณาเปิดเว็บผ่าน https:// หรือ localhost');
        return;
    }

    // ── ขั้นตอนที่ 2: เปิด modal ──
    document.getElementById('barcodeScannerModal').classList.remove('hidden');
    document.getElementById('barcodeHint').innerText = 'กำลังเตรียมกล้อง...';

    // เคลียร์ scanner เก่าถ้ามี (กรณีเปิดซ้ำ)
    if (_barcodeScanner) {
        try { if (_barcodeScanner.isScanning) await _barcodeScanner.stop(); } catch(e) {}
        try { await _barcodeScanner.clear(); } catch(e) {}
        _barcodeScanner = null;
    }

    // เคลียร์ DOM ของ reader (กรณีมี element เก่าค้าง)
    const readerEl = document.getElementById('barcodeReader');
    if (readerEl) readerEl.innerHTML = '';

    // รอให้ DOM render เสร็จก่อน new Html5Qrcode (สำคัญมากบน iOS)
    await new Promise(r => setTimeout(r, 200));

    // ── ขั้นตอนที่ 3: สร้าง scanner instance + เริ่มกล้อง ──
    try {
        _barcodeScanner = new Html5Qrcode('barcodeReader', /* verbose */ false);
    } catch(e) {
        console.error('Html5Qrcode constructor failed:', e);
        document.getElementById('barcodeHint').innerText = '❌ สร้าง scanner ไม่ได้: ' + (e.message || e);
        alert('❌ สร้าง scanner ไม่ได้: ' + (e.message || e));
        return;
    }

    await _startBarcodeCamera(_barcodeCurrentCamera);
}

async function _startBarcodeCamera(facingMode) {
    if (!_barcodeScanner) return;
    const hint = document.getElementById('barcodeHint');

    // ── config: ไม่ใช้ Html5QrcodeSupportedFormats เพื่อหลีกเลี่ยงปัญหา UMD bundle ──
    // ปล่อยให้ default รองรับทุก format
    const config = {
        fps: 10,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
            // กรอบสแกนที่ adaptive ตามขนาดวีดีโอ
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrSize = Math.floor(minEdge * 0.75);
            return { width: qrSize, height: Math.floor(qrSize * 0.6) };
        }
    };

    try {
        hint.innerText = 'กำลังขออนุญาตเข้าถึงกล้อง...';
        await _barcodeScanner.start(
            { facingMode: facingMode },
            config,
            onBarcodeScanSuccess,
            () => {} // ignore individual scan failures (เกิดทุกเฟรมที่หาไม่เจอ)
        );
        hint.innerText = '📱 จัดบาร์โค้ดให้อยู่ในกรอบ ระบบจะอ่านอัตโนมัติ';
    } catch(e) {
        console.error('Camera start error:', e);
        // แปลง error เป็นข้อความที่ user เข้าใจ
        let userMsg = '';
        const errStr = String(e?.message || e || '');
        const errName = e?.name || '';

        if (errName === 'NotAllowedError' || errStr.includes('Permission') || errStr.includes('denied')) {
            userMsg = '❌ ไม่ได้รับอนุญาตให้ใช้กล้อง\n\nวิธีแก้:\n• Chrome: แตะรูปแม่กุญแจใน address bar → อนุญาตกล้อง\n• Safari: ตั้งค่า → Safari → กล้อง → อนุญาต';
        } else if (errName === 'NotFoundError' || errStr.includes('NotFound') || errStr.includes('no camera')) {
            userMsg = '❌ ไม่พบกล้องในอุปกรณ์นี้';
        } else if (errName === 'NotReadableError' || errStr.includes('in use') || errStr.includes('NotReadable')) {
            userMsg = '❌ กล้องถูกใช้งานอยู่โดยแอปอื่น\n\nกรุณาปิดแอปกล้องอื่นๆ แล้วลองใหม่';
        } else if (errName === 'OverconstrainedError' || errStr.includes('Overconstrained')) {
            userMsg = '❌ กล้องนี้ไม่รองรับโหมดที่เลือก กำลังลองสลับกล้อง...';
            // ลอง fallback ไปใช้กล้องอีกฝั่งอัตโนมัติ
            setTimeout(() => switchBarcodeCamera(), 800);
        } else {
            userMsg = '❌ เปิดกล้องไม่ได้\n\nรายละเอียด: ' + errStr;
        }
        hint.innerText = userMsg.split('\n')[0];
        alert(userMsg);
    }
}

function onBarcodeScanSuccess(decodedText) {
    if (!decodedText) return;
    // ✅ trim และลบ whitespace แฝง (บาร์โค้ดบางครั้งมี \n หรือ space ติดมา)
    const cleaned = String(decodedText).trim().replace(/\s+/g, '');
    if (!cleaned) return;
    // เติมค่าลง input target
    const target = document.getElementById(_barcodeTargetInputId);
    if (target) {
        target.value = cleaned;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.focus();
    }
    // bleep เพื่อ feedback
    try { playNotificationSound(); } catch(e) {}
    showToast(`สแกนได้: ${cleaned}`, 'success');
    closeBarcodeScanner();
}

async function closeBarcodeScanner() {
    if (_barcodeScanner) {
        try {
            if (_barcodeScanner.isScanning) await _barcodeScanner.stop();
        } catch(e) { console.warn('stop scanner err', e); }
        try {
            await _barcodeScanner.clear();
        } catch(e) { console.warn('clear scanner err', e); }
        _barcodeScanner = null;
    }
    // เคลียร์ DOM ด้วย เผื่อมี element ค้าง
    const readerEl = document.getElementById('barcodeReader');
    if (readerEl) readerEl.innerHTML = '';
    document.getElementById('barcodeScannerModal').classList.add('hidden');
}

async function switchBarcodeCamera() {
    _barcodeCurrentCamera = _barcodeCurrentCamera === 'environment' ? 'user' : 'environment';
    if (!_barcodeScanner) return;
    try {
        if (_barcodeScanner.isScanning) await _barcodeScanner.stop();
        await _startBarcodeCamera(_barcodeCurrentCamera);
        showToast(`สลับไป${_barcodeCurrentCamera === 'user' ? 'กล้องหน้า' : 'กล้องหลัง'}แล้ว`, 'success');
    } catch(e) {
        console.error('switch camera err', e);
        showToast('สลับกล้องไม่สำเร็จ: ' + (e.message || e), 'warning');
    }
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
    const map = { 'สินค้าเดลิเวอรี่':'🛵', 'เครื่องดื่ม':'🥤', 'ขนม/ของว่าง':'🍪', 'ของใช้ในบ้าน':'🏠', 'อาหารแห้ง/เครื่องปรุง':'🧂', 'อาหารสด':'🥩', 'เบ็ดเตล็ด':'🛍️' };
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
    // ✅ โหมดลูกค้า: กรองเฉพาะสินค้าหมวด "สินค้าเดลิเวอรี่" เสมอ (override category อื่น)
    if (isCustomerMode) {
        filtered = filtered.filter(m => m.category === 'สินค้าเดลิเวอรี่');
        // ✅ กรองหมวดย่อย (drink/snack/dryfood) ถ้าเลือกไว้
        if (_customerSubCategory && _customerSubCategory !== 'all') {
            filtered = filtered.filter(m => classifyCustomerSubCat(m.name) === _customerSubCategory);
        }
    } else if (category !== 'All') {
        filtered = filtered.filter(m => m.category === category);
    } else {
        // ✅ โหมดผู้ขาย "ทั้งหมด": ซ่อนสินค้าเดลิเวอรี่ (จะเห็นเฉพาะเมื่อกดหมวดเดลิเวอรี่โดยตรง)
        filtered = filtered.filter(m => m.category !== 'สินค้าเดลิเวอรี่');
    }
    if (searchText) {
        if (isCustomerMode) {
            // ✅ ลูกค้า: ค้นเฉพาะชื่อสินค้า (ไม่ค้น id/บาร์โค้ด)
            filtered = filtered.filter(m => m.name.toLowerCase().includes(searchText));
        } else {
            filtered = filtered.filter(m => m.name.toLowerCase().includes(searchText) || (m.id && String(m.id).toLowerCase().includes(searchText)));
        }
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
    // คำนวณยอดรวมล่วงหน้าเพื่อเช็คยอดขั้นต่ำ
    const _preTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    if (isCustomerMode) {
        btnClassDesktop = "hidden";
        const minOrder = (_deliverySettings && _deliverySettings.minOrder) || 100;
        const shortBy = minOrder - _preTotal;
        if (shortBy > 0) {
            // ยังไม่พอขั้นต่ำ — แสดงยอดที่ต้องเพิ่ม + ปุ่มเทา (ยังกดได้แต่จะเตือน)
            btnHtmlMobile = `<span class="text-sm">ต้องซื้ออีก ${shortBy.toLocaleString()} ฿</span> <i class="fas fa-coins"></i>`;
            btnClassMobile = "w-full bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white font-bold py-3.5 rounded-xl shadow-lg transition transform active:scale-95 flex justify-center items-center gap-2";
        } else {
            btnHtmlMobile = '<span>🛵 สั่งเดลิเวอรี่</span> <i class="fas fa-check-circle"></i>';
            btnClassMobile = "w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition transform active:scale-95 flex justify-center items-center gap-2";
        }
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
    // ✅ เช็คยอดขั้นต่ำจาก delivery settings (แทน hardcode 100)
    if (isCustomerMode) {
        const minOrder = (_deliverySettings && _deliverySettings.minOrder) || 100;
        if (total < minOrder) {
            const shortBy = minOrder - total;
            showCustomAlert(
                `⚠️ ยอดสั่งซื้อขั้นต่ำ ${minOrder.toLocaleString()} บาท`,
                `กรุณาเลือกสินค้าเพิ่มอีก ${shortBy.toLocaleString()} บาท\nจึงจะสั่งเดลิเวอรี่ได้ค่ะ`,
                '<i class="fas fa-coins text-yellow-500"></i>'
            );
            setLoading('btnSubmitOrder', false, 'ยืนยันรายการ');
            return;
        }
        // เช็คอีกชั้น: ถ้าร้านปิดรับออเดอร์ระหว่างทาง
        if (_deliverySettings && _deliverySettings.isActive === false) {
            const modal = document.getElementById('storeClosedModal');
            if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
            setLoading('btnSubmitOrder', false, 'ยืนยันรายการ');
            return;
        }
    }
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
        const waitingOrders = (data || []).filter(o => o.status !== 'Served' && o.status !== 'Paid');
        const waitingCount = waitingOrders.length;
        const badge = document.getElementById('kitchenBadge');
        if (waitingCount > 0) { badge.innerText = waitingCount; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
        if (!isCustomerMode) {
            const isKitchenModalOpen = !document.getElementById('kitchenModal').classList.contains('hidden');
            if (lastOrderCount !== -1 && waitingCount > lastOrderCount) { playNotificationSound(); showToast('มีรายการใหม่เข้ามา!', 'warning'); }
        }
        lastOrderCount = waitingCount;
        if (isCustomerMode) {
            // ✅ คำนวณ "ออเดอร์ก่อนหน้าของฉัน" — ดูว่ามีใครสั่งก่อนเราบ้างที่ยังไม่เสร็จ
            const cName = localStorage.getItem('customerName') || 'ลูกค้า'; const cPhone = localStorage.getItem('customerPhone') || '-';
            const savedHouse = localStorage.getItem('customerAddrHouse') || ''; const savedSoi = localStorage.getItem('customerAddrSoi') || '';
            const addressStr = `[ส่งที่: ${savedHouse} ${savedSoi ? 'ซ.' + savedSoi : ''}]`;
            const myIdentity = `${cName} (${cPhone}) ${addressStr}`;

            // หาออเดอร์ที่ active ของลูกค้าคนนี้ (ตัวล่าสุด)
            const myActiveOrders = waitingOrders.filter(o => o.table_no === myIdentity);
            const queueBadge = document.getElementById('queueCountDisplay');

            if (myActiveOrders.length > 0) {
                // มีออเดอร์ของตัวเองที่ยัง active → นับจำนวนคนที่สั่งก่อนเรา
                const myEarliestOrder = myActiveOrders.reduce((a, b) => a.created_at < b.created_at ? a : b);
                const myTime = new Date(myEarliestOrder.created_at).getTime();
                const aheadCount = waitingOrders.filter(o =>
                    o.table_no !== myIdentity &&  // ไม่นับของตัวเอง
                    new Date(o.created_at).getTime() < myTime  // ที่สั่งก่อนฉัน
                ).length;
                if (queueBadge) {
                    queueBadge.innerText = aheadCount;
                    queueBadge.title = aheadCount === 0
                        ? 'ถึงคิวของคุณแล้ว!'
                        : `มี ${aheadCount} ออเดอร์ก่อนหน้าคุณ`;
                }
            } else {
                // ยังไม่มีออเดอร์ → แสดงจำนวนคิวทั้งหมด (ถ้ามาสั่งตอนนี้จะอยู่หลังทุกคน)
                if (queueBadge) {
                    queueBadge.innerText = waitingCount;
                    queueBadge.title = `ตอนนี้มีออเดอร์รออยู่ ${waitingCount} รายการ`;
                }
            }

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
        // ✅ คำนวณช่วงเวลาเดือนนี้ (ครอบคลุมทั้ง "วันนี้" และ "เมื่อวาน" อยู่แล้ว)
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0); // exclusive
        // เผื่อเมื่อวาน = วันที่ 1 ของเดือนที่แล้ว: ขยาย lower bound ไปครอบคลุมเมื่อวานด้วย
        const yestDate = new Date(now.getTime() - 86400000);
        const lowerBound = new Date(Math.min(monthStart.getTime(), new Date(yestDate.getFullYear(), yestDate.getMonth(), yestDate.getDate()).getTime()));

        // ✅ query เฉพาะช่วงเวลาที่ต้องใช้ + ดึงทีละ page เผื่อบิลเยอะเกิน 1000 ในเดือน
        const bills = await fetchBillsInRange(lowerBound.toISOString(), monthEnd.toISOString());

        let today = 0, yesterday = 0, month = 0;
        const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const yestStr  = `${yestDate.getFullYear()}-${String(yestDate.getMonth()+1).padStart(2,'0')}-${String(yestDate.getDate()).padStart(2,'0')}`;
        const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        bills.forEach(b => {
            const localBDate = new Date(b.date);
            const bDateStr = `${localBDate.getFullYear()}-${String(localBDate.getMonth()+1).padStart(2,'0')}-${String(localBDate.getDate()).padStart(2,'0')}`;
            const bMonthStr = `${localBDate.getFullYear()}-${String(localBDate.getMonth()+1).padStart(2,'0')}`;
            const t = parseFloat(b.total || 0);
            if (bDateStr === todayStr) today += t;
            if (bDateStr === yestStr) yesterday += t;
            if (bMonthStr === monthStr) month += t;
        });
        document.getElementById('saleToday').innerText = today.toLocaleString();
        document.getElementById('saleYest').innerText = yesterday.toLocaleString();
        document.getElementById('saleMonth').innerText = month.toLocaleString();
        salesModalTimer = setTimeout(() => { closeModal('salesModal'); }, 5000);
    } catch(e) { console.error('openSalesModal error:', e); }
}

// ✅ ดึงบิลในช่วงเวลาที่กำหนด โดยแบ่ง page เพื่อข้าม limit 1000 ของ Supabase
async function fetchBillsInRange(startISO, endISO) {
    const PAGE_SIZE = 1000;
    let all = [];
    let from = 0;
    while (true) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await _supa.from('bills')
            .select('*')
            .gte('date', startISO)
            .lt('date', endISO)
            .order('date', { ascending: false })
            .range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return all;
}

async function openHistoryModal() {
    document.getElementById('historyModal').classList.remove('hidden');
    const list = document.getElementById('historyList');
    list.innerHTML = '<tr><td colspan="3" class="text-center p-10 text-gray-400"><i class="fas fa-circle-notch fa-spin text-2xl mb-2"></i><br>กำลังโหลดรายการ...</td></tr>';
    try {
        // ✅ ให้ Supabase เรียงและจำกัดจำนวนมาเลย — จะได้บิลล่าสุด 200 รายการจริง
        const { data, error } = await _supa.from('bills')
            .select('*')
            .order('date', { ascending: false })
            .limit(200);
        if (error) throw error;
        historyBills = (data || []).map(rowToBill);
        renderHistoryList();
        const badgeCount = document.querySelector('#historyModal h3 span');
        if (badgeCount) badgeCount.innerText = `ล่าสุด ${historyBills.length} บิล`;
    } catch(e) {
        console.error('openHistoryModal error:', e);
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

// ═══════════════════════════════════════════════════════════
// 🕐 QUEUE STATUS — แสดงว่ารออีกกี่คิวถึงถึงลูกค้า
// ═══════════════════════════════════════════════════════════
async function openQueueStatus() {
    const modal = document.getElementById('queueStatusModal');
    const content = document.getElementById('queueStatusContent');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    content.innerHTML = '<div class="text-center text-gray-400"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>';

    try {
        const { data } = await _supa.from('orders').select('order_id, status, table_no, created_at').neq('status', 'Paid');
        const waitingOrders = (data || []).filter(o => o.status !== 'Served' && o.status !== 'Paid')
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const cName = localStorage.getItem('customerName') || 'ลูกค้า';
        const cPhone = localStorage.getItem('customerPhone') || '-';
        const savedHouse = localStorage.getItem('customerAddrHouse') || '';
        const savedSoi = localStorage.getItem('customerAddrSoi') || '';
        const addressStr = `[ส่งที่: ${savedHouse} ${savedSoi ? 'ซ.' + savedSoi : ''}]`;
        const myIdentity = `${cName} (${cPhone}) ${addressStr}`;

        const myActiveOrders = waitingOrders.filter(o => o.table_no === myIdentity);
        const totalWaiting = waitingOrders.length;

        let html = '';

        if (myActiveOrders.length === 0) {
            // ── ยังไม่มีออเดอร์ของตัวเอง ──
            html = `
                <div class="text-center mb-4">
                    <div class="text-6xl mb-3">🛒</div>
                    <div class="text-xl font-extrabold text-gray-800 mb-1">คุณยังไม่มีออเดอร์</div>
                    <p class="text-sm text-gray-500">สั่งเลยเพื่อให้เราเตรียมของไปส่ง</p>
                </div>
                <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <div class="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">คิวรวมในระบบตอนนี้</div>
                    <div class="text-4xl font-extrabold text-blue-600">${totalWaiting}</div>
                    <div class="text-xs text-gray-500 mt-1">รายการที่กำลังทำอยู่</div>
                </div>
                ${totalWaiting > 0 ? `
                    <p class="text-[11px] text-gray-500 text-center mt-3">
                        <i class="fas fa-info-circle"></i>
                        ถ้าสั่งตอนนี้คุณจะอยู่คิวที่ ${totalWaiting + 1}
                    </p>
                ` : `
                    <p class="text-[11px] text-green-600 text-center mt-3 font-bold">
                        <i class="fas fa-bolt"></i> ร้านว่าง สั่งได้เลย!
                    </p>
                `}
            `;
        } else {
            // ── มีออเดอร์ของตัวเอง — คำนวณคิวก่อนหน้า ──
            const myEarliestOrder = myActiveOrders[0]; // เรียงจากเก่าไปใหม่แล้ว → ตัวแรกคือเก่าสุด
            const myTime = new Date(myEarliestOrder.created_at).getTime();
            const aheadOrders = waitingOrders.filter(o =>
                o.table_no !== myIdentity && new Date(o.created_at).getTime() < myTime
            );
            const aheadCount = aheadOrders.length;
            const myPosition = aheadCount + 1;

            // คำนวณเวลาที่คาดว่าจะถึงคิว (ประมาณ 3 นาที/คิว)
            const estimatedMinutes = aheadCount * 3;

            // สถานะของออเดอร์ตัวเอง
            let statusBadge = '';
            if (myEarliestOrder.status === 'Pending') {
                statusBadge = '<span class="bg-yellow-100 text-yellow-700 text-xs font-bold px-3 py-1 rounded-full border border-yellow-300">⏳ รอยืนยัน</span>';
            } else if (myEarliestOrder.status === 'Accepted' || myEarliestOrder.status === 'Preparing') {
                statusBadge = '<span class="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-300">🍳 กำลังเตรียม</span>';
            } else if (myEarliestOrder.status === 'Ready') {
                statusBadge = '<span class="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full border border-green-300">🛵 กำลังจัดส่ง</span>';
            } else {
                statusBadge = `<span class="bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1 rounded-full border border-gray-300">${myEarliestOrder.status}</span>`;
            }

            if (aheadCount === 0) {
                // ── ถึงคิวแล้ว! ──
                html = `
                    <div class="text-center mb-4">
                        <div class="text-6xl mb-3 animate-bounce">🎉</div>
                        <div class="text-xl font-extrabold text-green-600 mb-1">ถึงคิวของคุณแล้ว!</div>
                        <p class="text-sm text-gray-500">ร้านกำลังเตรียมออเดอร์ของคุณ</p>
                    </div>
                    <div class="bg-green-50 border-2 border-green-300 rounded-xl p-4 text-center">
                        <div class="flex items-center justify-center gap-2 mb-2">${statusBadge}</div>
                        <div class="text-xs text-gray-500 mt-2">ออเดอร์ของคุณ: ${myEarliestOrder.order_id}</div>
                    </div>
                `;
            } else {
                // ── รออยู่ — แสดงจำนวนก่อนหน้า + ตำแหน่ง ──
                html = `
                    <div class="text-center mb-4">
                        <div class="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">ออเดอร์ก่อนหน้าคุณ</div>
                        <div class="text-7xl font-extrabold text-orange-500 leading-none drop-shadow">${aheadCount}</div>
                        <div class="text-xs text-gray-500 mt-1">รายการ</div>
                    </div>

                    <!-- Progress bar -->
                    <div class="bg-gray-100 rounded-full h-3 overflow-hidden mb-2">
                        <div class="bg-gradient-to-r from-orange-400 to-red-500 h-full rounded-full transition-all duration-500"
                             style="width: ${Math.min((1 / myPosition) * 100, 100)}%"></div>
                    </div>
                    <div class="flex justify-between text-[10px] text-gray-500 mb-4">
                        <span>🛒 คุณอยู่คิวที่ ${myPosition}</span>
                        <span>⏱️ ~${estimatedMinutes} นาที</span>
                    </div>

                    <!-- สถานะออเดอร์ -->
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                        <div class="text-[11px] text-blue-600 font-bold uppercase tracking-wider mb-1.5">สถานะออเดอร์ของคุณ</div>
                        <div>${statusBadge}</div>
                        <div class="text-[10px] text-gray-500 mt-2">${myEarliestOrder.order_id}</div>
                    </div>

                    <p class="text-[11px] text-gray-400 text-center mt-3">
                        <i class="fas fa-sync-alt"></i> อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
                    </p>
                `;
            }
        }

        content.innerHTML = html;
    } catch(e) {
        console.error('openQueueStatus err:', e);
        content.innerHTML = `<div class="text-center text-red-500 p-4">
            <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
            <p class="text-sm">โหลดข้อมูลไม่ได้: ${e.message || e}</p>
        </div>`;
    }
}

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

// ✅ filter search input: admin mode = เฉพาะตัวเลข (สำหรับบาร์โค้ด), customer mode = พิมพ์ได้ทุกอย่าง
function handleSearchInputFilter(el) {
    if (!isCustomerMode) {
        el.value = el.value.replace(/[^0-9]/g, '');
    }
    // ในโหมดลูกค้าไม่ filter อะไร → พิมพ์ภาษาไทยได้
}

// ═══════════════════════════════════════════════════════════
// 🛒 CUSTOMER SEARCH — ช่องค้นหาเฉพาะสำหรับลูกค้า
// ═══════════════════════════════════════════════════════════
let _customerSearchTimer = null;
let _customerSubCategory = 'all'; // 'all' | 'drink' | 'snack' | 'dryfood'

// ── Keyword-based sub-category classifier ──
// ดูชื่อสินค้าแล้วเดาหมวดย่อย — ใช้กับสินค้าในหมวด "สินค้าเดลิเวอรี่" เท่านั้น
const SUB_CAT_KEYWORDS = {
    drink: ['น้ำ', 'เครื่องดื่ม', 'โค้ก', 'coke', 'pepsi', 'เป๊ปซี่', 'สไปรท์', 'sprite', 'แฟนต้า', 'fanta',
            'นม', 'milk', 'ชา', 'tea', 'กาแฟ', 'coffee', 'โอเล่', 'เอ็ม150', 'กระทิงแดง', 'redbull',
            'เบียร์', 'beer', 'สุรา', 'ไวน์', 'wine', 'โซดา', 'soda', 'น้ำส้ม', 'น้ำผลไม้', 'juice',
            'สปอนเซอร์', 'เก๊กฮวย', 'น้ำอัดลม', 'น้ำเปล่า', 'น้ำแร่', 'โยเกิร์ต', 'yogurt',
            'ลิโพ', 'โออิชิ', 'เอสเพลส', 'ยาคูลท์', 'นมเปรี้ยว'],
    snack: ['ขนม', 'คุกกี้', 'cookie', 'ช็อกโกแลต', 'chocolate', 'ช็อกโก',
            'เลย์', 'lays', 'ปาปริก้า', 'มันฝรั่ง', 'โปเต้', 'ทาโร่', 'taro',
            'เวเฟอร์', 'wafer', 'บิสกิต', 'ฟันดี', 'ขนมเด็ก', 'ขนมถุง',
            'เยลลี่', 'jelly', 'ลูกอม', 'หมากฝรั่ง', 'แครกเกอร์', 'cracker',
            'ป๊อปคอร์น', 'popcorn', 'แพนด้า', 'โอรีโอ', 'oreo', 'ฟาร์มเฮ้าส์',
            'โดนัท', 'donut', 'พาย', 'เค้ก', 'cake', 'ไอศกรีม', 'ice cream', 'ไอติม',
            'หมึกอบ', 'สาหร่าย', 'ถั่ว', 'ข้าวเกรียบ'],
    dryfood: ['บะหมี่', 'มาม่า', 'noodle', 'ไวไว', 'ยำยำ', 'นิสชิน',
              'ซีอิ๊ว', 'น้ำปลา', 'น้ำตาล', 'เกลือ', 'พริกไทย', 'ผงชูรส',
              'ซอส', 'sauce', 'ซุป', 'soup', 'ปลากระป๋อง', 'ทูน่า', 'tuna',
              'ข้าว', 'rice', 'เส้น', 'แป้ง', 'ผงปรุง', 'พริกแกง', 'กะปิ',
              'เต้าเจี้ยว', 'น้ำมัน', 'oil', 'น้ำมันพืช', 'ถ้วยกระเพรา']
};

function classifyCustomerSubCat(name) {
    const n = String(name || '').toLowerCase();
    for (const [cat, kws] of Object.entries(SUB_CAT_KEYWORDS)) {
        if (kws.some(k => n.includes(k.toLowerCase()))) return cat;
    }
    return 'other';
}

function renderCustomerSubCategoryBar() {
    const bar = document.getElementById('customerSubCategoryBar');
    if (!bar) return;
    const cats = [
        { id: 'all',     label: 'ทั้งหมด',           emoji: '🛵' },
        { id: 'drink',   label: 'เครื่องดื่ม',       emoji: '🥤' },
        { id: 'snack',   label: 'ขนม',              emoji: '🍪' },
        { id: 'dryfood', label: 'อาหารแห้ง/เครื่องปรุง', emoji: '🧂' }
    ];
    bar.innerHTML = cats.map(c => {
        const active = c.id === _customerSubCategory;
        const cls = active
            ? 'bg-white text-blue-600 shadow-md font-bold'
            : 'bg-white/25 text-white hover:bg-white/40 font-medium';
        return `<button onclick="filterCustomerSubCategory('${c.id}')"
                class="${cls} px-4 py-1.5 rounded-full text-xs shrink-0 transition active:scale-95 backdrop-blur-sm border border-white/40 flex items-center gap-1.5">
                <span>${c.emoji}</span><span>${c.label}</span>
            </button>`;
    }).join('');
}

function filterCustomerSubCategory(subCatId) {
    _customerSubCategory = subCatId;
    renderCustomerSubCategoryBar();
    filterMenu('All');
}

function onCustomerSearchInput(value) {
    const clearBtn = document.getElementById('btnClearCustomerSearch');
    if (clearBtn) clearBtn.classList.toggle('hidden', !value);
    const mainInput = document.getElementById('searchInput');
    if (mainInput) mainInput.value = value;
    clearTimeout(_customerSearchTimer);
    _customerSearchTimer = setTimeout(() => filterMenu('All'), 150);
}

function clearCustomerSearch() {
    const el = document.getElementById('customerSearchInput');
    if (el) { el.value = ''; el.focus(); }
    const mainInput = document.getElementById('searchInput');
    if (mainInput) mainInput.value = '';
    document.getElementById('btnClearCustomerSearch')?.classList.add('hidden');
    filterMenu('All');
}

function checkMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode'); const table = urlParams.get('table');
    if (mode === 'customer') {
        isCustomerMode = true; customerTable = table || "ไม่ระบุ";
        // ✅ ใส่ class customer-mode บน body — CSS จะซ่อน .customer-hide อัตโนมัติ
        document.body.classList.add('customer-mode');
        const tableDisplay = document.getElementById('customerTableDisplay'); if(tableDisplay) tableDisplay.innerText = customerTable;
        const tableInput = document.getElementById('tableNo'); if(tableInput) { tableInput.value = customerTable; tableInput.readOnly = true; tableInput.classList.add('bg-gray-100','cursor-not-allowed'); }
        const searchInput = document.getElementById('searchInput'); if(searchInput) {
            searchInput.placeholder = "🔍 ค้นหาสินค้าที่ต้องการ...";
            searchInput.setAttribute('inputmode','text');
        }
        const searchIcon = document.getElementById('topSearchIcon'); if(searchIcon) searchIcon.className = 'fas fa-search text-blue-500';

        // ✅ Render แถบหมวดย่อยสำหรับลูกค้า
        renderCustomerSubCategoryBar();

        // ✅ เช็คสถานะเดลิเวอรี่ — ถ้าร้านปิดรับ จะแสดง modal แจ้งเตือน
        setTimeout(() => checkDeliveryStatus(), 500);
    } else {
        isCustomerMode = false;
        document.body.classList.remove('customer-mode');
        const searchInput = document.getElementById('searchInput'); if(searchInput) { searchInput.placeholder = "ยิงบาร์โค้ด..."; searchInput.setAttribute('inputmode','none'); }
        const searchIcon = document.getElementById('topSearchIcon'); if(searchIcon) searchIcon.className = 'fas fa-barcode text-gray-400';
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
    loadDeliverySettingsToForm();
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
        // ✅ ใช้ pagination เผื่อช่วงที่เลือกมีบิลเกิน 1000
        const filtered = await fetchBillsInRange(start+'T00:00:00', end+'T23:59:59.999');
        filtered.sort((a,b) => new Date(a.date) - new Date(b.date));
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

// เก็บ chart instances ไว้เพื่อ destroy ก่อนสร้างใหม่ (ป้องกัน memory leak)
let myTop3PieChart = null;

async function openDashboardModal() {
    closeModal('exportModal');
    document.getElementById('dashboardModal').classList.remove('hidden');
    document.getElementById('dashLoading').classList.remove('hidden');
    document.getElementById('dashContent').classList.add('hidden');

    try {
        const now = new Date();
        const profitInput = document.getElementById('dashProfitInput');
        const profitMarginVal = profitInput ? parseFloat(profitInput.value)||12.5 : 12.5;
        const profitPercent = profitMarginVal / 100;
        const label1 = document.getElementById('dashProfitLabel1');
        const label2 = document.getElementById('dashProfitLabel2');
        if(label1) label1.innerText = profitMarginVal;
        if(label2) label2.innerText = profitMarginVal;

        // ── ช่วงเวลาที่สนใจ ──
        // เดือนนี้
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
        // เดือนที่แล้ว
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        // 7 วันย้อนหลัง
        const sevenDaysAgo = new Date(now.getTime() - 6 * 86400000);
        sevenDaysAgo.setHours(0,0,0,0);

        // ── ขอบเขตต่ำสุดของ query บิลรายละเอียด (บิลเดือนนี้ + เดือนที่แล้ว + 7 วัน) ──
        const detailLower = new Date(Math.min(lastMonthStart.getTime(), sevenDaysAgo.getTime()));
        const detailUpper = thisMonthEnd;

        // ── Query 1: ดึงบิลช่วงเดือนที่แล้วถึงเดือนนี้ (ใช้สำหรับสรุปวัน/เดือน/Top items/peak hours) ──
        const history = await fetchBillsInRange(detailLower.toISOString(), detailUpper.toISOString());

        // ── Query 2 (parallel): ดึงยอดรวมรายเดือนสำหรับกราฟปีนี้ (ม.ค. ถึงเดือนปัจจุบัน) ──
        // เพื่อประหยัด bandwidth: ดึงเฉพาะคอลัมน์ date, total
        const yearlyMonthlyDataPromise = fetchYearlyMonthlyTotals(now.getFullYear());

        // ── helpers ──
        const setEl = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
        const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const todayStr = fmtDate(now);
        const yesterday = new Date(now.getTime() - 86400000);
        const yesterdayStr = fmtDate(yesterday);
        const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        const lastMonthStr = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth()+1).padStart(2,'0')}`;
        const thaiMonthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

        // ── (1) วันนี้ / เมื่อวาน / เดือนนี้ / เดือนที่แล้ว ──
        let todaySales=0, todayProfit=0, todayBillsCount=0;
        let yesterdaySales=0;
        let thisMonthSales=0, thisMonthProfit=0;
        let lastMonthSales=0, lastMonthProfit=0;
        const thisMonthBills = [];
        const lastMonthBills = [];

        (history||[]).forEach(b => {
            if (!b.date) return;
            const localDate = new Date(b.date);
            const bDateStr  = fmtDate(localDate);
            const bMonthStr = `${localDate.getFullYear()}-${String(localDate.getMonth()+1).padStart(2,'0')}`;
            const t = parseFloat(b.total||0);
            const p = t * profitPercent;
            if (bDateStr === todayStr)     { todaySales += t; todayProfit += p; todayBillsCount++; }
            if (bDateStr === yesterdayStr) { yesterdaySales += t; }
            if (bMonthStr === thisMonthStr) { thisMonthSales += t; thisMonthProfit += p; thisMonthBills.push(b); }
            if (bMonthStr === lastMonthStr) { lastMonthSales += t; lastMonthProfit += p; lastMonthBills.push(b); }
        });

        setEl('dashTodaySales',  todaySales.toLocaleString());
        setEl('dashTodayProfit', Math.round(todayProfit).toLocaleString());
        setEl('dashTodayBills',  todayBillsCount.toLocaleString());
        setEl('dashYestSales',   yesterdaySales.toLocaleString());
        setEl('dashMonthSales',  thisMonthSales.toLocaleString());
        setEl('dashMonthProfit', Math.round(thisMonthProfit).toLocaleString());
        setEl('dashLastMonthSales',  lastMonthSales.toLocaleString());
        setEl('dashLastMonthProfit', Math.round(lastMonthProfit).toLocaleString());
        setEl('lastMonthNameLabel', `${thaiMonthNames[lastMonthStart.getMonth()]} ${lastMonthStart.getFullYear()+543}`);
        setEl('thisMonthNameLabel', `${thaiMonthNames[now.getMonth()]} ${now.getFullYear()+543}`);

        // ── (2) กราฟ 7 วันย้อนหลัง ──
        const labels7=[], salesData7=[], profitData7=[];
        for (let i=6; i>=0; i--) {
            const d = new Date(now.getTime() - i*86400000);
            const ds = fmtDate(d);
            labels7.push(d.toLocaleDateString('th-TH',{weekday:'short'}));
            const daySales = (history||[]).filter(b=>b.date && fmtDate(new Date(b.date))===ds)
                                          .reduce((s,b)=>s+parseFloat(b.total||0),0);
            salesData7.push(daySales);
            profitData7.push(Math.round(daySales*profitPercent));
        }
        const avgArr7 = salesData7.filter(x=>x>0);
        setEl('avg7Days','เฉลี่ย: '+(avgArr7.length>0 ? Math.round(avgArr7.reduce((a,b)=>a+b,0)/avgArr7.length).toLocaleString() : 0)+' ฿/วัน');
        if (mySales7DaysChart) mySales7DaysChart.destroy();
        const ctx7 = document.getElementById('sales7DaysChart');
        if (ctx7) {
            mySales7DaysChart = new Chart(ctx7, {
                type:'bar',
                data:{ labels:labels7, datasets:[
                    { label:'ยอดขาย', data:salesData7, backgroundColor:'rgba(59,130,246,0.7)' },
                    { label:'กำไรประมาณ', data:profitData7, backgroundColor:'rgba(16,185,129,0.5)' }
                ]},
                options:{ responsive:true, maintainAspectRatio:false }
            });
        }

        // ── (3) กราฟปีนี้ (ตั้งแต่ ม.ค.) ──
        const yearlyData = await yearlyMonthlyDataPromise; // [{month:1, total:xxx}, ...]
        const monthsPassed = now.getMonth() + 1; // 1..12
        const labelsY = [], salesDataY = [], profitDataY = [];
        for (let m = 1; m <= monthsPassed; m++) {
            labelsY.push(thaiMonthNames[m-1]);
            const found = yearlyData.find(x => x.month === m);
            const total = found ? found.total : 0;
            salesDataY.push(total);
            profitDataY.push(Math.round(total * profitPercent));
        }
        const avgM = salesDataY.filter(x=>x>0);
        setEl('avgMonthly', 'เฉลี่ย: '+(avgM.length>0 ? Math.round(avgM.reduce((a,b)=>a+b,0)/avgM.length).toLocaleString() : 0)+' ฿/เดือน');
        if (mySalesChart) mySalesChart.destroy();
        const ctxY = document.getElementById('salesChart');
        if (ctxY) {
            mySalesChart = new Chart(ctxY, {
                type:'bar',
                data:{ labels:labelsY, datasets:[
                    { label:'ยอดขาย', data:salesDataY, backgroundColor:'rgba(99,102,241,0.7)' },
                    { label:'กำไรประมาณ', data:profitDataY, backgroundColor:'rgba(16,185,129,0.5)' }
                ]},
                options:{ responsive:true, maintainAspectRatio:false }
            });
        }

        // ── (4) 5 สินค้าทำเงินสูงสุด (เดือนนี้) — Pie ──
        const top5 = aggregateTopItems(thisMonthBills, 5);
        if (myTop5PieChart) myTop5PieChart.destroy();
        const ctxTop5 = document.getElementById('top5PieChart');
        if (ctxTop5) {
            if (top5.length === 0) {
                // แสดงข้อความแทนกราฟถ้าไม่มีข้อมูล
                const container = document.getElementById('dashTopItems_container');
                if (container) container.innerHTML = '<p class="text-center text-gray-400 pt-10">ยังไม่มีข้อมูลเดือนนี้</p>';
            } else {
                myTop5PieChart = new Chart(ctxTop5, {
                    type:'doughnut',
                    data:{
                        labels: top5.map(x => x.name),
                        datasets:[{
                            data: top5.map(x => x.revenue),
                            backgroundColor:['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6']
                        }]
                    },
                    options:{
                        responsive:true, maintainAspectRatio:false,
                        plugins:{
                            legend:{ position:'right', labels:{ font:{ size:11 }, boxWidth:12 } },
                            tooltip:{ callbacks:{ label:(ctx)=>`${ctx.label}: ${Math.round(ctx.parsed).toLocaleString()} ฿` } }
                        }
                    }
                });
            }
        }

        // ── (5) Top 3 สินค้าขายดีเดือนที่แล้ว — Pie เล็ก ──
        const top3Last = aggregateTopItems(lastMonthBills, 3);
        if (myTop3PieChart) myTop3PieChart.destroy();
        const ctxTop3 = document.getElementById('top3PieChart');
        if (ctxTop3) {
            const container = document.getElementById('dashLastMonthTopItems_container');
            if (top3Last.length === 0) {
                if (container) {
                    container.innerHTML = '<p class="text-[10px] sm:text-xs font-bold text-indigo-400 mb-2">สินค้าขายดี (Top 3)</p><p class="text-center text-gray-400 text-xs pt-4">ไม่มีข้อมูลเดือนที่ผ่านมา</p>';
                }
            } else {
                myTop3PieChart = new Chart(ctxTop3, {
                    type:'doughnut',
                    data:{
                        labels: top3Last.map(x => x.name),
                        datasets:[{
                            data: top3Last.map(x => x.revenue),
                            backgroundColor:['#6366f1','#22c55e','#f97316']
                        }]
                    },
                    options:{
                        responsive:true, maintainAspectRatio:false,
                        plugins:{
                            legend:{ position:'right', labels:{ font:{ size:10 }, boxWidth:10 } },
                            tooltip:{ callbacks:{ label:(ctx)=>`${ctx.label}: ${Math.round(ctx.parsed).toLocaleString()} ฿` } }
                        }
                    }
                });
            }
        }

        // ── (6) ช่วงเวลาลูกค้าเยอะสุด Top 3 (เดือนที่แล้ว) ──
        const lastMonthPeakHours = aggregatePeakHours(lastMonthBills, 3);
        const peakBoxLast = document.getElementById('dashLastMonthPeak');
        if (peakBoxLast) {
            if (lastMonthPeakHours.length === 0) {
                peakBoxLast.innerHTML = '<p class="text-xs text-gray-400">ไม่มีข้อมูล</p>';
            } else {
                const maxCount = lastMonthPeakHours[0].count;
                peakBoxLast.innerHTML = lastMonthPeakHours.map((h, i) => {
                    const pct = Math.round((h.count / maxCount) * 100);
                    const medal = i===0 ? '🥇' : i===1 ? '🥈' : '🥉';
                    return `<div class="flex items-center gap-2 text-xs">
                        <span class="w-5">${medal}</span>
                        <span class="font-bold text-indigo-700 w-14">${h.label}</span>
                        <div class="flex-1 bg-indigo-100 rounded-full h-2 overflow-hidden">
                            <div class="bg-indigo-500 h-2 rounded-full" style="width:${pct}%"></div>
                        </div>
                        <span class="text-indigo-600 font-bold w-10 text-right">${h.count} บิล</span>
                    </div>`;
                }).join('');
            }
        }

        // ── (7) ช่วงเวลาลูกค้าเยอะสุด (วิเคราะห์ตามวัน จ.-อา. จากข้อมูลเดือนนี้+เดือนที่แล้ว) ──
        const allRecentBills = [...thisMonthBills, ...lastMonthBills];
        const peakByDay = aggregatePeakByDayOfWeek(allRecentBills);
        const peakBox = document.getElementById('dashPeakHours');
        if (peakBox) {
            if (peakByDay.every(d => d.count === 0)) {
                peakBox.innerHTML = '<p class="text-sm text-gray-400">ยังไม่มีข้อมูลเพียงพอสำหรับวิเคราะห์</p>';
            } else {
                const maxCount = Math.max(...peakByDay.map(d => d.count));
                peakBox.innerHTML = peakByDay.map(d => {
                    const pct = maxCount > 0 ? Math.round((d.count / maxCount) * 100) : 0;
                    return `<div class="flex items-center gap-2 text-sm">
                        <span class="font-bold text-gray-700 w-12">${d.dayName}</span>
                        <div class="flex-1 bg-blue-100 rounded-full h-3 overflow-hidden">
                            <div class="bg-gradient-to-r from-blue-400 to-blue-600 h-3 rounded-full transition-all" style="width:${pct}%"></div>
                        </div>
                        <span class="text-blue-600 font-bold w-20 text-right text-xs">${d.count.toLocaleString()} บิล</span>
                    </div>`;
                }).join('');
            }
        }

        document.getElementById('dashLoading').classList.add('hidden');
        document.getElementById('dashContent').classList.remove('hidden');
    } catch(e) {
        console.error('Dashboard error:', e);
        document.getElementById('dashLoading').classList.add('hidden');
        showCustomAlert('Error','โหลด Dashboard ไม่สำเร็จ: '+(e.message||e));
    }
}

// ── Helper: ดึงยอดรวมรายเดือนของปีที่กำหนด (ใช้หลาย query parallel เพื่อให้เร็ว) ──
async function fetchYearlyMonthlyTotals(year) {
    const currentMonth = new Date().getMonth() + 1; // 1..12
    const promises = [];
    for (let m = 1; m <= currentMonth; m++) {
        const start = new Date(year, m-1, 1, 0, 0, 0).toISOString();
        const end   = new Date(year, m, 1, 0, 0, 0).toISOString();
        promises.push(fetchMonthTotal(start, end).then(total => ({ month: m, total })));
    }
    return await Promise.all(promises);
}

// ── Helper: ดึงเฉพาะคอลัมน์ total ในช่วงเวลา แล้วคำนวณผลรวม (paginate) ──
async function fetchMonthTotal(startISO, endISO) {
    const PAGE_SIZE = 1000;
    let sum = 0;
    let from = 0;
    while (true) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await _supa.from('bills')
            .select('total')
            .gte('date', startISO)
            .lt('date', endISO)
            .range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach(r => { sum += parseFloat(r.total||0); });
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return sum;
}

// ── Helper: รวมสินค้าขายดีจากรายการบิล ──
function aggregateTopItems(bills, topN) {
    const agg = {};
    bills.forEach(b => {
        const items = Array.isArray(b.items) ? b.items : [];
        items.forEach(it => {
            const name = it.name || 'ไม่ระบุ';
            const qty = parseFloat(it.qty||0);
            const price = parseFloat(it.price||0);
            if (!agg[name]) agg[name] = { name, qty: 0, revenue: 0 };
            agg[name].qty     += qty;
            agg[name].revenue += qty * price;
        });
    });
    return Object.values(agg).sort((a,b) => b.revenue - a.revenue).slice(0, topN);
}

// ── Helper: รวม Top 3 ช่วงเวลาที่ลูกค้าเยอะสุด (กลุ่มละ 2 ชั่วโมง) ──
function aggregatePeakHours(bills, topN) {
    const slots = {}; // '08:00-10:00' -> count
    bills.forEach(b => {
        if (!b.date) return;
        const d = new Date(b.date);
        const h = d.getHours();
        const slotStart = Math.floor(h / 2) * 2;
        const slotEnd = slotStart + 2;
        const label = `${String(slotStart).padStart(2,'0')}-${String(slotEnd).padStart(2,'0')}น.`;
        slots[label] = (slots[label] || 0) + 1;
    });
    return Object.entries(slots)
        .map(([label, count]) => ({ label, count }))
        .sort((a,b) => b.count - a.count)
        .slice(0, topN);
}

// ── Helper: รวมจำนวนบิลรายวันในสัปดาห์ (จ.-อา.) ──
function aggregatePeakByDayOfWeek(bills) {
    // getDay(): 0=Sun, 1=Mon, ..., 6=Sat → map ให้เรียง จ.-อา.
    const dayNames = ['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'];
    const jsIndexToMonFirst = { 1:0, 2:1, 3:2, 4:3, 5:4, 6:5, 0:6 };
    const counts = [0,0,0,0,0,0,0];
    bills.forEach(b => {
        if (!b.date) return;
        const d = new Date(b.date);
        const idx = jsIndexToMonFirst[d.getDay()];
        counts[idx]++;
    });
    return dayNames.map((name, i) => ({ dayName: name, count: counts[i] }));
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
    // ✅ โหลด delivery settings ล่วงหน้า (ให้ _deliverySettings cache พร้อมใช้)
    getDeliverySettings();
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
        // ════════════════════════════════════════════════════════════
        // เก็บข้อมูลที่แสดงอยู่ในหน้า dashboard (ไม่ clone DOM — ดึงค่าตรงๆ)
        // ════════════════════════════════════════════════════════════
        const getText = (id) => (document.getElementById(id)?.innerText || '0').trim();
        const getCanvasDataUrl = (id) => {
            const c = document.getElementById(id);
            if (!c || !c.toDataURL) return '';
            try { return c.toDataURL('image/png', 1.0); } catch(e) { console.warn('canvas err', id, e); return ''; }
        };

        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });
        const timeStr = now.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });

        // ยอดขายต่างๆ
        const todaySales  = getText('dashTodaySales');
        const todayProfit = getText('dashTodayProfit');
        const todayBills  = getText('dashTodayBills');
        const yestSales   = getText('dashYestSales');
        const monthSales  = getText('dashMonthSales');
        const monthProfit = getText('dashMonthProfit');
        const lastMonthSales  = getText('dashLastMonthSales');
        const lastMonthProfit = getText('dashLastMonthProfit');
        const lastMonthName   = getText('lastMonthNameLabel');
        const thisMonthName   = getText('thisMonthNameLabel');
        const avg7Days        = getText('avg7Days');
        const avgMonthly      = getText('avgMonthly');
        const profitPercent   = (document.getElementById('dashProfitInput')?.value) || '12.5';

        // กราฟ
        const chart7Days    = getCanvasDataUrl('sales7DaysChart');
        const chartYearly   = getCanvasDataUrl('salesChart');
        const chartTop5     = getCanvasDataUrl('top5PieChart');
        const chartTop3Last = getCanvasDataUrl('top3PieChart');

        // HTML ของ peak hours (เอาจริงๆ มาใส่ก็ได้ แต่ปลอดภัยที่จะ inline style ใหม่เอง)
        const peakLastHTML = document.getElementById('dashLastMonthPeak')?.innerHTML || '';
        const peakWeekHTML = document.getElementById('dashPeakHours')?.innerHTML || '';

        // ════════════════════════════════════════════════════════════
        // สร้าง HTML Wrapper แบบ inline style ทั้งหมด (ไม่พึ่ง Tailwind)
        // ════════════════════════════════════════════════════════════
        const wrapper = document.createElement('div');
        // ⭐️ สำคัญ: ต้องอยู่ในหน้าจอจริง (ไม่ใช่ off-screen) ไม่งั้น html2canvas render ไม่ได้
        // วิธีซ่อนที่ปลอดภัย: top:0, left:0, opacity:0 + pointerEvents:none (เก็บไว้ใน DOM, มองไม่เห็น, ไม่ขวางคลิก)
        wrapper.style.cssText = `
            position:fixed; top:0; left:0; width:1000px;
            background:#ffffff; padding:30px; box-sizing:border-box;
            font-family: Kanit, Sarabun, Arial, sans-serif; color:#111827;
            opacity:0; pointer-events:none; z-index:-1;
        `;

        const pill = (label, value, unit, colorText) => `
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;text-align:left;flex:1;min-width:0;">
                <div style="font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${label}</div>
                <div style="font-size:22px;font-weight:800;color:${colorText};line-height:1.1;">${value} <span style="font-size:12px;color:#9ca3af;font-weight:500;">${unit||''}</span></div>
            </div>
        `;

        const chartBlock = (title, imgData, extra) => `
            <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:14px;page-break-inside:avoid;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">
                    <div style="font-size:14px;font-weight:700;color:#1f2937;">${title}</div>
                    ${extra ? `<div style="font-size:11px;color:#2563eb;background:#eff6ff;padding:4px 10px;border-radius:6px;font-weight:700;">${extra}</div>` : ''}
                </div>
                ${imgData
                    ? `<img src="${imgData}" style="width:100%;height:auto;display:block;" />`
                    : `<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">ไม่มีข้อมูล</div>`
                }
            </div>
        `;

        wrapper.innerHTML = `
            <!-- Header -->
            <div style="border-bottom:3px solid #2563eb;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;">
                <div>
                    <div style="font-size:11px;color:#6b7280;font-weight:600;letter-spacing:3px;">ANALYTICS DASHBOARD REPORT</div>
                    <div style="font-size:24px;font-weight:800;color:#1e3a8a;margin-top:4px;">ร้านเจ้พินขายของชำ</div>
                </div>
                <div style="text-align:right;font-size:11px;color:#6b7280;line-height:1.5;">
                    <div style="font-weight:700;color:#111827;">วันที่ออกรายงาน</div>
                    <div>${dateStr}</div>
                    <div>เวลา ${timeStr} น.</div>
                </div>
            </div>

            <!-- สรุปวันนี้ -->
            <div style="background:linear-gradient(135deg,#dbeafe 0%,#e0e7ff 100%);border-radius:12px;padding:16px;margin-bottom:14px;border:1px solid #c7d2fe;">
                <div style="font-size:12px;font-weight:700;color:#3730a3;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">📅 สรุปวันนี้</div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    ${pill('ยอดขายวันนี้', todaySales, '฿', '#1d4ed8')}
                    ${pill(`กำไร ${profitPercent}% (วันนี้)`, todayProfit, '฿', '#059669')}
                    ${pill('จำนวนบิล', todayBills, 'บิล', '#374151')}
                    ${pill('ยอดขายเมื่อวาน', yestSales, '฿', '#6b7280')}
                </div>
            </div>

            <!-- สรุปเดือนนี้ + เดือนที่แล้ว -->
            <div style="display:flex;gap:12px;margin-bottom:14px;">
                <div style="flex:1;background:#ecfdf5;border-radius:12px;padding:16px;border:1px solid #a7f3d0;">
                    <div style="font-size:12px;font-weight:700;color:#065f46;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">🗓️ ${thisMonthName}</div>
                    <div style="display:flex;gap:10px;">
                        ${pill('ยอดขายทั้งเดือน', monthSales, '฿', '#047857')}
                        ${pill(`กำไร ${profitPercent}%`, monthProfit, '฿', '#059669')}
                    </div>
                </div>
                <div style="flex:1;background:#eff6ff;border-radius:12px;padding:16px;border:1px solid #bfdbfe;">
                    <div style="font-size:12px;font-weight:700;color:#1e40af;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">⏱️ ${lastMonthName}</div>
                    <div style="display:flex;gap:10px;">
                        ${pill('ยอดขายเดือนที่แล้ว', lastMonthSales, '฿', '#1d4ed8')}
                        ${pill(`กำไร ${profitPercent}%`, lastMonthProfit, '฿', '#059669')}
                    </div>
                </div>
            </div>

            <!-- กราฟ 7 วัน -->
            ${chartBlock('กราฟยอดขายและกำไร (ย้อนหลัง 7 วัน)', chart7Days, avg7Days)}

            <!-- กราฟปีนี้ -->
            ${chartBlock('กราฟยอดขายและกำไร ปีนี้ (ตั้งแต่ ม.ค.)', chartYearly, avgMonthly)}

            <!-- 2 คอลัมน์: Top 5 สินค้า + ช่วงเวลาลูกค้าเยอะ -->
            <div style="display:flex;gap:12px;margin-bottom:14px;page-break-inside:avoid;">
                <div style="flex:1;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                    <div style="font-size:14px;font-weight:700;color:#1f2937;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">🏆 5 สินค้าทำเงินสูงสุด (${thisMonthName})</div>
                    ${chartTop5
                        ? `<img src="${chartTop5}" style="width:100%;height:auto;display:block;" />`
                        : `<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">ไม่มีข้อมูล</div>`
                    }
                </div>
                <div style="flex:1;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                    <div style="font-size:14px;font-weight:700;color:#1f2937;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">🕐 ช่วงเวลาลูกค้าเยอะสุด (จ.–อา.)</div>
                    <div id="__pdfPeakWeek">${peakWeekHTML || '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px;">ไม่มีข้อมูล</div>'}</div>
                </div>
            </div>

            <!-- Top 3 สินค้าเดือนที่แล้ว + ช่วงเวลา Top3 เดือนที่แล้ว -->
            <div style="display:flex;gap:12px;margin-bottom:14px;page-break-inside:avoid;">
                <div style="flex:1;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                    <div style="font-size:14px;font-weight:700;color:#1f2937;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">🥇 สินค้าขายดี Top 3 (${lastMonthName})</div>
                    ${chartTop3Last
                        ? `<img src="${chartTop3Last}" style="width:100%;height:auto;display:block;max-width:220px;margin:0 auto;" />`
                        : `<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">ไม่มีข้อมูล</div>`
                    }
                </div>
                <div style="flex:1;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                    <div style="font-size:14px;font-weight:700;color:#1f2937;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">⏰ ช่วงเวลาลูกค้าเยอะ Top 3 (${lastMonthName})</div>
                    <div id="__pdfPeakLast">${peakLastHTML || '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px;">ไม่มีข้อมูล</div>'}</div>
                </div>
            </div>

            <!-- Footer -->
            <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#9ca3af;">
                รายงานนี้สร้างอัตโนมัติจากระบบ POS • ${dateStr} ${timeStr} น.
            </div>
        `;

        document.body.appendChild(wrapper);

        // รอให้ browser render และ img dataURL โหลดเสร็จ
        await new Promise(r => setTimeout(r, 250));

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `Dashboard_Report_${now.toISOString().split('T')[0]}.pdf`,
            image:        { type: 'jpeg', quality: 0.95 },
            html2canvas:  {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: 1000,
                windowWidth: 1000
            },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };

        try {
            await html2pdf().set(opt).from(wrapper).save();
            showToast('Export PDF สำเร็จ', 'success');
        } finally {
            if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        }
    } catch(e) {
        console.error('exportDashboardPDF error:', e);
        showCustomAlert('ผิดพลาด', 'Export ไม่สำเร็จ: ' + (e.message || e));
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