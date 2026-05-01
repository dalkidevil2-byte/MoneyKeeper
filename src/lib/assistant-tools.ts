/**
 * AI 어시스턴트가 사용할 도구(function call) 정의 + 실행기.
 * OpenAI tool_calls 응답이 오면 여기서 실행하고 결과를 다시 LLM 에 전달.
 */

import { createServerSupabaseClient } from './supabase';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Seoul';

export const ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_tasks',
      description:
        '제목/메모/카테고리/날짜로 할일·일정 검색. 결과는 최대 20건. 시간 정보 포함.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '제목/메모 검색 키워드 (선택)' },
          kind: {
            type: 'string',
            enum: ['event', 'todo'],
            description: '일정(event) 또는 할일(todo) 필터 (선택)',
          },
          status: {
            type: 'string',
            enum: ['pending', 'done', 'all'],
            description: '상태 필터 (기본: pending)',
          },
          date_from: { type: 'string', description: 'YYYY-MM-DD 시작일' },
          date_to: { type: 'string', description: 'YYYY-MM-DD 종료일' },
          limit: { type: 'integer', description: '최대 갯수 (기본 20)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_today_summary',
      description: '오늘의 일정 + 할일 + Daily Track 요약. 기본 필수 도구.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_week_stats',
      description:
        '주간 통계 — 완료한 일정 갯수, 카테고리별 시간 합계, 미완료 등.',
      parameters: {
        type: 'object',
        properties: {
          week_offset: {
            type: 'integer',
            description: '0=이번 주, -1=지난 주, 1=다음 주',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_free_slots',
      description: '특정 날짜에 비어있는 시간대 (1시간 이상) 찾기.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          start_hour: { type: 'integer', description: '검색 시작 시 (기본 9)' },
          end_hour: { type: 'integer', description: '검색 종료 시 (기본 22)' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_goal_progress',
      description: '목표(goal) 들의 진행률, 연결된 할일 수, 누적 시간.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description:
        '새 일정/할일 생성. 사용자가 명시적으로 만들어달라고 할 때만 호출. 시간 일정이면 due_time 도 지정.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['event', 'todo'] },
          title: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD (event)' },
          due_time: { type: 'string', description: 'HH:MM (선택)' },
          end_time: { type: 'string', description: 'HH:MM (선택)' },
          deadline_date: {
            type: 'string',
            description: 'YYYY-MM-DD (todo 마감일)',
          },
          memo: { type: 'string' },
        },
        required: ['kind', 'title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_archive_collection',
      description:
        '아카이브에 새 컬렉션 생성. 사용자가 "X 페이지/컬렉션/목록 만들어줘" 라고 할 때 호출. 적절한 이모지/속성 자동 추론. 예: "여행 기록", "운동 일지", "와인 노트".',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '컬렉션 이름' },
          emoji: { type: 'string', description: '이모지 1개' },
          color: {
            type: 'string',
            description:
              'hex 색상 (예: #6366f1). 주제에 어울리는 색.',
          },
          description: { type: 'string', description: '한 줄 설명' },
          schema: {
            type: 'array',
            description: '속성 배열. 일반적으로 3~7개. 첫 속성은 제목 역할.',
            items: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: '영문 snake_case (예: title, cook_time)',
                },
                label: { type: 'string', description: '표시 이름 (한글)' },
                type: {
                  type: 'string',
                  enum: [
                    'text', 'longtext', 'number', 'currency',
                    'date', 'url', 'select', 'multiselect',
                    'rating', 'checkbox',
                  ],
                },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'select / multiselect 일 때만',
                },
                required: { type: 'boolean' },
              },
              required: ['key', 'label', 'type'],
            },
          },
        },
        required: ['name', 'schema'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_transaction',
      description:
        '가계부에 거래(지출/수입) 등록. "올리브영 2만원", "마트에서 35000원 썼어" 같은 메시지에서 호출. 카테고리/결제수단 미상이면 추측해서 채움.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: '금액 (원)' },
          type: {
            type: 'string',
            enum: ['expense', 'income'],
            description: '지출/수입 (기본 expense)',
          },
          store_name: { type: 'string', description: '가게/장소' },
          memo: { type: 'string', description: '추가 메모 (선택)' },
          category_main: {
            type: 'string',
            description:
              '대분류 추측. 식비/쇼핑/교통/카페/문화/의료/생활 등',
          },
          category_sub: { type: 'string' },
          date: {
            type: 'string',
            description: 'YYYY-MM-DD. 명시 없으면 오늘',
          },
          status: {
            type: 'string',
            enum: ['draft', 'reviewed', 'confirmed'],
            description: '기본 confirmed. 자신없으면 draft 로 저장',
          },
        },
        required: ['amount', 'store_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_stock_portfolio',
      description: '주식 보유 종목, 평균단가, 평가액, 미실현 손익. 사용자가 주식·포트폴리오 관련 질문 시 사용.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_stock_trades',
      description: '주식 거래 패턴 분석 — 평균 보유일, 단타 vs 장투, 승률, 종목별 손익.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_stock_news',
      description: '특정 종목의 최근 뉴스 (Yahoo Finance). ticker 미지정시 보유 상위 종목 전체 뉴스.',
      parameters: {
        type: 'object',
        properties: {
          ticker: { type: 'string', description: '예: AAPL, 005930.KS' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_stock_recommendation',
      description:
        '주식 관련 메시지(리딩방 추천/뉴스/리포트/이슈/내 분석 메모 등)를 종목별로 분리해서 stock_memos 에 날짜와 함께 누적 저장. **실제 매매가 아닌 정보 보관용**. 한 메시지에 여러 종목 있으면 entries 배열로 분리. ticker 모르면 비워도 됨 (서버가 KRX 매칭).',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'YYYY-MM-DD. 메시지의 발신/작성 날짜. 없으면 오늘.',
          },
          source: {
            type: 'string',
            description: '출처 — 리딩방 이름 / 뉴스 / 리포트 등 (선택)',
          },
          entries: {
            type: 'array',
            description: '종목별 항목 배열',
            items: {
              type: 'object',
              properties: {
                ticker_name: {
                  type: 'string',
                  description: '한국명 또는 영문명 (예: SNT에너지, 만도, 포스코DX, AAPL)',
                },
                ticker: {
                  type: 'string',
                  description: '6자리 코드 또는 .KS/.KQ 티커 (알면 적기, 모르면 생략)',
                },
                action: {
                  type: 'string',
                  enum: ['buy', 'sell', 'watch', 'hold', 'other'],
                  description: '메시지의 톤 — 매수추천/매도추천/관심/유지/기타. 실제 거래가 아니라 시각적 태그용.',
                },
                content: {
                  type: 'string',
                  description: '해당 종목에 대한 원문 그대로. 가공·요약하지 말고 종목 관련 부분만 발췌.',
                },
              },
              required: ['ticker_name', 'content'],
            },
          },
        },
        required: ['entries'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_stock_recommendations',
      description:
        '특정 종목 또는 전체의 저장된 추천/리딩방 메모 조회. 사용자가 "X 종목 메모 보여줘", "최근에 받은 추천" 같은 질문할 때 사용.',
      parameters: {
        type: 'object',
        properties: {
          ticker_name: { type: 'string', description: '종목명 (선택)' },
          ticker: { type: 'string', description: '티커 코드 (선택)' },
          limit: { type: 'integer', description: '최대 개수 (기본 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_time_breakdown',
      description:
        '특정 기간의 카테고리별/멤버별 시간 누적 — 어디에 시간 많이 썼는지.',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'YYYY-MM-DD' },
          date_to: { type: 'string', description: 'YYYY-MM-DD' },
          group_by: {
            type: 'string',
            enum: ['category', 'member', 'task'],
            description: '집계 기준',
          },
        },
        required: ['date_from', 'date_to'],
      },
    },
  },
];

// ─────────────────────────────────────────
// 실행기
// ─────────────────────────────────────────

type ToolResult = { ok: boolean; data?: unknown; error?: string };

export async function executeTool(
  householdId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const supabase = createServerSupabaseClient();

  try {
    switch (name) {
      case 'search_tasks': {
        let q = supabase
          .from('tasks')
          .select('id, title, memo, kind, type, due_date, due_time, deadline_date, deadline_time, status, category_main, category_sub')
          .eq('household_id', householdId)
          .eq('is_active', true);

        if (args.kind) q = q.eq('kind', args.kind as string);
        const status = (args.status as string) ?? 'pending';
        if (status !== 'all') q = q.eq('status', status);
        if (args.date_from) q = q.gte('due_date', args.date_from as string);
        if (args.date_to) q = q.lte('due_date', args.date_to as string);
        const limit = (args.limit as number) ?? 20;
        q = q.limit(limit).order('due_date', { ascending: true, nullsFirst: false });

        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };

        let filtered = data ?? [];
        if (args.query) {
          const needle = (args.query as string).toLowerCase();
          filtered = filtered.filter((t) =>
            [t.title, t.memo, t.category_main, t.category_sub]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(needle),
          );
        }
        return { ok: true, data: { count: filtered.length, tasks: filtered } };
      }

      case 'get_today_summary': {
        const today = dayjs().tz(TZ).format('YYYY-MM-DD');
        const { data: events } = await supabase
          .from('tasks')
          .select('id, title, due_time, end_time, status, category_main')
          .eq('household_id', householdId)
          .eq('kind', 'event')
          .eq('is_active', true)
          .neq('status', 'cancelled')
          .eq('due_date', today)
          .order('due_time', { ascending: true });

        const { data: todos } = await supabase
          .from('tasks')
          .select('id, title, deadline_date, status, priority')
          .eq('household_id', householdId)
          .eq('kind', 'todo')
          .eq('is_active', true)
          .neq('status', 'cancelled');

        const { data: tracks } = await supabase
          .from('daily_tracks')
          .select('id, title, period')
          .eq('household_id', householdId)
          .eq('is_active', true);

        return {
          ok: true,
          data: {
            today,
            events: events ?? [],
            todos: todos ?? [],
            daily_tracks: tracks ?? [],
          },
        };
      }

      case 'get_week_stats': {
        const offset = (args.week_offset as number) ?? 0;
        const start = dayjs().tz(TZ).startOf('week').add(offset, 'week');
        const end = start.add(6, 'day');
        const startStr = start.format('YYYY-MM-DD');
        const endStr = end.format('YYYY-MM-DD');

        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, kind, status, due_date, due_time, end_time, category_main')
          .eq('household_id', householdId)
          .eq('is_active', true)
          .gte('due_date', startStr)
          .lte('due_date', endStr);

        const events = (tasks ?? []).filter((t) => t.kind === 'event');
        const completed = events.filter((t) => t.status === 'done').length;

        return {
          ok: true,
          data: {
            week: `${startStr} ~ ${endStr}`,
            total_events: events.length,
            completed,
            completion_rate:
              events.length > 0
                ? `${Math.round((completed / events.length) * 100)}%`
                : '-',
            tasks: events.slice(0, 50),
          },
        };
      }

      case 'get_free_slots': {
        const date = args.date as string;
        const startHour = (args.start_hour as number) ?? 9;
        const endHour = (args.end_hour as number) ?? 22;

        const { data: tasks } = await supabase
          .from('tasks')
          .select('title, due_time, end_time, is_fixed')
          .eq('household_id', householdId)
          .eq('kind', 'event')
          .eq('is_active', true)
          .neq('status', 'cancelled')
          .eq('due_date', date)
          .eq('is_fixed', true);

        // 분 단위로 occupied 표기
        const occupied: { start: number; end: number; title: string }[] = [];
        for (const t of tasks ?? []) {
          if (!t.due_time) continue;
          const [sh, sm] = (t.due_time as string).slice(0, 5).split(':').map(Number);
          const startMin = sh * 60 + sm;
          let endMin = startMin + 60;
          if (t.end_time) {
            const [eh, em] = (t.end_time as string).slice(0, 5).split(':').map(Number);
            endMin = eh * 60 + em;
          }
          occupied.push({ start: startMin, end: endMin, title: t.title as string });
        }
        occupied.sort((a, b) => a.start - b.start);

        const slots: { start: string; end: string; minutes: number }[] = [];
        let cursor = startHour * 60;
        const limit = endHour * 60;
        for (const o of occupied) {
          if (o.start > cursor && o.start <= limit) {
            slots.push({
              start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
              end: `${String(Math.floor(o.start / 60)).padStart(2, '0')}:${String(o.start % 60).padStart(2, '0')}`,
              minutes: o.start - cursor,
            });
          }
          cursor = Math.max(cursor, o.end);
        }
        if (cursor < limit) {
          slots.push({
            start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
            end: `${String(Math.floor(limit / 60)).padStart(2, '0')}:${String(limit % 60).padStart(2, '0')}`,
            minutes: limit - cursor,
          });
        }
        return {
          ok: true,
          data: {
            date,
            occupied,
            free_slots: slots.filter((s) => s.minutes >= 30),
          },
        };
      }

      case 'get_goal_progress': {
        const { data: goals } = await supabase
          .from('goals')
          .select('id, title, target_value, current_value, deadline, status')
          .eq('household_id', householdId)
          .eq('is_active', true);
        return { ok: true, data: { goals: goals ?? [] } };
      }

      case 'create_task': {
        const insert: Record<string, unknown> = {
          household_id: householdId,
          kind: args.kind as string,
          type: 'one_time',
          title: args.title as string,
          memo: (args.memo as string) ?? '',
          status: 'pending',
          is_active: true,
          priority: 'normal',
        };
        if (args.kind === 'event') {
          if (!args.due_date)
            return { ok: false, error: 'due_date 필요 (event)' };
          insert.due_date = args.due_date;
          if (args.due_time) {
            insert.is_fixed = true;
            insert.due_time = `${(args.due_time as string).slice(0, 5)}:00`;
            if (args.end_time) {
              insert.end_time = `${(args.end_time as string).slice(0, 5)}:00`;
            }
          }
        } else {
          if (args.deadline_date) insert.deadline_date = args.deadline_date;
        }
        const { data, error } = await supabase
          .from('tasks')
          .insert(insert)
          .select('*')
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { task: data, message: `${args.title} 생성됨` } };
      }

      case 'create_archive_collection': {
        const insert = {
          household_id: householdId,
          name: (args.name as string) ?? '새 컬렉션',
          emoji: (args.emoji as string) ?? '📦',
          color: (args.color as string) ?? '#6366f1',
          description: (args.description as string) ?? '',
          schema: args.schema ?? [],
          is_active: true,
        };
        const { data, error } = await supabase
          .from('archive_collections')
          .insert(insert)
          .select('*')
          .single();
        if (error) return { ok: false, error: error.message };
        return {
          ok: true,
          data: {
            collection: data,
            message: `✨ "${insert.name}" 컬렉션 생성됨 (속성 ${(insert.schema as unknown[]).length}개)\n→ /archive 에서 항목 추가`,
          },
        };
      }

      case 'create_transaction': {
        const today = dayjs().tz(TZ).format('YYYY-MM-DD');
        const userType = (args.type as string) ?? 'expense';
        // 'expense' → 'variable_expense' 매핑 (가계부 type 체계)
        const dbType =
          userType === 'expense'
            ? 'variable_expense'
            : userType === 'income'
              ? 'income'
              : userType;
        const merchant = (args.store_name as string) ?? '';
        const insert: Record<string, unknown> = {
          household_id: householdId,
          amount: Math.abs(args.amount as number),
          type: dbType,
          merchant_name: merchant,
          name: merchant,
          memo: (args.memo as string) ?? '📲 텔레그램',
          category_main: (args.category_main as string) ?? '',
          category_sub: (args.category_sub as string) ?? '',
          date: (args.date as string) ?? today,
          input_type: 'text',
          raw_input: '',
          tags: [],
          essential: false,
          // 텔레그램/AI 로 입력된 거래는 항상 Inbox 에서 확인되도록 reviewed + pending
          status: 'reviewed',
          sync_status: 'pending',
        };
        const { data, error } = await supabase
          .from('transactions')
          .insert(insert)
          .select('*')
          .single();
        if (error) return { ok: false, error: error.message };
        return {
          ok: true,
          data: {
            transaction: data,
            message: `📥 ${merchant} ${(insert.amount as number).toLocaleString('ko-KR')}원\n→ 가계부 Inbox 에서 확인 후 확정해주세요.`,
          },
        };
      }

      case 'get_stock_portfolio': {
        const { computeHoldings, aggregateByTicker, computeRealizedPL } = await import('./stock-holdings');
        // household → owners → accounts → transactions
        const { data: owners } = await supabase
          .from('stock_owners')
          .select('id')
          .eq('household_id', householdId);
        const ownerIds = (owners ?? []).map((o) => o.id as string);
        let txs: unknown[] = [];
        if (ownerIds.length > 0) {
          const { data: accs } = await supabase
            .from('stock_accounts')
            .select('id')
            .in('owner_id', ownerIds);
          const accIds = (accs ?? []).map((a) => a.id as string);
          if (accIds.length > 0) {
            const { data } = await supabase
              .from('stock_transactions')
              .select('id, account_id, ticker, company_name, type, date, quantity, price, created_at')
              .in('account_id', accIds)
              .order('date', { ascending: true });
            txs = data ?? [];
          }
        }
        if (!txs || txs.length === 0) {
          return { ok: true, data: { message: '주식 거래 내역이 없습니다.' } };
        }
        const holdings = computeHoldings(txs as never);
        const agg = aggregateByTicker(holdings);
        const realized = computeRealizedPL(txs as never);

        // 시세 조회
        const tickers = Array.from(new Set(agg.map((a) => a.ticker)));
        let quotes: Record<string, { price: number }> = {};
        if (tickers.length > 0) {
          try {
            const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(',')}`;
            const r = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            if (r.ok) {
              const j = await r.json();
              const results = j?.quoteResponse?.result ?? [];
              for (const q of results) {
                if (q.symbol && typeof q.regularMarketPrice === 'number') {
                  quotes[q.symbol] = { price: q.regularMarketPrice };
                }
              }
            }
          } catch {
            /* skip */
          }
        }

        let totalInvested = 0;
        let totalCurrent = 0;
        const positions = agg.map((a) => {
          const cur = quotes[a.ticker]?.price ?? a.avgPrice;
          const value = a.qty * cur;
          totalInvested += a.invested;
          totalCurrent += value;
          return {
            ticker: a.ticker,
            companyName: a.companyName,
            qty: a.qty,
            avg_price: Math.round(a.avgPrice * 100) / 100,
            current_price: Math.round(cur * 100) / 100,
            invested: Math.round(a.invested),
            value: Math.round(value),
            unrealized_pl: Math.round(value - a.invested),
            unrealized_pct:
              a.invested > 0
                ? Math.round(((value - a.invested) / a.invested) * 1000) / 10
                : 0,
          };
        }).sort((a, b) => b.value - a.value);

        return {
          ok: true,
          data: {
            invested: Math.round(totalInvested),
            current: Math.round(totalCurrent),
            unrealized_pl: Math.round(totalCurrent - totalInvested),
            unrealized_pct:
              totalInvested > 0
                ? Math.round(((totalCurrent - totalInvested) / totalInvested) * 1000) / 10
                : 0,
            realized_pl: Math.round(realized),
            positions,
          },
        };
      }

      case 'analyze_stock_trades': {
        const { analyzeTrades } = await import('./stock-analysis');
        const { data: owners } = await supabase
          .from('stock_owners')
          .select('id')
          .eq('household_id', householdId);
        const ownerIds = (owners ?? []).map((o) => o.id as string);
        let txs: unknown[] = [];
        if (ownerIds.length > 0) {
          const { data: accs } = await supabase
            .from('stock_accounts')
            .select('id')
            .in('owner_id', ownerIds);
          const accIds = (accs ?? []).map((a) => a.id as string);
          if (accIds.length > 0) {
            const { data } = await supabase
              .from('stock_transactions')
              .select('id, account_id, ticker, company_name, type, date, quantity, price, created_at')
              .in('account_id', accIds)
              .limit(10000);
            txs = data ?? [];
          }
        }
        if (!txs || txs.length === 0) {
          return { ok: true, data: { message: '거래 내역이 없습니다.' } };
        }
        const analysis = analyzeTrades(txs as never);
        return { ok: true, data: analysis };
      }

      case 'get_stock_news': {
        const { searchStockNews } = await import('./stock-news');
        const limit = (args.limit as number) ?? 5;
        // 보유 종목 → ticker → company_name 매핑
        const { data: owners } = await supabase
          .from('stock_owners')
          .select('id')
          .eq('household_id', householdId);
        const ownerIds = (owners ?? []).map((o) => o.id as string);
        let txs: Array<{ ticker: string; company_name: string }> = [];
        if (ownerIds.length > 0) {
          const { data: accs } = await supabase
            .from('stock_accounts')
            .select('id')
            .in('owner_id', ownerIds);
          const accIds = (accs ?? []).map((a) => a.id as string);
          if (accIds.length > 0) {
            const { data } = await supabase
              .from('stock_transactions')
              .select('ticker, company_name')
              .in('account_id', accIds);
            txs = (data ?? []) as Array<{ ticker: string; company_name: string }>;
          }
        }
        const tickerToName = new Map<string, string>();
        for (const t of txs) {
          if (t.ticker && t.company_name) tickerToName.set(t.ticker, t.company_name);
        }

        let queries: Array<{ ticker: string; name: string }> = [];
        if (args.ticker) {
          const tk = args.ticker as string;
          queries = [{ ticker: tk, name: tickerToName.get(tk) ?? tk }];
        } else {
          // 보유 상위 3종목 (보유량 큰 순)
          const { computeHoldings, aggregateByTicker } = await import('./stock-holdings');
          const holdings = computeHoldings(
            txs as never,
          );
          const agg = aggregateByTicker(holdings);
          queries = agg.slice(0, 3).map((a) => ({
            ticker: a.ticker,
            name: a.companyName || tickerToName.get(a.ticker) || a.ticker,
          }));
        }

        const news: Array<{ ticker: string; name: string; items: unknown[] }> = [];
        for (const q of queries) {
          // 회사명으로 검색 (한글 이름이 정확)
          const items = await searchStockNews(q.name, limit);
          news.push({ ticker: q.ticker, name: q.name, items });
        }
        return { ok: true, data: { news } };
      }

      case 'save_stock_recommendation': {
        const date = (args.date as string) || dayjs().format('YYYY-MM-DD');
        const source = (args.source as string) || '';
        const entries = (args.entries as Array<{
          ticker_name: string;
          ticker?: string;
          action?: string;
          content: string;
        }>) ?? [];

        if (entries.length === 0) {
          return { ok: false, error: '저장할 종목이 없습니다.' };
        }

        type ResolvedEntry = {
          ticker_name: string;
          resolved_ticker: string | null;
          resolved_code: string | null;
          action: string;
          content: string;
          status: 'saved' | 'not_found' | 'error';
          error?: string;
        };
        const results: ResolvedEntry[] = [];

        for (const e of entries) {
          let ticker = e.ticker?.trim() || '';
          let code: string | null = null;
          let resolvedName = e.ticker_name;

          // ticker 미지정이거나 한글일 때 → KRX 매칭
          if (!ticker || /[가-힣]/.test(ticker)) {
            const q = e.ticker_name.trim();
            const isCode = /^\d+$/.test(q);
            const { data: matches } = await supabase
              .from('stock_krx_stocks')
              .select('code, ticker, name, market')
              .or(isCode ? `code.like.${q}%` : `name.ilike.%${q}%`)
              .limit(5);
            if (matches && matches.length > 0) {
              // 정확히 일치 우선, 없으면 첫 번째
              const exact = matches.find((m) => m.name === q);
              const pick = exact ?? matches[0];
              ticker = pick.ticker as string;
              code = pick.code as string;
              resolvedName = pick.name as string;
            }
          }

          if (!ticker) {
            results.push({
              ticker_name: e.ticker_name,
              resolved_ticker: null,
              resolved_code: null,
              action: e.action ?? 'other',
              content: e.content,
              status: 'not_found',
              error: 'KRX 매칭 실패',
            });
            continue;
          }

          // 기존 메모 조회
          const { data: existing } = await supabase
            .from('stock_memos')
            .select('content')
            .eq('household_id', householdId)
            .eq('ticker', ticker)
            .maybeSingle();

          const actionLabel: Record<string, string> = {
            buy: '🟢 매수추천',
            sell: '🔴 매도추천',
            watch: '👀 관심',
            hold: '⚪ 유지',
            other: '📝',
          };
          const tag = actionLabel[e.action ?? 'other'] ?? '📝';
          const sourceTag = source ? ` · ${source}` : '';
          const newBlock = `[${date}] ${tag}${sourceTag}\n${e.content.trim()}`;
          const merged = existing?.content
            ? `${newBlock}\n\n---\n\n${existing.content}`
            : newBlock;

          const { error: upsertErr } = await supabase
            .from('stock_memos')
            .upsert(
              {
                household_id: householdId,
                ticker,
                content: merged,
              },
              { onConflict: 'household_id,ticker' },
            );

          if (upsertErr) {
            results.push({
              ticker_name: resolvedName,
              resolved_ticker: ticker,
              resolved_code: code,
              action: e.action ?? 'other',
              content: e.content,
              status: 'error',
              error: upsertErr.message,
            });
          } else {
            results.push({
              ticker_name: resolvedName,
              resolved_ticker: ticker,
              resolved_code: code,
              action: e.action ?? 'other',
              content: e.content,
              status: 'saved',
            });
          }
        }

        const savedCount = results.filter((r) => r.status === 'saved').length;
        return {
          ok: true,
          data: {
            date,
            source,
            saved: savedCount,
            total: entries.length,
            results,
          },
        };
      }

      case 'get_stock_recommendations': {
        const tickerArg = args.ticker as string | undefined;
        const nameArg = args.ticker_name as string | undefined;
        const limit = (args.limit as number) ?? 10;

        let ticker = tickerArg?.trim() || '';
        if (!ticker && nameArg) {
          const { data: matches } = await supabase
            .from('stock_krx_stocks')
            .select('ticker, name')
            .ilike('name', `%${nameArg.trim()}%`)
            .limit(1);
          if (matches && matches.length > 0) ticker = matches[0].ticker as string;
        }

        let q = supabase
          .from('stock_memos')
          .select('ticker, content, updated_at')
          .eq('household_id', householdId)
          .order('updated_at', { ascending: false })
          .limit(limit);
        if (ticker) q = q.eq('ticker', ticker);

        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { memos: data ?? [] } };
      }

      case 'get_time_breakdown': {
        const from = args.date_from as string;
        const to = args.date_to as string;
        const groupBy = (args.group_by as string) ?? 'category';

        const { data: sessions } = await supabase
          .from('task_work_sessions')
          .select('task_id, session_date, start_time, end_time')
          .eq('household_id', householdId)
          .gte('session_date', from)
          .lte('session_date', to);

        const taskIds = Array.from(
          new Set((sessions ?? []).map((s) => s.task_id as string)),
        );
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, category_main, member_id')
          .in('id', taskIds.length > 0 ? taskIds : ['00000000-0000-0000-0000-000000000000']);
        const taskMap = new Map<string, { title: string; category_main: string | null; member_id: string | null }>();
        for (const t of tasks ?? []) {
          taskMap.set(t.id as string, {
            title: t.title as string,
            category_main: t.category_main as string | null,
            member_id: t.member_id as string | null,
          });
        }

        const buckets = new Map<string, number>();
        for (const s of sessions ?? []) {
          if (!s.start_time || !s.end_time) continue;
          const [sh, sm] = (s.start_time as string).split(':').map(Number);
          const [eh, em] = (s.end_time as string).split(':').map(Number);
          const min = eh * 60 + em - (sh * 60 + sm);
          if (min <= 0) continue;
          const t = taskMap.get(s.task_id as string);
          if (!t) continue;
          let key = '미분류';
          if (groupBy === 'category') key = t.category_main || '미분류';
          else if (groupBy === 'task') key = t.title;
          else if (groupBy === 'member') key = t.member_id || '공유';
          buckets.set(key, (buckets.get(key) ?? 0) + min);
        }
        const result = Array.from(buckets.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([key, minutes]) => ({
            key,
            minutes,
            label:
              minutes >= 60
                ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
                : `${minutes}분`,
          }));
        return {
          ok: true,
          data: { range: `${from} ~ ${to}`, group_by: groupBy, breakdown: result },
        };
      }

      default:
        return { ok: false, error: `알 수 없는 도구: ${name}` };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
