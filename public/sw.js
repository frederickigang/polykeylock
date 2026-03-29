self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: 'https://ais-dev-zhtasfoudfs3j5dd5e3ubf-245341165106.asia-east1.run.app/favicon.ico',
    badge: 'https://ais-dev-zhtasfoudfs3j5dd5e3ubf-245341165106.asia-east1.run.app/favicon.ico'
  };
  event.waitUntil(self.notificationClick(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
