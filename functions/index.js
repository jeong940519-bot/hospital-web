const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

exports.aiProxy = onCall({ region: 'asia-northeast3' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }

  const db = getFirestore();
  const configSnap = await db.doc('config/ai').get();
  const apiKey = configSnap.data()?.key;

  if (!apiKey) {
    throw new HttpsError('not-found', 'API Key가 설정되지 않았습니다.');
  }

  const body = request.data?.body;
  if (!body) {
    throw new HttpsError('invalid-argument', '요청 본문이 없습니다.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || '알 수 없는 오류';
    if (res.status === 402 || msg.includes('credit') || msg.includes('balance')) {
      throw new HttpsError('resource-exhausted', '크레딧이 소진되었습니다. console.anthropic.com에서 충전해주세요.');
    }
    throw new HttpsError('internal', msg);
  }

  return data;
});
