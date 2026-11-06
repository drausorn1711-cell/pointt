/**
 * LINE Messaging API Service (Pure Node.js 22 native fetch - no dependencies required)
 */

function getEnvConfig() {
  return {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    liffId: process.env.LINE_LIFF_ID || ''
  };
}

/**
 * ส่ง Flex Message แจ้งแต้มที่ได้รับเมื่อซื้อสินค้า
 */
async function sendEarnNotification({ lineUserId, pointsEarned, amount, balanceAfter, shopName = 'ร้านค้าของเรา' }) {
  const config = getEnvConfig();

  if (!config.channelAccessToken) {
    console.warn(`[LINE NOTIFICATION] ยังไม่ได้ใส่ LINE_CHANNEL_ACCESS_TOKEN ใน .env (ข้ามการส่งไปยัง ${lineUserId})`);
    return { success: false, reason: 'NO_TOKEN' };
  }

  if (!lineUserId) {
    return { success: false, reason: 'NO_USER_ID' };
  }

  const liffUrl = config.liffId ? `https://liff.line.me/${config.liffId}` : '#';

  const flexMessage = {
    type: 'flex',
    altText: `คุณได้รับ ${pointsEarned.toLocaleString()} แต้มจากการซื้อสินค้า ฿${Number(amount).toLocaleString()}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#7A0C1E',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: shopName,
            color: '#FFFFFF',
            size: 'sm',
            weight: 'bold'
          },
          {
            type: 'text',
            text: '🎉 คุณได้รับแต้มสะสมใหม่!',
            color: '#FFFFFF',
            size: 'xl',
            weight: 'bold',
            margin: 'sm'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            alignItems: 'center',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: `+${pointsEarned.toLocaleString()}`,
                size: '4xl',
                weight: 'bold',
                color: '#7A0C1E'
              },
              {
                type: 'text',
                text: 'แต้มที่ได้รับ (1 บาท = 1 แต้ม)',
                size: 'xs',
                color: '#888888',
                margin: 'xs'
              }
            ]
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  {
                    type: 'text',
                    text: 'ยอดชำระเงิน',
                    size: 'sm',
                    color: '#888888'
                  },
                  {
                    type: 'text',
                    text: `฿${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
                    size: 'sm',
                    color: '#111111',
                    align: 'end',
                    weight: 'bold'
                  }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  {
                    type: 'text',
                    text: 'แต้มสะสมทั้งหมด',
                    size: 'sm',
                    color: '#888888'
                  },
                  {
                    type: 'text',
                    text: `${balanceAfter.toLocaleString()} แต้ม`,
                    size: 'sm',
                    color: '#7A0C1E',
                    align: 'end',
                    weight: 'bold'
                  }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  {
                    type: 'text',
                    text: 'เวลาทำรายการ',
                    size: 'xs',
                    color: '#AAAAAA'
                  },
                  {
                    type: 'text',
                    text: new Date().toLocaleString('th-TH'),
                    size: 'xs',
                    color: '#AAAAAA',
                    align: 'end'
                  }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '15px',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'ดูบัตรสมาชิก & แลกรางวัล',
              uri: liffUrl
            },
            style: 'primary',
            color: '#7A0C1E'
          }
        ]
      }
    }
  };

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.channelAccessToken}`
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [flexMessage]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('LINE Push Error:', errBody);
      return { success: false, error: errBody };
    }

    console.log(`[LINE PUSH SUCCESS] ส่งการ์ดแจ้งแต้มไปยัง ${lineUserId}`);
    return { success: true };
  } catch (err) {
    console.error('Error sending LINE push message:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * ส่ง Flex Message แจ้งเตือนการแลกของรางวัล
 */
async function sendRedeemNotification({ lineUserId, rewardTitle, pointsUsed, balanceAfter }) {
  const config = getEnvConfig();

  if (!config.channelAccessToken) {
    console.warn(`[LINE NOTIFICATION] ยังไม่ได้ใส่ LINE_CHANNEL_ACCESS_TOKEN ใน .env (ข้ามการส่งแจ้งเตือนการแลกรางวัล)`);
    return { success: false, reason: 'NO_TOKEN' };
  }

  if (!lineUserId) {
    return { success: false, reason: 'NO_USER_ID' };
  }

  const flexMessage = {
    type: 'flex',
    altText: `คุณได้แลกของรางวัล: ${rewardTitle}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#7A0C1E',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '🎁 แลกของรางวัลสำเร็จ!',
            color: '#FFFFFF',
            size: 'lg',
            weight: 'bold'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: rewardTitle,
            size: 'lg',
            weight: 'bold',
            wrap: true
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: 'แต้มที่ใช้',
                color: '#888888'
              },
              {
                type: 'text',
                text: `-${pointsUsed.toLocaleString()} แต้ม`,
                color: '#7A0C1E',
                weight: 'bold',
                align: 'end'
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'แต้มคงเหลือ',
                color: '#888888'
              },
              {
                type: 'text',
                text: `${balanceAfter.toLocaleString()} แต้ม`,
                color: '#7A0C1E',
                weight: 'bold',
                align: 'end'
              }
            ]
          }
        ]
      }
    }
  };

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.channelAccessToken}`
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [flexMessage]
      })
    });

    return { success: response.ok };
  } catch (err) {
    console.error('Error sending Redeem notification:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendEarnNotification,
  sendRedeemNotification
};
