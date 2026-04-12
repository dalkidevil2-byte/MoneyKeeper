// Notion DB 속성 추가 스크립트 (REST API 직접 호출)
const fs = require('fs');
const path = require('path');

// .env.local 읽기
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

async function updateDatabase() {
  console.log('📝 Notion DB 속성 추가 중...');

  const body = {
    properties: {
      날짜:     { date: {} },
      금액:     { number: { format: 'won' } },
      유형: {
        select: {
          options: [
            { name: '수입',     color: 'green'  },
            { name: '변동지출', color: 'red'    },
            { name: '고정지출', color: 'orange' },
            { name: '자금이동', color: 'blue'   },
            { name: '환불',     color: 'purple' },
            { name: '조정',     color: 'gray'   },
          ],
        },
      },
      카테고리: {
        select: {
          options: [
            { name: '식비',      color: 'yellow' },
            { name: '교통',      color: 'blue'   },
            { name: '쇼핑',      color: 'pink'   },
            { name: '의료',      color: 'green'  },
            { name: '교육',      color: 'purple' },
            { name: '취미',      color: 'orange' },
            { name: '고정비',    color: 'gray'   },
            { name: '생활',      color: 'brown'  },
            { name: '주거',      color: 'default'},
            { name: '저축/투자', color: 'green'  },
            { name: '수입',      color: 'green'  },
            { name: '기타',      color: 'gray'   },
          ],
        },
      },
      가맹점: { rich_text: {} },
      메모:   { rich_text: {} },
      내부ID: { rich_text: {} },
    },
  };

  const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ 오류:', data.message);
    return;
  }

  console.log('✅ 속성 추가 완료!');
  console.log('   추가된 속성:', Object.keys(data.properties).join(', '));
}

updateDatabase().catch(console.error);
