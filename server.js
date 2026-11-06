// Pure Node.js 22 Server (Zero external dependencies needed!)
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./db');
const lineService = require('./lineService');

// Simple .env parser that reloads on demand
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // --- API ROUTES ---

  // 1. GET /api/settings
  if (pathname === '/api/settings' && method === 'GET') {
    loadEnv();
    const settings = db.getSettings();
    return sendJson(res, 200, {
      success: true,
      data: {
        ...settings,
        liffId: settings.liffId || process.env.LINE_LIFF_ID || '2012400848-86Z8gVyN'
      }
    });
  }

  // 2. GET /api/user/:identifier
  if (pathname.startsWith('/api/user/') && method === 'GET' && !pathname.includes('transactions')) {
    const identifier = pathname.replace('/api/user/', '');
    const user = db.getUserById(identifier);
    if (!user) {
      return sendJson(res, 404, { success: false, message: 'ไม่พบข้อมูลสมาชิก' });
    }
    const transactions = db.getTransactionsByUser(user.id);
    return sendJson(res, 200, {
      success: true,
      data: { user, transactions }
    });
  }

  // 3. POST /api/user/sync-liff
  if (pathname === '/api/user/sync-liff' && method === 'POST') {
    const body = await parseBody(req);
    const { lineUserId, displayName, pictureUrl, phone } = body;
    if (!lineUserId) {
      return sendJson(res, 400, { success: false, message: 'ต้องการ lineUserId' });
    }
    const user = db.findOrCreateUser({ lineUserId, displayName, pictureUrl, phone });
    const transactions = db.getTransactionsByUser(user.id);
    return sendJson(res, 200, {
      success: true,
      data: { user, transactions }
    });
  }

  // 4. POST /api/cashier/add-points (1 บาท = 1 แต้ม)
  if (pathname === '/api/cashier/add-points' && method === 'POST') {
    const body = await parseBody(req);
    const { userId, amount, description } = body;

    if (!userId) {
      return sendJson(res, 400, { success: false, message: 'กรุณาระบุรหัสสมาชิก เบอร์โทร หรือ QR' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return sendJson(res, 400, { success: false, message: 'ยอดซื้อต้องเป็นตัวเลขมากกว่า 0' });
    }

    try {
      const result = db.addPoints({
        userId,
        amount: numericAmount,
        description
      });

      const settings = db.getSettings();
      lineService.sendEarnNotification({
        lineUserId: result.user.lineUserId,
        pointsEarned: result.pointsEarned,
        amount: numericAmount,
        balanceAfter: result.user.points,
        shopName: settings.shopName
      }).catch(err => console.error('Push notification error:', err));

      return sendJson(res, 200, {
        success: true,
        message: `เพิ่มสำเร็จ! ยอดซื้อ ฿${numericAmount.toLocaleString()} ได้รับ +${result.pointsEarned} แต้ม`,
        data: result
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, message: err.message });
    }
  }

  // 5. GET /api/rewards
  if (pathname === '/api/rewards' && method === 'GET') {
    const rewards = db.getRewards();
    return sendJson(res, 200, { success: true, data: rewards });
  }

  // 6. POST /api/rewards/redeem
  if (pathname === '/api/rewards/redeem' && method === 'POST') {
    const body = await parseBody(req);
    const { userId, rewardId } = body;
    if (!userId || !rewardId) {
      return sendJson(res, 400, { success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }

    try {
      const result = db.redeemReward({ userId, rewardId });
      lineService.sendRedeemNotification({
        lineUserId: result.user.lineUserId,
        rewardTitle: result.reward.title,
        pointsUsed: result.reward.pointsRequired,
        balanceAfter: result.user.points
      }).catch(err => console.error('Push notification error:', err));

      return sendJson(res, 200, {
        success: true,
        message: `แลกของรางวัล "${result.reward.title}" สำเร็จ!`,
        data: result
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, message: err.message });
    }
  }

  // 6.1 POST /api/admin/rewards (เพิ่มของรางวัลใหม่)
  if (pathname === '/api/admin/rewards' && method === 'POST') {
    const body = await parseBody(req);
    try {
      const newReward = db.addReward(body);
      return sendJson(res, 200, {
        success: true,
        message: 'เพิ่มของรางวัลสำเร็จ',
        data: newReward
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, message: err.message });
    }
  }

  // 6.2 PUT /api/admin/rewards/:id (แก้ไขของรางวัล)
  if (pathname.startsWith('/api/admin/rewards/') && (method === 'PUT' || method === 'POST')) {
    const rewardId = pathname.replace('/api/admin/rewards/', '').trim();
    const body = await parseBody(req);
    try {
      const updated = db.updateReward(rewardId, body);
      return sendJson(res, 200, {
        success: true,
        message: 'บันทึกการแก้ไขของรางวัลสำเร็จ',
        data: updated
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, message: err.message });
    }
  }

  // 6.3 DELETE /api/admin/rewards/:id (ลบของรางวัล)
  if (pathname.startsWith('/api/admin/rewards/') && method === 'DELETE') {
    const rewardId = pathname.replace('/api/admin/rewards/', '').trim();
    try {
      const deleted = db.deleteReward(rewardId);
      return sendJson(res, 200, {
        success: true,
        message: 'ลบของรางวัลสำเร็จ',
        data: deleted
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, message: err.message });
    }
  }

  // 7. GET /api/admin/members
  if (pathname === '/api/admin/members' && method === 'GET') {
    const users = db.getUsers();
    return sendJson(res, 200, { success: true, data: users });
  }

  // 7.1 DELETE /api/admin/members/:id (ลบสมาชิกที่ไม่ได้ใช้งานแล้ว)
  if (pathname.startsWith('/api/admin/members/') && method === 'DELETE') {
    const memberId = pathname.replace('/api/admin/members/', '').trim();
    try {
      const deleted = db.deleteUser(memberId);
      return sendJson(res, 200, {
        success: true,
        message: `ลบสมาชิก ${deleted.displayName} (${deleted.id}) ออกจากระบบสำเร็จ`,
        data: deleted
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, message: err.message });
    }
  }

  // 8. GET /api/admin/transactions
  if (pathname === '/api/admin/transactions' && method === 'GET') {
    const txns = db.getAllTransactions();
    return sendJson(res, 200, { success: true, data: txns });
  }

  // --- STATIC FILES ---
  if (serveStatic(req, res, pathname)) {
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 LINE Loyalty Points System (ระบบสะสมแต้ม 1:1)`);
  console.log(`🌐 Server running at: http://127.0.0.1:${PORT}`);
  console.log(`📱 หน้ารวมเมนูทดสอบ : http://127.0.0.1:${PORT}`);
  console.log(`💳 หน้าบัตรสมาชิก LIFF : http://127.0.0.1:${PORT}/liff/`);
  console.log(`💼 หน้าจอแคชเชียร์/ร้านค้า : http://127.0.0.1:${PORT}/cashier/`);
  console.log(`===============================================`);
});
