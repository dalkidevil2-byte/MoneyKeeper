import React from 'react';

/**
 * 어시스턴트/사용자 메시지를 렌더 — URL 과 [텍스트](URL) markdown 링크를
 * 클릭 가능한 <a> 로 변환. 그 외는 그대로 표시 (whitespace-pre-wrap 유지).
 */
export default function MessageContent({
  text,
  linkClassName,
}: {
  text: string;
  linkClassName?: string;
}) {
  const parts = parse(text);
  const cls =
    linkClassName ?? 'underline underline-offset-2 break-all hover:opacity-80';
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'link' ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cls}
          >
            {p.label}
          </a>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  );
}

type Token =
  | { type: 'text'; text: string }
  | { type: 'link'; href: string; label: string };

// markdown [label](url) 우선 매칭, 그 다음 bare URL.
function parse(input: string): Token[] {
  const tokens: Token[] = [];
  // [label](url) 와 bare http(s):// URL 을 한 번에 잡는 정규식.
  // - group 1,2: markdown label, href
  // - group 3: bare URL
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<>"']+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) {
      tokens.push({ type: 'text', text: input.slice(last, m.index) });
    }
    if (m[1] && m[2]) {
      tokens.push({ type: 'link', href: m[2], label: m[1] });
    } else if (m[3]) {
      // 끝에 있는 마침표/콤마/괄호닫기는 링크 밖으로 꺼냄
      let url = m[3];
      const trailing = url.match(/[).,!?;:]+$/);
      let trailText = '';
      if (trailing) {
        trailText = trailing[0];
        url = url.slice(0, url.length - trailText.length);
      }
      tokens.push({ type: 'link', href: url, label: url });
      if (trailText) tokens.push({ type: 'text', text: trailText });
    }
    last = re.lastIndex;
  }
  if (last < input.length) {
    tokens.push({ type: 'text', text: input.slice(last) });
  }
  return tokens;
}
