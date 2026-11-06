const fs = require('fs');
const path = require('path');

const LOCAL_DB_DIR = path.join(__dirname, 'data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'db.json');

// Upstash Redis Cloud Database (สำหรับแก้ปัญหาแต้มหายบน Vercel)
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

// Initial schema
const defaultData = {
  users: [],
  transactions: [],
  rewards: [
    {
      id: 'REW-1',
      title: 'ส่วนลด 50 บาท',
      pointsRequired: 100,
      description: 'ใช้เป็นส่วนลดสำหรับยอดซื้อขั้นต่ำ 200 บาท',
      imageUrl: '',
      stock: 50
    },
    {
      id: 'REW-2',
      title: 'เครื่องดื่มฟรี 1 แก้ว',
      pointsRequired: 200,
      description: 'เลือกรับเครื่องดื่มเมนูใดก็ได้ 1 แก้วทันที',
      imageUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&fit=crop',
      stock: 30
    },
    {
      id: 'REW-3',
      title: 'กระเป๋าผ้า Exclusive Limited',
      pointsRequired: 500,
      description: 'กระเป๋าผ้ารักษ์โลกสกรีนโลโก้พรีเมียม',
      imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&fit=crop',
      stock: 15
    }
  ],
  settings: {
    pointsPerBaht: 1, // 1 บาท = 1 แต้ม
    minSpendForPoints: 1,
    shopName: 'น้ำพริกแม่เฉลา',
    liffId: '2012420035-F8twisdh',
    tiers: [
      { name: 'Member', minSpend: 0 },
      { name: 'Silver', minSpend: 1000 },
      { name: 'Gold', minSpend: 5000 },
      { name: 'Platinum', minSpend: 15000 }
    ]
  }
};

let resolvedDbFile = null;

function getDbFile() {
  if (resolvedDbFile) return resolvedDbFile;

  const isServerless = Boolean(
    process.env.VERCEL || 
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    (process.cwd() && process.cwd().startsWith('/var/task')) ||
    (__dirname && __dirname.startsWith('/var/task'))
  );

  if (isServerless) {
    const tmpFile = path.join('/tmp', 'db.json');
    if (!fs.existsSync(tmpFile)) {
      if (fs.existsSync(LOCAL_DB_FILE)) {
        try {
          fs.copyFileSync(LOCAL_DB_FILE, tmpFile);
        } catch (e) {
          fs.writeFileSync(tmpFile, JSON.stringify(defaultData, null, 2), 'utf-8');
        }
      } else {
        fs.writeFileSync(tmpFile, JSON.stringify(defaultData, null, 2), 'utf-8');
      }
    }
    resolvedDbFile = tmpFile;
    return resolvedDbFile;
  }

  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOCAL_DB_FILE)) {
      fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
    resolvedDbFile = LOCAL_DB_FILE;
  } catch (err) {
    const tmpFile = path.join('/tmp', 'db.json');
    if (!fs.existsSync(tmpFile)) {
      fs.writeFileSync(tmpFile, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
    resolvedDbFile = tmpFile;
  }

  return resolvedDbFile;
}

// ยิงคำสั่งไปที่ Cloud Database (Upstash Redis REST)
async function queryUpstash(commandArray) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commandArray),
    cache: 'no-store'
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upstash error (${res.status}): ${errText}`);
  }
  const json = await res.json();
  return json.result;
}

async function readDb() {
  // 1. ถ้ามีการตั้งค่า Cloud Database (Upstash) ให้ดึงจาก Cloud ส่วนกลาง
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const raw = await queryUpstash(['GET', 'point_db']);
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
      // ถ้ายังไม่มีข้อมูลใน Cloud ให้เริ่มต้นด้วย defaultData
      await queryUpstash(['SET', 'point_db', JSON.stringify(defaultData)]);
      return defaultData;
    } catch (err) {
      console.error('[DATABASE] Upstash read failed, falling back to local:', err.message);
    }
  }

  // 2. ถ้าไม่ได้ตั้งค่า Cloud ให้ใช้ไฟล์เครื่อง /tmp (สำหรับทดสอบในเครื่อง)
  const file = getDbFile();
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json:', err);
    if (fs.existsSync(LOCAL_DB_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf-8'));
      } catch (e) {}
    }
    return defaultData;
  }
}

async function writeDb(data) {
  // บันทึกลง local file เสมอเพื่อเป็น backup
  try {
    const file = getDbFile();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    if (err.code === 'EROFS' || (err.message && err.message.includes('read-only'))) {
      try {
        const tmpFile = path.join('/tmp', 'db.json');
        resolvedDbFile = tmpFile;
        fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      } catch (e) {}
    }
  }

  // บันทึกลง Cloud Database (Upstash) เพื่อให้ข้อมูลคงอยู่ถาวร และแชร์กันทุกเครื่อง
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      await queryUpstash(['SET', 'point_db', JSON.stringify(data)]);
    } catch (err) {
      console.error('[DATABASE] Upstash write failed:', err.message);
    }
  }
}

// Database helper operations
const db = {
  async getSettings() {
    const data = await readDb();
    return data.settings;
  },

  async updateSettings(newSettings) {
    const data = await readDb();
    data.settings = { ...data.settings, ...newSettings };
    await writeDb(data);
    return data.settings;
  },

  async getUsers() {
    const data = await readDb();
    return data.users;
  },

  async getUserById(idOrLineUserIdOrPhone) {
    const data = await readDb();
    return data.users.find(
      u => u.id === idOrLineUserIdOrPhone ||
           u.lineUserId === idOrLineUserIdOrPhone ||
           (u.phone && u.phone === idOrLineUserIdOrPhone)
    );
  },

  async findOrCreateUser({ lineUserId, displayName, pictureUrl, phone }) {
    const data = await readDb();
    let user = data.users.find(u => (lineUserId && u.lineUserId === lineUserId) || (phone && u.phone === phone));

    if (user) {
      let changed = false;
      if (displayName && user.displayName !== displayName) {
        user.displayName = displayName;
        changed = true;
      }
      if (pictureUrl && user.pictureUrl !== pictureUrl) {
        user.pictureUrl = pictureUrl;
        changed = true;
      }
      if (phone && !user.phone) {
        user.phone = phone;
        changed = true;
      }
      if (changed) await writeDb(data);
      return user;
    }

    // Create new user
    const memberNumber = String(data.users.length + 1).padStart(4, '0');
    user = {
      id: `MEM-${memberNumber}`,
      lineUserId: lineUserId || `USER-${Date.now()}`,
      displayName: displayName || `ลูกค้าสมาชิก #${memberNumber}`,
      pictureUrl: pictureUrl || '',
      phone: phone || '',
      points: 0,
      totalSpent: 0,
      tier: 'Member',
      createdAt: new Date().toISOString()
    };
    data.users.push(user);
    await writeDb(data);
    return user;
  },

  calculateTier(totalSpent, tiers) {
    const sorted = [...tiers].sort((a, b) => b.minSpend - a.minSpend);
    for (const t of sorted) {
      if (totalSpent >= t.minSpend) {
        return t.name;
      }
    }
    return 'Member';
  },

  async addPoints({ userId, amount, description = 'ซื้อสินค้า' }) {
    const data = await readDb();
    const userIndex = data.users.findIndex(
      u => u.id === userId || u.lineUserId === userId || u.phone === userId
    );

    if (userIndex === -1) {
      throw new Error('ไม่พบข้อมูลสมาชิก');
    }

    const user = data.users[userIndex];
    const settings = data.settings;
    
    // 1 บาท = 1 แต้ม (หรือตาม setting)
    const pointsEarned = Math.floor(amount * (settings.pointsPerBaht || 1));
    if (pointsEarned <= 0) {
      throw new Error('ยอดซื้อต้องมากกว่า 0');
    }

    user.points = (user.points || 0) + pointsEarned;
    user.totalSpent = (user.totalSpent || 0) + amount;
    user.tier = this.calculateTier(user.totalSpent, settings.tiers);

    const txnId = `TXN-${Date.now()}`;
    const transaction = {
      id: txnId,
      userId: user.id,
      type: 'EARN',
      amount: Number(amount),
      points: pointsEarned,
      balanceAfter: user.points,
      description: description || `ซื้อสินค้า ฿${Number(amount).toLocaleString()}`,
      createdAt: new Date().toISOString()
    };

    data.transactions.unshift(transaction);
    await writeDb(data);

    return { user, transaction, pointsEarned };
  },

  async redeemReward({ userId, rewardId }) {
    const data = await readDb();
    const userIndex = data.users.findIndex(
      u => u.id === userId || u.lineUserId === userId
    );

    if (userIndex === -1) {
      throw new Error('ไม่พบข้อมูลสมาชิก');
    }

    const reward = data.rewards.find(r => r.id === rewardId);
    if (!reward) {
      throw new Error('ไม่พบของรางวัลนี้');
    }

    const user = data.users[userIndex];
    if (user.points < reward.pointsRequired) {
      throw new Error(`แต้มสะสมไม่เพียงพอ (ต้องการ ${reward.pointsRequired} แต้ม แต่คุณมี ${user.points} แต้ม)`);
    }

    if (reward.stock <= 0) {
      throw new Error('ของรางวัลนี้หมดแล้ว');
    }

    user.points -= reward.pointsRequired;
    reward.stock -= 1;

    const txnId = `TXN-RED-${Date.now()}`;
    const transaction = {
      id: txnId,
      userId: user.id,
      type: 'REDEEM',
      amount: 0,
      points: -reward.pointsRequired,
      balanceAfter: user.points,
      description: `แลกของรางวัล: ${reward.title}`,
      createdAt: new Date().toISOString()
    };

    data.transactions.unshift(transaction);
    await writeDb(data);

    return { user, transaction, reward };
  },

  async getTransactionsByUser(userId) {
    const data = await readDb();
    return data.transactions.filter(t => t.userId === userId);
  },

  async getAllTransactions(limit = 50) {
    const data = await readDb();
    return data.transactions.slice(0, limit);
  },

  async getRewards() {
    const data = await readDb();
    return data.rewards;
  },

  async addReward({ title, pointsRequired, description, imageUrl, stock }) {
    const data = await readDb();
    const id = `REW-${Date.now()}`;
    const newReward = {
      id,
      title: title || 'ของรางวัลใหม่',
      pointsRequired: Number(pointsRequired) || 10,
      description: description || '',
      imageUrl: imageUrl || '',
      stock: Number(stock) || 10
    };
    data.rewards.push(newReward);
    await writeDb(data);
    return newReward;
  },

  async updateReward(id, updatedFields) {
    const data = await readDb();
    const idx = data.rewards.findIndex(r => r.id === id);
    if (idx === -1) {
      throw new Error('ไม่พบของรางวัลที่ต้องการแก้ไข');
    }
    data.rewards[idx] = {
      ...data.rewards[idx],
      ...updatedFields,
      pointsRequired: Number(updatedFields.pointsRequired ?? data.rewards[idx].pointsRequired),
      stock: Number(updatedFields.stock ?? data.rewards[idx].stock)
    };
    await writeDb(data);
    return data.rewards[idx];
  },

  async deleteReward(id) {
    const data = await readDb();
    const idx = data.rewards.findIndex(r => r.id === id);
    if (idx === -1) {
      throw new Error('ไม่พบของรางวัลที่ต้องการลบ');
    }
    const deleted = data.rewards.splice(idx, 1)[0];
    await writeDb(data);
    return deleted;
  },

  async deleteUser(id) {
    const data = await readDb();
    const idx = data.users.findIndex(u => u.id === id || u.lineUserId === id);
    if (idx === -1) {
      throw new Error('ไม่พบข้อมูลสมาชิกที่ต้องการลบ');
    }
    const deletedUser = data.users.splice(idx, 1)[0];
    data.transactions = (data.transactions || []).filter(t => t.userId !== deletedUser.id);
    await writeDb(data);
    return deletedUser;
  }
};

module.exports = db;
