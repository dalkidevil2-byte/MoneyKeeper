// 노션 DB 속성 자동 추가 스크립트
// 실행: node scripts/setup-notion.mjs <NOTION_TOKEN> <DATABASE_ID>

const [,, token, dbId] = process.argv;

if (!token || !dbId) {
  console.error('사용법: node scripts/setup-notion.mjs <NOTION_TOKEN> <DATABASE_ID>');
  process.exit(1);
}

const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    properties: {
      '유형': { select: {} },
      '카테고리': { select: {} },
      '메모': { rich_text: {} },
      '내부ID': { rich_text: {} },
    },
  }),
});

const data = await res.json();
if (res.ok) {
  console.log('✅ 노션 DB 속성 추가 완료!');
  console.log('추가된 속성:', Object.keys(data.properties).join(', '));
} else {
  console.error('❌ 실패:', data.message ?? JSON.stringify(data));
}
