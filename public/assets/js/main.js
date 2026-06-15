import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

async function loadContent() {
  try {
    const snap = await getDoc(doc(db, 'site', 'content'));
    if (!snap.exists()) return;
    const data = snap.data();

    if (data.hospitalName) {
      document.getElementById('hospital-name').textContent = data.hospitalName;
      document.getElementById('footer-hospital-name').textContent = data.hospitalName;
      document.title = data.hospitalName;
    }
    if (data.heroTitle) document.getElementById('hero-title').innerHTML = data.heroTitle;
    if (data.heroSubtitle) document.getElementById('hero-subtitle').textContent = data.heroSubtitle;
    if (data.heroBg) document.getElementById('hero-bg').style.backgroundImage = `url(${data.heroBg})`;
    if (data.aboutText) document.getElementById('about-text').innerHTML = data.aboutText;
    if (data.aboutImg) document.getElementById('about-img').src = data.aboutImg;
    if (data.address) document.getElementById('hospital-address').textContent = data.address;
    if (data.phone) {
      document.getElementById('hospital-phone').textContent = data.phone;
      document.getElementById('contact-phone-btn').href = `tel:${data.phone}`;
    }
    if (data.parking) document.getElementById('hospital-parking').textContent = data.parking;
    if (data.kakaoUrl) document.getElementById('contact-kakao-btn').href = data.kakaoUrl;
    if (data.footerInfo) document.getElementById('footer-info').textContent = data.footerInfo;
    if (data.primaryColor) {
      document.documentElement.style.setProperty('--primary', data.primaryColor);
    }
    if (data.font) {
      document.body.style.fontFamily = `'${data.font}', sans-serif`;
    }
  } catch (e) {
    console.log('콘텐츠 로드 실패:', e);
  }
}

loadContent();
