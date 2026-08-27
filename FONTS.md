# 글꼴이 날아가면 줄이 어긋난다 — 이 편집기의 구조와 함정

이 편집기는 **고정 캔버스**다. 글상자의 좌표(`x,y`)와 크기(`w,h`)가 px 로 박혀 있고,
발행본은 화면 폭에 맞춰 전체를 `transform: scale()` 로 한 번에 줄인다.
그래서 **글꼴이 오지 않으면 배치가 통째로 무너진다.**

같은 문장이 시스템 글꼴로 떨어지면 가로로 **5~6% 길어지고**, 한 줄이 두 줄로 넘어간다.
가운데 정렬된 글상자는 줄 수가 늘어난 만큼 위아래로 밀리면서,
밑줄·괘선처럼 옆에 놓아둔 도형과 **반 줄씩 어긋난다.** 페이지 밖으로 잘려 나가기도 한다.

실측(23px, 본문 한 줄):

| 글꼴 | 가로 | 줄상자 높이 |
|---|---|---|
| SUIT SemiBold | 903px | 29px |
| 시스템 sans-serif | 954px | 34px |

---

## 글꼴 소스 우선순위 (`public/site-render.js`)

1. **공개 CDN** (`_CDN_FONTS`) — 가장 안정적. 새 글꼴은 여기에 한 줄만 추가한다.
2. **`project.fontFiles`** — 편집기에서 올린 파일의 Firebase Storage 공개 URL.
3. **localStorage base64** — 발행 전 편집기 미리보기용(그 브라우저에만 있음).
4. 위 어디에도 없으면 **구글 폰트**로 요청한다.

## 함정 ① — 구글 폰트는 없는 이름을 조용히 무시한다

`family=SUIT+SemiBold` 처럼 구글에 없는 이름을 넣어도 응답은 **200** 이다.
그 글꼴만 빠진 CSS 가 돌아오고, 에러도 경고도 없다.
`SUIT SemiBold`(321곳)·`SUIT Medium`(32곳)이 이렇게 조용히 사라졌다.

## 함정 ② — Storage 업로드 글꼴은 CORS 로 막힌다

`@font-face` 의 글꼴 요청은 **항상 CORS 모드**다. 이미지(`<img>`)와 다르다.
Firebase Storage 버킷은 기본적으로 CORS 설정이 없어서,
`firebasestorage.googleapis.com` 에 올린 `.ttf` 는 발행본에서 **차단된다**
(`SUIT ExtraBold`, 332곳이 이렇게 막혔다). 편집기에서는 localStorage 사본으로 보이기 때문에
**올린 본인 PC 에서는 멀쩡해 보인다.**

버킷에 CORS 를 한 번 걸어두면 풀린다. **편집기가 알아서 건다** —
글꼴 파일을 새로 올리면, 또는 발행할 때 막힌 글꼴이 발견되면
`setStorageCors` 함수(`functions/index.js`)를 한 번 호출한다. 관리자 로그인 상태여야 한다.

수동으로 걸려면 `gsutil` 이 있는 PC 에서:

```bash
gsutil cors set storage.cors.json gs://newworld-1a1d5.firebasestorage.app
```

확인:

```bash
curl -sI -H "Origin: https://newworld-1a1d5.web.app" "<글꼴 URL>" | grep -i access-control
```

---

## 지금 걸려 있는 안전망

- 발행본은 **실제로 쓰는 글꼴 이름을 직접 `document.fonts.load()` 로 기다린 뒤** 배치를 다시 잡는다.
  `document.fonts.ready` 만으로는 부족하다 — 그 글꼴로 그린 글자가 없으면 그냥 통과해버린다.
- 그래도 **못 받은 글꼴이 있을 때만**, 줄이 늘어난 글상자의 글자를 줄여 상자 안에 넣는다
  (`fitText`). 정상일 때는 아무것도 건드리지 않는다 — 상자를 넘치는 배치는 대부분 의도된 것이다
  (괘선 위에 얹으려고 작은 상자에 가운데 정렬해 둔다).
- 화면 폭 변화는 `resize` 외에 `ResizeObserver`·`visualViewport`·`orientationchange` 로도 듣는다.
  폭이 실제로 바뀐 때만 다시 계산한다(`fit()` 이 문서 높이를 바꾸므로 높이까지 반응하면 무한 루프).
- **발행할 때 글꼴을 점검한다**(`checkFontSources`). 쓰는 글꼴마다 받아올 곳이 실제로 있는지
  그대로 확인해서(구글 폰트는 한 이름씩 물어야 400 이 뜬다), 다른 PC 에서 안 보일 글꼴이 있으면
  목록을 띄우고 발행을 물어본다. 조용히 깨지는 것을 막는 게 목적이다.
- CORS 로 막힌 글꼴이 발견되면 버킷에 CORS 를 걸고 **다시 확인해서** 정말 풀렸는지 본다.

## 새 글꼴을 추가할 때

`public/site-render.js` 의 `_CDN_FONTS` 에 넣는 것이 가장 안전하다.
[fonts-archive](https://github.com/fonts-archive) 에 있는 글꼴은 jsDelivr 로 바로 쓸 수 있다:

```
https://cdn.jsdelivr.net/gh/fonts-archive/<Family>/<Family>-<Weight>.woff2
```

편집기 글꼴 목록에는 `_CDN_FONTS` 가 자동으로 붙는다. 따로 적을 필요 없다.
