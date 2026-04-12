# 🚀 MoneyKeeper 설치 및 실행 가이드

## 1단계 - Supabase 설정

1. [supabase.com](https://supabase.com) 에서 무료 프로젝트 생성
2. **SQL Editor** → `src/db/schema.sql` 전체 복사 후 실행
3. **Settings → API** 에서 아래 값 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2단계 - Notion 설정

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → 새 통합 생성
2. `Internal Integration Token` 복사 → `NOTION_TOKEN`
3. Notion에서 **가계부 DB 페이지** 생성 후 통합 연결
4. DB URL의 ID 부분 복사 → `NOTION_DATABASE_ID`

### Notion DB 필드 구성
| 필드명 | 타입 |
|--------|------|
| Name | 제목 |
| 날짜 | 날짜 |
| 금액 | 숫자 |
| 유형 | 선택 |
| 카테고리 | 선택 |
| 가맹점 | 텍스트 |
| 메모 | 텍스트 |
| 내부ID | 텍스트 |

## 3단계 - 환경변수 설정

`.env.local` 파일 수정:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxxxx
NOTION_TOKEN=secret_xxxxxxxx
NOTION_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID=00000000-0000-0000-0000-000000000001
```

## 4단계 - 실행

```bash
cd moneykeeper
npm run dev
```

→ http://localhost:3000 접속

## 모바일에서 테스트

```bash
# 같은 Wi-Fi 네트워크라면
http://[내 PC IP]:3000
```

---

## 🗂 현재 구현 범위 (MVP 1차)

| 기능 | 상태 |
|------|------|
| 자연어 텍스트 입력 | ✅ |
| 파싱 미리보기/검수 | ✅ |
| 거래 저장 (DB) | ✅ |
| 거래 목록 (월별/필터) | ✅ |
| 계좌 잔액 관리 | ✅ |
| 결제수단 관리 | ✅ |
| 자금 이동 (transfer) | ✅ |
| 예산 설정 + 사용률 | ✅ |
| 소비 속도 경고 | ✅ |
| Notion 단방향 동기화 | ✅ |
| 가족 구성원 구분 | ✅ |

## 🔜 2차 구현 예정

- OCR 영수증 스캔
- AI 카테고리 자동 분류
- 소비 분석 리포트
- 음성 입력
- 월 마감 기능
