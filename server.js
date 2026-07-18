const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const wsUrl = 'wss://novoga.sb21.net/?token=32-5a4ff6e0fb3f0d90ddf1e9c438c3cb59';

// Cấu hình CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

// Biến lưu trữ dữ liệu
let md5_truoc = "2b1a04d22c93046984e5e4598a51c010";
let ket_qua = "0-0 (Chưa có kết quả)";
let md5_hien_tai = "844cf26a6065a786c99061c890425239";
let doi_nha = "Bayern Munchen";
let doi_khach = "Napoli";
let doi_nha_van_truoc = "Juventus (Piemonte Calcio)";
let doi_khach_van_truoc = "Tottenham";

// THÊM MỚI: Biến lưu phiên từ WebSocket
let phien_hien_tai = {
  id: null,
  md5_truoc: null,
  ket_qua: null,
  md5_hien_tai: null,
  doi_nha: null,
  doi_khach: null,
  doi_nha_van_truoc: null,
  doi_khach_van_truoc: null,
  thoi_gian: null,
  raw_data: null // Lưu dữ liệu gốc từ WebSocket
};

let lich_su_phien = [];
let ws = null;
let reconnectTimeout = null;
let reconnectAttempts = 0;

// Hàm giải mã kết quả
function decodeMatchResult(encodedResult) {
  try {
    let decoded;
    try {
      decoded = decodeURIComponent(encodedResult);
    } catch {
      decoded = encodedResult.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
        return String.fromCharCode(parseInt(grp, 16));
      });
    }
    
    const match = decoded.match(/_{\d+,\d+}_/);
    if (match) {
      const scores = match[0].replace(/[{}_]/g, '').split(',');
      const homeScore = parseInt(scores[0]);
      const awayScore = parseInt(scores[1]);
      
      if (homeScore === 1 && awayScore === 0) return "1-0 (Đội nhà thắng)";
      if (homeScore === 0 && awayScore === 1) return "0-1 (Đội khách thắng)";
      if (homeScore === awayScore) return `${homeScore}-${awayScore} (Hòa)`;
      return `${homeScore}-${awayScore}`;
    }
    return "Không xác định";
  } catch {
    return "Lỗi giải mã";
  }
}

// Hàm xử lý unicode
function decodeUnicode(str) {
  return str.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
    return String.fromCharCode(parseInt(grp, 16));
  });
}

// THÊM MỚI: Hàm cập nhật phiên từ dữ liệu WebSocket
function capNhatPhien(data) {
  // Lấy dữ liệu phiên từ WebSocket
  // Giả sử data có cấu trúc chứa thông tin phiên
  // Bạn cần điều chỉnh dựa trên cấu trúc thực tế của WebSocket
  
  const phienMoi = {
    id: data.id || data.session_id || data.match_id || Date.now(),
    md5_truoc: data.md5_truoc || md5_truoc,
    ket_qua: data.ket_qua || ket_qua,
    md5_hien_tai: data.md5_hien_tai || md5_hien_tai,
    doi_nha: data.doi_nha || doi_nha,
    doi_khach: data.doi_khach || doi_khach,
    doi_nha_van_truoc: data.doi_nha_van_truoc || doi_nha_van_truoc,
    doi_khach_van_truoc: data.doi_khach_van_truoc || doi_khach_van_truoc,
    thoi_gian: data.thoi_gian || new Date().toISOString(),
    raw_data: data // Lưu dữ liệu gốc
  };
  
  // Lưu phiên cũ vào lịch sử nếu có thay đổi
  if (phien_hien_tai.id !== phienMoi.id) {
    if (phien_hien_tai.id !== null) {
      lich_su_phien.push(phien_hienha_tai);
    }
    phien_hien_tai = phienMoi;
    console.log(`📝 Phiên mới từ WebSocket #${phienMoi.id}: ${phienMoi.doi_n} vs ${phienMoi.doi_khach}`);
  } else {
    // Cập nhật phiên hiện tại
    phien_hien_tai = { ...phien_hien_tai, ...phienMoi };
  }
}

// Kết nối WebSocket
function connect() {
  if (reconnectAttempts > 0) {
    console.error(`🔄 Reconnecting (attempt ${reconnectAttempts})...`);
  }
  
  if (ws) {
    ws.removeAllListeners();
    try { ws.close(); } catch {}
  }
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  ws = new WebSocket(wsUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    perMessageDeflate: false
  });
  
  ws.on('open', () => {
    console.log("✅ Kết nối thành công tới phòng máy Socket!");
    reconnectAttempts = 0;
  });
  
  ws.on('message', (data) => {
    try {
      const json = JSON.parse(data.toString());
      
      console.log("📥 Dữ liệu nhận từ WebSocket:", JSON.stringify(json, null, 2));
      
      if (json.t === "current" && json.d) {
        const decoded = decodeUnicode(json.d);
        const parsed = JSON.parse(decoded);
        
        if (parsed[0]?.[2]?.[0]) {
          const m = parsed[0][2][0];
          
          // Lấy thông tin phiên từ WebSocket
          // Cấu trúc này cần điều chỉnh theo dữ liệu thực tế
          const phienData = {
            id: m[0] || m.id || parsed[0]?.id || Date.now(),
            md5_truoc: m[29] || md5_truoc,
            ket_qua: m[30] ? decodeMatchResult(m[30]) : ket_qua,
            md5_hien_tai: m[29] || md5_hien_tai,
            doi_nha: m[2] || doi_nha,
            doi_khach: m[3] || doi_khach,
            doi_nha_van_truoc: doi_nha_van_truoc,
            doi_khach_van_truoc: doi_khach_van_truoc,
            thoi_gian: new Date().toISOString()
          };
          
          // Cập nhật phiên từ dữ liệu WebSocket
          capNhatPhien(phienData);
          
          // Cập nhật các biến chính
          if (m[29]) md5_hien_tai = m[29];
          if (m[2]) doi_nha = m[2];
          if (m[3]) doi_khach = m[3];
          
          if (m[30]) {
            ket_qua = decodeMatchResult(m[30]);
          }
          
          console.log("📌 PHIÊN HIỆN TẠI:");
          console.log(JSON.stringify(phien_hien_tai, null, 2));
        }
      }
      
      // THÊM MỚI: Xử lý các loại message khác có chứa thông tin phiên
      if (json.t === "session" || json.t === "match" || json.t === "update") {
        // Điều chỉnh theo cấu trúc thực tế
        const phienData = {
          id: json.id || json.session_id || json.match_id || Date.now(),
          md5_truoc: json.md5_truoc || md5_truoc,
          ket_qua: json.ket_qua || ket_qua,
          md5_hien_tai: json.md5_hien_tai || md5_hien_tai,
          doi_nha: json.doi_nha || json.home_team || doi_nha,
          doi_khach: json.doi_khach || json.away_team || doi_khach,
          doi_nha_van_truoc: json.doi_nha_van_truoc || doi_nha_van_truoc,
          doi_khach_van_truoc: json.doi_khach_van_truoc || doi_khach_van_truoc,
          thoi_gian: json.thoi_gian || new Date().toISOString(),
          raw_data: json
        };
        
        capNhatPhien(phienData);
      }
      
    } catch (e) {
      console.error("❌ Lỗi xử lý message:", e.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error("❌ WebSocket error:", error.message);
    reconnectAttempts++;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connect, 3000);
  });
  
  ws.on('close', () => {
    console.log("❌ WebSocket disconnected");
    reconnectAttempts++;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connect, 3000);
  });
}

// API Endpoint
app.get('/api/volta/sun', (req, res) => {
  res.json({
    phien_hien_tai: phien_hien_tai,
    md5_truoc: md5_truoc,
    ket_qua: ket_qua,
    md5_hien_tai: md5_hien_tai,
    doi_nha: doi_nha,
    doi_khach: doi_khach,
    doi_nha_van_truoc: doi_nha_van_truoc,
    doi_khach_van_truoc: doi_khach_van_truoc
  });
});

// API lấy lịch sử phiên
app.get('/api/volta/sessions', (req, res) => {
  res.json({
    current_session: phien_hien_tai,
    history: lich_su_phien,
    total_sessions: lich_su_phien.length + 1
  });
});

// API lấy dữ liệu gốc từ WebSocket
app.get('/api/volta/raw', (req, res) => {
  res.json({
    phien_hien_tai: phien_hien_tai,
    lich_su: lich_su_phien,
    ws_status: ws ? (ws.readyState === 1 ? 'connected' : 'disconnected') : 'not_initialized'
  });
});

// Trang quản trị
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Volta Sun API - HOANGDZ</title>
        <meta http-equiv="refresh" content="5">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; background: #0f172a; color: #e2e8f0; }
          .card { border: 1px solid rgba(255,255,255,0.1); padding: 20px; margin: 10px 0; border-radius: 12px; background: #1e293b; }
          .connected { background: #065f46; border-color: #34d399; }
          .disconnected { background: #991b1b; border-color: #f87171; }
          code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #fbbf24; font-family: monospace; }
          .phien { background: #1e1b4b; border-color: #818cf8; }
          .highlight { color: #fbbf24; font-weight: bold; }
          .raw-data { background: #0f172a; padding: 10px; border-radius: 8px; font-size: 12px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>🌞 Hệ thống Dữ liệu API - Admin @tranhoang2286</h1>
        
        <div class="card ${ws && ws.readyState === 1 ? 'connected' : 'disconnected'}">
          <h3>🔌 Trạng thái Socket</h3>
          <p>${ws ? (ws.readyState === 1 ? '✅ ĐANG KẾT NỐI' : '❌ MẤT KẾT NỐI') : '❌ CHƯA KHỞI TẠO'}</p>
          <p>Thử kết nối: ${reconnectAttempts}</p>
        </div>
        
        <div class="card phien">
          <h3>🎯 Phiên hiện tại #${phien_hien_tai.id || 'Chưa có'}</h3>
          <p>Kết quả: <strong style="color: #4ade80;">${phien_hien_tai.ket_qua || 'Chưa có'}</strong></p>
          <p>MD5 Trận cũ: <code>${phien_hien_tai.md5_truoc || 'N/A'}</code></p>
          <p>MD5 Trận hiện tại: <code>${phien_hien_tai.md5_hien_tai || 'N/A'}</code></p>
          <p>Kèo: <strong style="color: #60a5fa;">${phien_hien_tai.doi_nha || '?'} vs ${phien_hien_tai.doi_khach || '?'}</strong></p>
          <p>🕐 Thời gian: <span class="highlight">${phien_hien_tai.thoi_gian || 'Chưa có'}</span></p>
          <p>Số phiên: ${lich_su_phien.length + 1}</p>
        </div>
        
        <div class="card">
          <h3>📡 Đường dẫn API</h3>
          <ul>
            <li><a href="/api/volta/sun" target="_blank" style="color: #38bdf8;">/api/volta/sun</a> - Dữ liệu hiện tại</li>
            <li><a href="/api/volta/sessions" target="_blank" style="color: #38bdf8;">/api/volta/sessions</a> - Lịch sử phiên</li>
            <li><a href="/api/volta/raw" target="_blank" style="color: #38bdf8;">/api/volta/raw</a> - Dữ liệu gốc</li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  const status = ws && ws.readyState === 1 ? 'healthy' : 'unhealthy';
  res.json({
    status: status,
    websocket: ws ? (ws.readyState === 1 ? 'open' : 'closed') : 'not_initialized',
    current_session: phien_hien_tai.id || null,
    total_sessions: lich_su_phien.length + 1,
    last_result: ket_qua,
    current_match: `${doi_nha} vs ${doi_khach}`
  });
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại port ${PORT}`);
  console.log(`📡 WebSocket URL: ${wsUrl}`);
  connect();
});

process.on('SIGINT', () => {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) try { ws.close(); } catch {}
  process.exit();
});
