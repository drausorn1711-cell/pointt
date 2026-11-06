const fs = require('fs');
const path = require('path');

const LOCAL_DB_DIR = path.join(__dirname, 'data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'db.json');

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
      imageUrl: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=400&fit=crop',
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

  // ตรวจจับ Vercel / AWS Lambda Serverless read-only environment
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

  // เครื่อง Local ปกติ (Windows / Linux)
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

function readDb() {
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

function writeDb(data) {
  let file = getDbFile();
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    // ถ้าเจอ EROFS (Read-only บน Vercel) ให้สลับไปใช้ /tmp ทันที
    if (err.code === 'EROFS' || (err.message && err.message.includes('read-only'))) {
      const tmpFile = path.join('/tmp', 'db.json');
      resolvedDbFile = tmpFile;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    } else {
      throw err;
    }
  }
}

// Database helper operations
const db = {
  getSettings() {
    return readDb().settings;
  },

  updateSettings(newSettings) {
    const data = readDb();
    data.settings = { ...data.settings, ...newSettings };
    writeDb(data);
    return data.settings;
  },

  getUsers() {
    return readDb().users;
  },

  getUserById(idOrLineUserIdOrPhone) {
    const users = readDb().users;
    return users.find(
      u => u.id === idOrLineUserIdOrPhone ||
           u.lineUserId === idOrLineUserIdOrPhone ||
           (u.phone && u.phone === idOrLineUserIdOrPhone)
    );
  },

  findOrCreateUser({ lineUserId, displayName, pictureUrl, phone }) {
    const data = readDb();
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
      if (changed) writeDb(data);
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
    writeDb(data);
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

  addPoints({ userId, amount, description = 'ซื้อสินค้า' }) {
    const data = readDb();
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
    writeDb(data);

    return { user, transaction, pointsEarned };
  },

  redeemReward({ userId, rewardId }) {
    const data = readDb();
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
    writeDb(data);

    return { user, transaction, reward };
  },

  getTransactionsByUser(userId) {
    const data = readDb();
    return data.transactions.filter(t => t.userId === userId);
  },

  getAllTransactions(limit = 50) {
    const data = readDb();
    return data.transactions.slice(0, limit);
  },

  getRewards() {
    return readDb().rewards;
  },

  addReward({ title, pointsRequired, description, imageUrl, stock }) {
    const data = readDb();
    const id = `REW-${Date.now()}`;
    const newReward = {
      id,
      title: title || 'ของรางวัลใหม่',
      pointsRequired: Number(pointsRequired) || 10,
      description: description || '',
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&fit=crop',
      stock: Number(stock) || 10
    };
    data.rewards.push(newReward);
    writeDb(data);
    return newReward;
  },

  updateReward(id, updatedFields) {
    const data = readDb();
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
    writeDb(data);
    return data.rewards[idx];
  },

  deleteReward(id) {
    const data = readDb();
    const idx = data.rewards.findIndex(r => r.id === id);
    if (idx === -1) {
      throw new Error('ไม่พบของรางวัลที่ต้องการลบ');
    }
    const deleted = data.rewards.splice(idx, 1)[0];
    writeDb(data);
    return deleted;
  },

  deleteUser(id) {
    const data = readDb();
    const idx = data.users.findIndex(u => u.id === id || u.lineUserId === id);
    if (idx === -1) {
      throw new Error('ไม่พบข้อมูลสมาชิกที่ต้องการลบ');
    }
    const deletedUser = data.users.splice(idx, 1)[0];
    // ลบประวัติทำรายการของสมาชิกคนนี้ด้วย เพื่อความสะอาดของข้อมูล
    data.transactions = (data.transactions || []).filter(t => t.userId !== deletedUser.id);
    writeDb(data);
    return deletedUser;
  }
};

module.exports = db;
