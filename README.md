# 画像リサイズツール

画像を外部へアップロードせず、ブラウザ内だけでリサイズ・切り抜き・形式変換する静的Webツールです。

## 主な機能

- JPG、PNG、WebP、BMP画像の読み込み
- ドラッグ＆ドロップとファイル選択
- 縦横比を保ったフィット表示
- 指定サイズに合わせた中央切り抜き
- JPG、PNG、WebP形式での保存
- JPG・WebPの画質調整と出力容量の事前表示
- OGP、正方形、証明写真向け比率のプリセット
- ライト／ダーク表示とキーボード操作

画像の読み込み、Canvas処理、ダウンロードは端末内で完結します。外部API、解析タグ、外部フォントは使用しません。

## 安全上の制限

ブラウザのメモリ不足やフリーズを避けるため、次の上限を設けています。

- 入力ファイル: 40MBまで
- 入力画像: 5000万画素まで
- 出力画像: 一辺8192px、合計約1677万画素まで

証明写真プリセットは縦横比を整えるためのものです。顔の位置、余白、背景、容量などは提出先の最新条件を確認してください。

## ローカル起動

```bash
python3 -m http.server 8000
```

起動後、`http://localhost:8000/`を開きます。

## テスト

Node.js 22以降を使用します。

```bash
npm ci
npm run check
```

`npm run check`では、次を確認します。

- リサイズ・切り抜き計算と入力制限の単体テスト
- HTML内のプライバシー・安全・アクセシビリティ要件
- HTML構文
- Chromiumによる画像読み込み、設定変更、形式変換、異常入力、外部通信のE2Eテスト

Pull RequestではGitHub Actionsでも同じチェックを実行します。

## ファイル構成

```text
.
├── index.html
├── style.css
├── image-utils.js
├── script.js
├── tests/
│   ├── image-utils.test.cjs
│   ├── static-check.cjs
│   ├── app.spec.cjs
│   └── server.cjs
├── playwright.config.cjs
└── .github/workflows/quality.yml
```
