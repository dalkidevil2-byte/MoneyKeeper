# Cloudflare R2 설정 (선택)

아카이브 첨부파일을 Supabase Storage(1GB 무료) 대신 Cloudflare R2 (10GB 무료, egress 무료) 로 보내도록.
환경 변수가 모두 채워져 있으면 자동으로 R2 사용, 없으면 Supabase fallback.

## 1. Cloudflare 계정 + R2 활성화

1. https://dash.cloudflare.com 가입 (무료)
2. 좌측 메뉴 → **R2 Object Storage** → 결제수단 등록 (10GB까지 청구 X)
3. **Create bucket** → 이름: `moneykeeper-archive` 같이 (어떤 이름이든 OK)

## 2. Public access 활성화

1. 만든 버킷 → **Settings** 탭
2. **Public Access** 섹션 → **Allow Access**
3. Public bucket URL 표시됨 — 예: `https://pub-xxxxxxxxxxxxxxxx.r2.dev`
   - 또는 본인 도메인 연결도 가능 (Custom Domain)

## 3. API 토큰 발급

1. R2 좌측 메뉴 → **Manage R2 API Tokens** → **Create API token**
2. 권한: **Object Read & Write**
3. 버킷 지정 또는 전체 허용
4. 표시되는 정보 복사:
   - Access Key ID
   - Secret Access Key
   - Account ID (URL `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` 에 들어가는 부분)

## 4. Vercel 환경 변수에 추가

Vercel 프로젝트 → **Settings** → **Environment Variables** 에 추가:

```
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET=moneykeeper-archive
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxxxxxxxxxx.r2.dev
```

(`R2_ENDPOINT` 는 자동 계산됨. 직접 지정하고 싶으면 `https://<account_id>.r2.cloudflarestorage.com`)

저장 후 재배포 → 자동으로 R2 사용 시작.

## 5. 확인

업로드 시 응답에 `"storage": "r2"` 가 있으면 R2 사용 중.
설정 안 돼있으면 `"storage": "supabase"`.

## 마이그레이션 (선택)

기존 Supabase 에 있던 파일을 R2 로 옮기려면 별도 스크립트 필요.
DB 의 `archive_entries.data` 안에 저장된 URL 들을 읽어서 다운로드 → R2 업로드 → URL 교체.
대규모 이전 필요해지면 만들어드릴게요.
