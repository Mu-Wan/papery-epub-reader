// Run in the browser-check harness against the local web app. All Google calls are mocked.
async (page) => {
  await page.goto('http://localhost:3100');
  await page.setViewportSize({width:1280,height:800});
  await page.getByRole('button', { name: '用户资料与同步', exact: true }).click(); await page.getByRole('button',{name:'云同步',exact:true}).click();

  let authRequestUrl = '';
  await page.context().route('https://accounts.google.com/o/oauth2/v2/auth**', async route => {
    authRequestUrl = route.request().url();
    const state = /[?&]state=([^&]+)/.exec(authRequestUrl)?.[1];
    if (!state) throw new Error('Google authorization request did not include state');
    const responseHash = `access_token=papery-local-integration-test&token_type=Bearer&expires_in=3600&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.appdata&state=${state}`;
    return route.fulfill({ status: 302, headers: { location: `http://localhost:3100/google-drive-callback.html#${responseHash}` } });
  });

  await page.context().route('https://www.googleapis.com/**', async route => {
    const request = route.request();
    const pathname = request.url().split('?')[0].replace('https://www.googleapis.com', '');
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'Location, Range', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (request.headers().authorization !== 'Bearer papery-local-integration-test') throw new Error('Missing mocked OAuth token');
    if (pathname === '/drive/v3/files' && request.method() === 'GET') return route.fulfill({ status: 200, headers, body: JSON.stringify({ files: [] }) });
    if (pathname === '/upload/drive/v3/files' && request.method() === 'POST') return route.fulfill({ status: 200, headers: { ...headers, Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=papery-test-session' }, body: '{}' });
    if (pathname === '/upload/drive/v3/files' && request.method() === 'PUT') return route.fulfill({ status: 200, headers, body: '{}' });
    throw new Error(`Unexpected Google request: ${request.method()} ${pathname}`);
  });

  await page.getByLabel('OAuth 客户端 ID', { exact: true }).fill('test.apps.googleusercontent.com');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: '使用 Google 连接', exact: true }).click();
  const popup = await popupPromise;
  await popup.getByLabel('加密连接码', { exact: true }).waitFor();
  const code = await popup.getByLabel('加密连接码', { exact: true }).inputValue();
  if (code.includes('papery-local-integration-test')) throw new Error('Token was not encrypted');
  if (!authRequestUrl.includes('response_type=token') || !authRequestUrl.includes('google-drive-callback.html')) throw new Error('Unexpected Google authorization request');
  await page.getByLabel('连接码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '完成连接', exact: true }).click();
  await page.getByText('已连接 Google Drive，可以立即同步', { exact: true }).waitFor();
  await popup.close().catch(() => undefined);
  return { authorization: 'mocked Google OAuth callback', encryptedReturn: 'passed', realGoogleRequests: 0 };
}
