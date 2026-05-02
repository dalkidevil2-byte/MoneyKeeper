import type { ArchiveProperty } from '@/types';

export type ArchiveTemplate = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  schema: ArchiveProperty[];
};

export const ARCHIVE_TEMPLATES: ArchiveTemplate[] = [
  {
    key: 'diary',
    name: '3줄일기',
    emoji: '📔',
    color: '#f59e0b',
    description: '하루 3줄로 짧게 기록',
    schema: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'good', label: '좋았던 것', type: 'longtext' },
      { key: 'learned', label: '배운 것', type: 'longtext' },
      { key: 'tomorrow', label: '내일 할 것', type: 'longtext' },
    ],
  },
  {
    key: 'recipe',
    name: '레시피',
    emoji: '🍳',
    color: '#ef4444',
    description: '요리 레시피와 링크 보관',
    schema: [
      { key: 'name', label: '이름', type: 'text', required: true },
      {
        key: 'category',
        label: '분류',
        type: 'select',
        options: ['한식', '양식', '일식', '중식', '디저트', '음료', '기타'],
      },
      { key: 'url', label: '레시피 URL', type: 'url' },
      { key: 'cook_time', label: '조리시간 (분)', type: 'number' },
      { key: 'rating', label: '평점', type: 'rating' },
      { key: 'ingredients', label: '재료', type: 'longtext' },
      { key: 'memo', label: '메모', type: 'longtext' },
    ],
  },
  {
    key: 'reading',
    name: '독서 목록',
    emoji: '📚',
    color: '#10b981',
    description: '읽고 있는/읽을/읽은 책',
    schema: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'author', label: '저자', type: 'text' },
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: ['읽고 싶은', '읽는 중', '완독', '중단'],
      },
      { key: 'rating', label: '별점', type: 'rating' },
      { key: 'started_at', label: '시작일', type: 'date' },
      { key: 'finished_at', label: '완독일', type: 'date' },
      { key: 'review', label: '한줄평/감상', type: 'longtext' },
    ],
  },
  {
    key: 'drama',
    name: '드라마/영화',
    emoji: '🎬',
    color: '#8b5cf6',
    description: '본 드라마, 영화 기록',
    schema: [
      { key: 'title', label: '제목', type: 'text', required: true },
      {
        key: 'kind',
        label: '종류',
        type: 'select',
        options: ['드라마', '영화', '예능', '다큐', '애니'],
      },
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: ['보고 싶은', '보는 중', '완료', '중단'],
      },
      { key: 'rating', label: '별점', type: 'rating' },
      {
        key: 'genre',
        label: '장르',
        type: 'multiselect',
        options: ['로맨스', '액션', '스릴러', '코미디', '판타지', 'SF', '드라마'],
      },
      { key: 'platform', label: '플랫폼', type: 'text' },
      { key: 'review', label: '한줄평', type: 'longtext' },
    ],
  },
  {
    key: 'gyungjosa',
    name: '경조사',
    emoji: '💐',
    color: '#ec4899',
    description: '축의금/조의금 등 경조사 기록',
    schema: [
      { key: 'who', label: '대상', type: 'text', required: true },
      {
        key: 'occasion',
        label: '행사',
        type: 'select',
        options: ['결혼', '돌잔치', '장례', '환갑', '칠순', '입학', '졸업', '기타'],
      },
      { key: 'date', label: '날짜', type: 'date' },
      { key: 'amount', label: '금액', type: 'currency' },
      {
        key: 'direction',
        label: '방향',
        type: 'select',
        options: ['전달', '수령'],
      },
      { key: 'memo', label: '메모', type: 'longtext' },
    ],
  },
  {
    key: 'wishlist',
    name: '갖고 싶은 것',
    emoji: '🎁',
    color: '#3b82f6',
    description: '사고 싶은 물건/선물',
    schema: [
      { key: 'name', label: '이름', type: 'text', required: true },
      { key: 'price', label: '가격', type: 'currency' },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'priority', label: '우선순위', type: 'rating' },
      { key: 'bought', label: '구매 완료', type: 'checkbox' },
      { key: 'memo', label: '메모', type: 'longtext' },
    ],
  },
  {
    key: 'packing',
    name: '준비물',
    emoji: '🎒',
    color: '#10b981',
    description: '여행 / 출장 / 등산 / 외출 챙길 것',
    schema: [
      { key: 'title', label: '목적지/이벤트', type: 'text', required: true },
      {
        key: 'category',
        label: '종류',
        type: 'select',
        options: ['여행', '출장', '등산', '캠핑', '운동', '목욕탕', '병원', '기타'],
      },
      { key: 'date', label: '날짜', type: 'date' },
      { key: 'items', label: '준비물', type: 'checklist' },
      { key: 'memo', label: '메모', type: 'longtext' },
    ],
  },
];

/** 빈 컬렉션 시작용 — 최소 schema */
export const BLANK_SCHEMA: ArchiveProperty[] = [
  { key: 'title', label: '제목', type: 'text', required: true },
  { key: 'memo', label: '메모', type: 'longtext' },
];
