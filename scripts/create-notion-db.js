// Notion 가계부 DB 자동 생성 스크립트
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// .env.local 읽기
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
});

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PARENT_PAGE_ID = '340d88e3b46680c7b42dedcd3fe14d7b';

async function createDatabase() {
  console.log('📒 Notion 가계부 DB 생성 중...');

  const response = await notion.databases.create({
    parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
    title: [{ type: 'text', text: { content: '거래내역' } }],
    properties: {
      // 제목 (기본 필드)
      Name: { title: {} },
      // 날짜
      날짜: { date: {} },
      // 금액
      금액: { number: { format: 'won' } },
      // 거래 유형
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
      // 카테고리
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
            { name: '육아',      color: 'pink'   },
            { name: '수입',      color: 'green'  },
            { name: '기타',      color: 'gray'   },
          ],
        },
      },
      // 가맹점
      가맹점: { rich_text: {} },
      // 메모
      메모: { rich_text: {} },
      // 내부 ID (역추적용)
      내부ID: { rich_text: {} },
    },
  });

  const dbId = response.id;
  console.log('✅ DB 생성 성공!');
  console.log('');
  console.log('📋 아래 값을 .env.local 에 추가하세요:');
  console.log('');
  console.log(`NOTION_DATABASE_ID=${dbId}`);
  console.log('');
}

createDatabase().catch((err) => {
  console.error('❌ 오류 발생:', err.message);
});
