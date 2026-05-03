/* eslint-disable no-restricted-globals */
// MoneyKeeper Service Worker — Web Push 처리

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 푸시 수신
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '알림', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '알림';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon',
    badge: '/icon',
    tag: data.tag,
    data: { url: data.url || '/' },
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 — URL 로 이동 (이미 열려있는 탭 재사용)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // 같은 origin 의 탭이 있으면 focus + navigate
          if ('focus' in client) {
            try {
              client.navigate(url);
            } catch (e) {
              // 일부 브라우저는 navigate 미지원
            }
            return client.focus();
          }
        }
        // 없으면 새 창
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
