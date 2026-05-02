# 📘 MoneyKeeper 셋업 가이드 (1인 사용자용)

가계부 · 할일 · 아카이브 · AI 어시스턴트가 통합된 개인 비서 앱입니다.
**개발 경험 없어도** 따라하면 1시간 안에 끝나요.

---

## 🎯 시작 전 체크리스트

- [ ] **이메일 주소** 1개 (GitHub / Supabase / Vercel / OpenAI 가입용)
- [ ] **신용카드 또는 체크카드** 1장 (OpenAI 만 결제수단 필수, 나머지는 무료)
- [ ] **30~60분의 시간** (한 번에 끝낼 수 있는 시간이 좋아요)
- [ ] **PC 또는 노트북** (모바일에서도 가능하지만 PC 가 편해요)

---

## 💰 예상 월 비용

| 사용 강도 | OpenAI | Supabase | Vercel | **월 합계** |
|---|---|---|---|---|
| 가벼움 (AI 가끔, 메모 위주) | $0.5~1 | $0 | $0 | **약 1,500원** |
| 보통 (AI 일상, 영수증 OCR) | $2~5 | $0 | $0 | **약 5,000원** |
| 많이 (AI 적극, 사진 多) | $5~15 | $0 또는 $1 | $0 | **약 15,000원** |

**OpenAI 만 결제수단 등록 필수** (선충전 방식 — 충전한 만큼만 사용).
나머지 서비스는 무료 한도가 넉넉해서 일반 사용은 청구 0원.

---

## 📋 전체 흐름 (1시간)

| 단계 | 소요 | 무엇 |
|---|---|---|
| 1️⃣ | 5분 | GitHub 가입 + 코드 fork |
| 2️⃣ | 10분 | Supabase 프로젝트 생성 + DB 셋업 |
| 3️⃣ | 5분 | OpenAI API 키 발급 |
| 4️⃣ | 1분 | 암호화 키 만들기 |
| 5️⃣ | 15분 | Vercel 배포 + 환경변수 입력 |
| 6️⃣ | 5분 | 첫 진입 + 기본 설정 |
| (선택) | 각 5~10분 | 텔레그램 봇 / 노션 / R2 / Google 캘린더 |

---

## 1️⃣ GitHub — 코드 가져오기 (5분)

GitHub 은 코드를 보관하고 Vercel 과 연결되는 다리 역할이에요. **무료**.

### 1-1. 가입
- [ ] https://github.com 접속 → 우상단 **Sign up**
- [ ] 이메일 / 비밀번호 / username 입력 (username 은 영문, 나중에 URL 에 들어감)
- [ ] 이메일 인증 완료

### 1-2. 코드 fork
- [ ] 받은 GitHub 저장소 링크 접속 (예: `https://github.com/dalkidevil2-byte/MoneyKeeper`)
- [ ] 우상단 **Fork** 버튼 클릭
- [ ] **Create fork** 클릭 → 본인 계정에 복사됨
- [ ] 주소가 `https://github.com/내username/MoneyKeeper` 로 바뀐 것 확인
- [ ] 이 페이지 URL 메모 — 나중에 Vercel 에서 가져올 때 사용

> 💡 **Fork 란?** 원본 코드를 본인 계정으로 복사하는 것. 본인 계정에서 자유롭게 수정 가능. 원본 주인이 코드 업데이트 해도 본인 fork 와 무관.

---

## 2️⃣ Supabase — 데이터베이스 (10분)

Supabase 는 데이터베이스 + 파일 저장소 서비스. **무료 한도** 안에서 충분.

### 2-1. 가입
- [ ] https://supabase.com 접속 → **Start your project**
- [ ] **Sign in with GitHub** 추천 (방금 만든 GitHub 계정으로)
- [ ] 권한 허용

### 2-2. 새 프로젝트 만들기
- [ ] **New Project** 클릭
- [ ] **Organization**: 본인 계정 그대로
- [ ] **Project name**: `moneykeeper` (또는 원하는 이름)
- [ ] **Database password**: 강력한 비밀번호 → ⚠️ **반드시 메모장에 백업**
- [ ] **Region**: `Northeast Asia (Seoul)` 선택 (한국에서 빠름)
- [ ] **Pricing Plan**: Free
- [ ] **Create new project** → 1~2분 대기 (커피 ☕)

### 2-3. DB 스키마 한 번에 실행
- [ ] 새 탭에서 **본인 GitHub fork** 열기 → 경로 따라가기:
  `MoneyKeeper` → `src` → `db` → **`schema-template.sql`** 클릭
- [ ] 우상단 **Raw** 버튼 클릭 → 페이지 전체 텍스트만 보임
- [ ] **Ctrl+A** (전체선택) → **Ctrl+C** (복사)
- [ ] 다시 Supabase 탭으로 → 좌측 사이드바 **SQL Editor** 클릭
- [ ] 우상단 **+ New query** 클릭
- [ ] 빈 영역에 **Ctrl+V** (붙여넣기)
- [ ] 우하단 **Run** 클릭
- [ ] **`Success. No rows returned`** 메시지 확인 ✅

### 2-4. URL & API Key 복사 (Vercel 에서 사용)
- [ ] 좌측 사이드바 하단 **Project Settings** (톱니바퀴) 클릭
- [ ] 좌측 메뉴 **Data API**
- [ ] 다음 3개 값을 메모장에 붙여넣기:

```
Project URL          → 예: https://xxxxxxx.supabase.co
anon public key      → 긴 문자열 (Vercel 에 SUPABASE_ANON_KEY 로 입력)
service_role key     → 긴 문자열 (⚠️ 비공개 — Vercel 에 SUPABASE_SERVICE_ROLE_KEY 로 입력)
```

> ⚠️ **service_role key 는 절대 외부 공개 X**. GitHub 코드에 직접 넣지 말고 Vercel 환경변수로만.

---

## 3️⃣ OpenAI — AI 기능용 API 키 (5분)

AI 어시스턴트, 영수증 OCR, 자동 분류 등에 사용. **사용량 기반 과금**.

### 3-1. 가입
- [ ] https://platform.openai.com 접속 → **Sign up**
- [ ] 이메일 / 비밀번호
- [ ] 휴대폰 인증 (한국 번호 OK)

### 3-2. 결제수단 등록 + 선충전
- [ ] 우상단 본인 이름 → **Settings** → **Billing**
- [ ] **Add payment method** → 카드 정보 입력
- [ ] **Add to credit balance** → **$5** 충전 (약 7,000원, 한 달 충분)
- [ ] **Auto recharge** 는 **꺼두기** 권장 (예상치 못한 청구 방지)

### 3-3. API 키 발급
- [ ] 좌측 메뉴 **API keys**
- [ ] **+ Create new secret key**
- [ ] **Name**: `moneykeeper`
- [ ] **Permissions**: All
- [ ] **Create**
- [ ] ⚠️ 표시된 키 (`sk-proj-...`) **즉시 메모장에 복사** — 다시 못 봄
- [ ] **Done**

---

## 4️⃣ 암호화 키 만들기 (1분)

앱이 외부 서비스 토큰(노션 등)을 안전하게 저장하는 데 사용.

### 가장 쉬운 방법 — 브라우저 콘솔
- [ ] **F12** 누르기 (개발자 도구 열기)
- [ ] 상단 탭 **Console** 클릭
- [ ] 다음 한 줄 붙여넣고 **Enter**:

```js
btoa(crypto.getRandomValues(new Uint8Array(48)).reduce((a,b)=>a+String.fromCharCode(b),''))
```

- [ ] 출력된 64자 문자열을 메모장에 복사 → `APP_ENCRYPTION_KEY` 라고 라벨

> ⚠️ 이 키 잃어버리면 저장된 토큰들 복호화 불가. 안전한 곳에 백업.

---

## 5️⃣ Vercel — 배포 (15분)

Vercel 은 앱을 인터넷에 올려서 URL 로 접속 가능하게 해주는 서비스. **무료**.

### 5-1. 가입
- [ ] https://vercel.com 접속 → **Sign up**
- [ ] **Continue with GitHub** 클릭 (방금 만든 GitHub 계정)
- [ ] 권한 허용
- [ ] Hobby (Free) 플랜 선택

### 5-2. 프로젝트 가져오기
- [ ] 대시보드 → **Add New** → **Project**
- [ ] 본인 GitHub 의 `MoneyKeeper` 저장소 옆 **Import**
- [ ] **Project name** 그대로
- [ ] **Framework Preset**: Next.js 자동 감지됨

### 5-3. 환경변수 입력 ⭐ 가장 중요

**Environment Variables** 섹션 펼치고 다음을 하나씩 추가:

| Name (변수명) | Value (값) | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | 2-4 에서 복사 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key | 2-4 에서 복사 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | 2-4 에서 복사 |
| `NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID` | `00000000-0000-0000-0000-000000000001` | 그대로 입력 |
| `OPENAI_API_KEY` | OpenAI 키 (sk-proj-...) | 3-3 에서 복사 |
| `APP_ENCRYPTION_KEY` | 암호화 키 (64자) | 4번에서 만든 거 |
| `AUTH_PASSWORD` | 본인이 만들 비밀번호 | 앱 로그인용. 영문+숫자 8자 이상 |
| `JWT_SECRET` | 또 다른 랜덤 문자열 | 위 4번 방법으로 또 1개 만들어서 |
| `NEXT_PUBLIC_DISABLE_STOCKS` | `true` | 주식 메뉴 숨김 |
| `NEXT_PUBLIC_SOLO_MODE` | `true` | 1인 모드 (가족 UI 숨김) |

각 항목마다 입력 → **Add another** → 다음 항목.

> 💡 입력하다 막히면: 이름 정확히, 값 앞뒤 공백 없게.

### 5-4. 배포
- [ ] 모든 환경변수 입력 완료 확인
- [ ] 하단 **Deploy** 클릭
- [ ] 1~3분 대기 (빌드 진행 표시)
- [ ] **Congratulations!** 화면 → **Continue to Dashboard**
- [ ] 대시보드에서 **Visit** 클릭 → 본인 앱 URL 열림

### 5-5. URL 확인
URL 형태: `https://moneykeeper-xxx-yourname.vercel.app`
- [ ] 휴대폰 홈 화면에 추가하면 앱처럼 사용 가능
- [ ] 본인만 알 수 있는 URL — 외부 공개 X 면 안전

---

## 6️⃣ 첫 진입 + 기본 설정 (5분)

### 6-1. 로그인
- [ ] 앱 URL 접속
- [ ] 비밀번호 입력 (5번에서 정한 `AUTH_PASSWORD`)

### 6-2. 둘러보기
- [ ] 메인 화면에 5개 카드 표시되는지 확인:
  - ✨ AI 어시스턴트
  - ✅ 할일
  - 💰 가계부
  - 📦 아카이브
  - (주식은 안 보여야 정상)
- [ ] 각 카드 한 번씩 들어가서 빈 상태 확인

### 6-3. 기본 설정
- [ ] **가계부** 진입 → 우상단 ⚙️ → 카테고리/계좌/카드 본인 것 입력
- [ ] **할일** 진입 → + 새 할일 한번 만들어보기
- [ ] **AI 어시스턴트** → 채팅창에 "안녕" 입력 → 응답 확인 (OpenAI 작동 검증)

🎉 **여기까지 됐으면 셋업 완료!**

---

## 🔧 (선택) 추가 기능

기본 셋업 다음에 필요할 때 진행. 스킵해도 앱 동작에 영향 X.

### 텔레그램 봇 (10분, 무료)

할일 알림을 텔레그램으로 받거나, AI 와 텔레그램에서 대화 가능.

- [ ] 텔레그램 앱에서 `@BotFather` 검색 → 채팅 시작
- [ ] `/newbot` → 봇 이름/username 입력 → **Bot Token** 받음
- [ ] `@userinfobot` 검색 → 채팅 → 본인 **Chat ID** 받음
- [ ] Vercel → Settings → Environment Variables 에 추가:
  - `TELEGRAM_BOT_TOKEN`: 봇 토큰
  - `TELEGRAM_CHAT_ID`: 본인 chat id
  - `CRON_SECRET`: 위 4번 방법으로 만든 또 다른 랜덤 문자열
- [ ] **Redeploy** (Deployments → 최신 ⋯ → Redeploy)

### 노션 연동 (10분, 무료)

기존 노션 DB 가져오기 / 컬렉션 내보내기 가능.

- [ ] https://www.notion.so/profile/integrations
- [ ] **+ New integration** → Internal → 이름 `moneykeeper` → Save
- [ ] 발급된 토큰 (`secret_xxx` 또는 `ntn_xxx`) 복사
- [ ] 앱에서 `/archive` → 아무 컬렉션 → 📥 → 가이드 따라 토큰 등록
- [ ] 가져올 노션 페이지 ⋯ → **Connections** → 만든 통합 추가

### Cloudflare R2 (10GB 무료 — 사진 첨부 많을 때)

자세한 단계는 fork 한 저장소의 `docs/R2-SETUP.md` 파일 참고 (GitHub 에서 그 경로로 들어가면 보임).

### Google 캘린더 동기화 (옵션)

할일 ↔ 구글 캘린더 양방향 동기화. 설정 복잡 — 필요할 때 별도 안내.

---

## 🚨 자주 막히는 부분

### "Build failed" — Vercel 배포 실패
- 환경변수 오타 점검 (변수명 정확히)
- `NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID` 가 `00000000-0000-0000-0000-000000000001` 인지 (대시 4개 위치 정확히)
- 모든 환경변수 추가 후 **Redeploy** 했는지

### "permission denied for table" — DB 권한 에러
- `SUPABASE_SERVICE_ROLE_KEY` 가 올바른지 (anon key 와 헷갈리기 쉬움)
- Supabase 에서 키 한번 더 복사해서 붙여넣기

### AI 응답 안 옴 / "Insufficient quota"
- OpenAI Billing 페이지에서 잔액 확인 — $0 이면 충전 필요
- API key 가 정확한지

### "household 없음" 에러
- DB 스키마 SQL 다 실행 안 됐을 수 있음 → SQL Editor 에서 다시 실행
- 또는 시드 데이터의 INSERT 만 다시 실행:
  ```sql
  INSERT INTO households (id, name) VALUES
    ('00000000-0000-0000-0000-000000000001', '내 가구')
  ON CONFLICT DO NOTHING;
  ```

### Supabase 7일 미사용 자동 정지
- Free 플랜은 7일 비활성 시 일시정지
- 다음 접속 시 자동 재시작 (1~2분 걸림)
- 자주 쓰면 멈출 일 X
- Pro ($25/월) 면 정지 없음

### 비밀번호 잊어버림
- Vercel 환경변수 `AUTH_PASSWORD` 새 값으로 변경 → Redeploy

---

## 💡 일상 사용 팁

### 모바일 홈 화면에 추가
- iPhone Safari → 공유 → "홈 화면에 추가"
- Android Chrome → 메뉴 → "홈 화면에 추가"
- 앱 아이콘처럼 사용 가능 (PWA)

### AI 한테 한국어로 말하기
```
오늘 스타벅스 5500원 썼어
내일 9시에 회의
이번 주 어디에 돈 가장 많이 썼어?
```
→ 자동으로 거래/일정으로 등록되거나 분석해서 답변

### 영수증 자동 입력
- 가계부 → 거래내역 → 우상단 카메라 아이콘
- 영수증 사진 → AI 가 자동 파싱 → 검토 후 저장

---

## ❓ FAQ

**Q. 친구한테 받은 코드를 그대로 복사하면 친구 데이터가 보이나요?**
A. 아니요. Supabase / Vercel 본인 계정에서 만든 건 완전 분리됩니다. 코드만 같고 데이터는 별개.

**Q. 무료로 영원히 쓸 수 있나요?**
A. OpenAI 사용량은 충전한 만큼만 빠지고, 나머지는 무료 한도 안에서 동작. 가벼운 사용이면 월 1,000~2,000원 정도.

**Q. 본인 데이터 백업 가능한가요?**
A. Supabase 대시보드 → Database → Backups 에서 다운로드 가능. Pro 플랜은 일일 자동 백업.

**Q. 다른 PC/폰에서도 쓸 수 있나요?**
A. URL + 비밀번호만 알면 어디서든 접속. 가족과 공유하려면 비밀번호 알려주면 됨 (단 SOLO_MODE 라 사용자 구분은 안 됨).

**Q. 코드 업데이트는 어떻게 받나요?**
A. GitHub fork 페이지 → **Sync fork** 버튼으로 원본 변경사항 받기. Vercel 은 자동 재배포됨.

---

축하해요! 🎊 이제 본인만의 AI 비서가 준비됐어요.
사용하다 부족한 부분 있으면 친구한테 물어보거나, AI 어시스턴트에게 직접 물어봐도 됩니다.
