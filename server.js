const WebSocket = require('ws');
const express = require('express');
const cors = require('cors'); // ĐÃ THÊM: Thư viện mở cổng kết nối

const app = express();
const PORT = process.env.PORT || 3000;
const wsUrl = 'wss://novoga.sb21.net/?token=32-5a4ff6e0fb3f0d90ddf1e9c438c3cb59';

// ĐÃ THÊM: Cấu hình CORS để mở cổng cho phép Tool HTML kết nối trực tiếp không bị chặn
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

// Biến lưu trữ dữ liệu (Khởi tạo giá trị mặc định để tránh trả về null làm sập frontend)
let md5_truoc = "2b1a04d22c93046984e5e4598a51c010";
let ket_qua = "0-0 (Chưa có kết quả)";
let md5_hien_tai = "844cf26a6065a786c99061c890425239";
let doi_nha = "Bayern Munchen";
let doi_khach = "Napoli";
let doi_nha_van_truoc = "Juventus (Piemonte Calcio)";
let doi_khach_van_truoc = "Tottenham";

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
      // Bóc tách tỷ số thực tế từ chuỗi regex _ {homeScore, awayScore} _
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
      
      if (json.t === "current" && json.d) {
        const decoded = decodeUnicode(json.d);
        const parsed = JSON.parse(decoded);
        
        if (parsed[0]?.[2]?.[0]) {
          const m = parsed[0][2][0];
          
          // FIX CHÍ MẠNG: Đẩy việc cập nhật trận đấu cũ lên trước khi gán trận đấu mới
          if (m[29] && m[29] !== md5_hien_tai) {
              doi_nha_van_truoc = doi_nha;
              doi_khach_van_truoc = doi_khach;
              md5_truoc = md5_hien_tai;
          }

          // Cập nhật thông tin trận đấu hiện tại liên tục
          if (m[29]) md5_hien_tai = m[29];
          if (m[2]) doi_nha = m[2];
          if (m[3]) doi_khach = m[3];
          
          // Xử lý khi có trường kết quả bàn thắng
          if (m[30]) {
            ket_qua = decodeMatchResult(m[30]);
            
            // In LOG kiểm tra dòng chảy dữ liệu chuẩn JSON
            console.log("📌 DỮ LIỆU ĐỒNG BỘ MỚI:");
            console.log(JSON.stringify({
              md5_truoc, ket_qua, md5_hien_tai, doi_nha, doi_khach, doi_nha_van_truoc, doi_khach_van_truoc
            }, null, 2));
          }
        }
      }
    } catch (e) {
      // Bỏ qua lỗi cú pháp bản tin rác
    }
  });
  
  ws.on('error', () => {
    reconnectAttempts++;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connect, 3000);
  });
  
  ws.on('close', () => {
    reconnectAttempts++;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connect, 3000);
  });
}

// API Endpoint - ĐÃ FIX: Đảm bảo dữ liệu luôn có cấu trúc, không bị null sạch bách khi mới khởi động
app.get('/api/volta/sun', (req, res) => {
  res.json({
    md5_truoc: md5_truoc,
    ket_qua: ket_qua,
    md5_hien_tai: md5_hien_tai,
    doi_nha: doi_nha,
    doi_khach: doi_khach,
    doi_nha_van_truoc: doi_nha_van_truoc,
    doi_khach_van_truoc: doi_khach_van_truoc
  });
});

// Trang quản trị giao diện trực quan
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
        </style>
      </head>
      <body>
        <h1>🌞 Hệ thống Dữ liệu API - Admin @tranhoang2286</h1>
        
        <div class="card ${ws && ws.readyState === 1 ? 'connected' : 'disconnected'}">
          <h3>🔌 Trạng thái Socket kết nối phòng máy</h3>
          <p>${ws ? (ws.readyState === 1 ? '✅ ĐANG KẾT NỐI (ONLINE)' : '❌ MẤT KẾT NỐI') : '❌ CHƯA KHỞI TẠO'}</p>
          <p>Số lần thử cấp cứu lại: ${reconnectAttempts}</p>
        </div>
        
        <div class="card">
          <h3>🎯 Log Dữ Liệu Trận Đấu Mới Nhất</h3>
          <p>Kết quả ván trước: <strong style="color: #4ade80;">${ket_qua}</strong></p>
          <p>MD5 Trận cũ: <code>${md5_truoc}</code></p>
          <p>MD5 Trận hiện tại: <code>${md5_hien_tai}</code></p>
          <p>Kèo hiện tại: <strong style="color: #60a5fa;">${doi_nha} vs ${doi_khach}</strong></p>
          <p>Kèo ván trước: <strong>${doi_nha_van_truoc} vs ${doi_khach_van_truoc}</strong></p>
        </div>
        
        <h3>📡 Đường dẫn API cho Tool Giao diện</h3>
        <ul>
          <li><a href="/api/volta/sun" target="_blank" style="color: #38bdf8;">/api/volta/sun</a> (Cổng JSON chính đã mở CORS)</li>
        </ul>
      </body>
    </html>
  `);
});

// Tuyến đường kiểm tra sức khỏe hệ thống Render
app.get('/health', (req, res) => {
  const status = ws && ws.readyState === 1 ? 'healthy' : 'unhealthy';
  res.json({
    status: status,
    websocket: ws ? (ws.readyState === 1 ? 'open' : 'closed') : 'not_initialized',
    last_result: ket_qua,
    current_match: `${doi_nha} vs ${doi_khach}`
  });
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy ngon lành tại port ${PORT}`);
  connect();
});

process.on('SIGINT', () => {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) try { ws.close(); } catch {}
  process.exit();
});
