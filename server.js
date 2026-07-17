const WebSocket = require('ws');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const wsUrl = 'wss://novoga.sb21.net/?token=32-5a4ff6e0fb3f0d90ddf1e9c438c3cb59';

// Biến lưu trữ
let md5_truoc = null;
let ket_qua = null;
let md5_hien_tai = null;
let doi_nha = null;
let doi_khach = null;
let doi_nha_van_truoc = null;
let doi_khach_van_truoc = null;

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
    
    const match = decoded.match(/_{(\d+),(\d+)}_/);
    if (match) {
      const homeScore = parseInt(match[1]);
      const awayScore = parseInt(match[2]);
      
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
          const currentMd5 = m[29];
          const currentHomeTeam = m[2];
          const currentAwayTeam = m[3];
          
          // LUÔN cập nhật md5_hien_tai (trận đấu hiện tại)
          md5_hien_tai = currentMd5;
          doi_nha = currentHomeTeam;
          doi_khach = currentAwayTeam;
          
          // Xử lý khi có field 30 (KẾT QUẢ)
          if (m[30]) {
            // Nếu có kết quả mới
            doi_nha_van_truoc = doi_nha;
            doi_khach_van_truoc = doi_khach;
            
            md5_truoc = md5_hien_tai; // MD5 của kết quả này
            ket_qua = decodeMatchResult(m[30]);
            
            // IN JSON KẾT QUẢ (chỉ data)
            console.log(JSON.stringify({
              md5_truoc: md5_truoc,
              ket_qua: ket_qua,
              md5_hien_tai: md5_hien_tai,
              doi_nha: doi_nha,
              doi_khach: doi_khach,
              doi_nha_van_truoc: doi_nha_van_truoc,
              doi_khach_van_truoc: doi_khach_van_truoc
            }));
          }
        }
      }
    } catch (e) {
      // Bỏ qua lỗi
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

// API Endpoint - CHỈ TRẢ VỀ DATA
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

// Trang chủ
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Volta Sun API</title>
        <meta http-equiv="refresh" content="10">
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .card { border: 1px solid #ddd; padding: 20px; margin: 10px 0; border-radius: 5px; }
          .connected { background: #d4edda; }
          .disconnected { background: #f8d7da; }
        </style>
      </head>
      <body>
        <h1>🌞 Volta Sun API</h1>
        
        <div class="card ${ws && ws.readyState === 1 ? 'connected' : 'disconnected'}">
          <h3>🔌 WebSocket Status</h3>
          <p>${ws ? (ws.readyState === 1 ? '✅ Connected' : '❌ Disconnected') : '❌ Disconnected'}</p>
          <p>Reconnect attempts: ${reconnectAttempts}</p>
        </div>
        
        <div class="card">
          <h3>🎯 Last Result</h3>
          <p>Result: <strong>${ket_qua || 'No result yet'}</strong></p>
          <p>Previous MD5: <code>${md5_truoc || 'None'}</code></p>
          <p>Current MD5: <code>${md5_hien_tai || 'None'}</code></p>
          <p>Current match: <strong>${doi_nha || '-'} vs ${doi_khach || '-'}</strong></p>
          <p>Previous match: <strong>${doi_nha_van_truoc || '-'} vs ${doi_khach_van_truoc || '-'}</strong></p>
        </div>
        
        <h3>📡 Endpoints</h3>
        <ul>
          <li><a href="/api/volta/sun" target="_blank">/api/volta/sun</a> - JSON API</li>
          <li><a href="/api/volta/sun" target="_blank" download="volta_result.json">Download JSON</a></li>
        </ul>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  const status = ws && ws.readyState === 1 ? 'healthy' : 'unhealthy';
  res.json({
    status: status,
    websocket: ws ? (ws.readyState === 1 ? 'open' : 'closed') : 'not_initialized',
    last_result: ket_qua ? ket_qua : 'no_result_yet',
    current_match: `${doi_nha || 'none'} vs ${doi_khach || 'none'}`
  });
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 API: http://localhost:${PORT}/api/volta/sun`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log('\n📋 Waiting for match results...\n');
  
  connect();
});

// Xử lý tắt ứng dụng
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) try { ws.close(); } catch {}
  process.exit();
});
