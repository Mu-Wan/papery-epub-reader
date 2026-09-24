// Run in the browser-check harness against the local web app. All Google calls are mocked.
async (page) => {
  await page.goto('http://localhost:3100');
  await page.getByRole('button', { name: /读者 仅保存在本机/ }).click();

  await page.context().route('https://accounts.google.com/gsi/client', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google={accounts:{oauth2:{initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'papery-local-integration-test',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.appdata'})})}}};`,
  }));
  await page.context().route('https://www.googleapis.com/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'Location', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (request.headers().authorization !== 'Bearer papery-local-integration-test') throw new Error('Missing mocked OAuth token');
    if (url.pathname === '/drive/v3/files' && request.method() === 'GET') return route.fulfill({ status: 200, headers, body: JSON.stringify({ files: [] }) });
    if (url.pathname === '/upload/drive/v3/files' && request.method() === 'POST') return route.fulfill({ status: 200, headers: { ...headers, Location: 'https://www.googleapis.com/upload-session' }, body: '{}' });
    if (url.pathname === '/upload-session' && request.method() === 'PUT') return route.fulfill({ status: 200, headers, body: '{}' });
    throw new Error(`Unexpected Google request: ${request.method()} ${url.pathname}`);
  });

  await page.getByLabel('OAuth 客户端 ID', { exact: true }).fill('test.apps.googleusercontent.com');
  await page.getByRole('button', { name: '使用 Google 连接', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '使用 Google 连接', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.syncStatus')?.textContent.includes('同步完成'));
  if (!new URL(page.url()).pathname.endsWith('/')) throw new Error('Browser left the reader during GIS authorization');
  return { authorization: 'GIS token callback', popupGesture: 'direct from user click', initialSync: 'passed', realGoogleRequests: 0 };
}
