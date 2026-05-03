# 🦎 ひとつなぎ レオパ管理アプリ

レオパード ゲッコー（個体）の日々の管理表をブラウザで簡単に入力でき、Chatwork に異常を自動通知する PC ローカル Web アプリです。

## できること

- **餌は複数選択** … チェックボックスで「ピンクマウス＋レッドローチ」のように複数の餌を1日のうちに記録できます
- **共通項目をワンクリック** … 「すべて通常通り」ボタンで「清掃◯／消毒◯／保守点検◯／変動なし／良好／掃除済み」を一括入力
- **前日コピー** … 「前日の内容をコピー」で前回の入力内容を流用
- **Chatwork 通知（自動）**
  - 毎朝9時：直近7日間給餌なしの個体を警告（摂食アラート）
  - 毎夜20時：当日の記入漏れを警告（記入漏れアラート）
- **体重グラフ** … 月次フルメンテで測った体重の推移を個体ごとにグラフ表示
- **個体別履歴** … 個体ごとの給餌・排泄・体重を直近12ヶ月分一覧
- **CSV エクスポート** … 既存 Excel に近いレイアウトで月単位ダウンロード
- **過去 Excel データの取り込み** … 既存の `動物管理表.xlsx` の内容を初期データとしてインポート可能

## 動作要件

- macOS / Linux / Windows
- Node.js 18 以上（[https://nodejs.org/](https://nodejs.org/) からインストール）
- ブラウザ（Chrome / Safari / Edge / Firefox いずれか）

## セットアップ手順（初回のみ）

### 1. ターミナルでこのフォルダに入る
```bash
cd "/Users/tettanagai/Documents/Claude/Projects/動物事業/leopard-manager"
```

### 2. ライブラリをインストール
```bash
npm install
```
> 数十秒〜1分かかります。`better-sqlite3` のビルドのために Xcode Command Line Tools が必要なことがあります。
> もし失敗する場合は: `xcode-select --install`

### 3. データベースを初期化
```bash
npm run init-db
```

### 4. （任意）過去の Excel データを取り込む
```bash
npm run import-excel -- "../動物管理表【台帳】.xlsx のコピー.xlsx"
```
（パスは実際のファイル位置に合わせてください）

### 5. Chatwork 設定を入れる
```bash
cp .env.example .env
```
エディタで `.env` を開いて以下を入力：
- `CHATWORK_API_TOKEN`: Chatwork → 右上アイコン → 「サービス連携」→「APIトークン」 で発行
- `CHATWORK_ROOM_ID`: 通知を送りたい Chatwork ルームの ID
  - 通知ルームの URL `https://www.chatwork.com/#!rid12345678` の `12345678` の部分
- `CHATWORK_MENTION_IDS`: メンションしたいアカウントID（カンマ区切り、空でも OK）

> Chatwork API の仕様は変わることがあるので、最新の情報は Chatwork 公式ヘルプを参照してください。

## 普段の使い方

### 起動
```bash
npm start
```
ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

### 終了
ターミナルで `Ctrl + C`

### 通知の自動実行について
アプリが起動している間だけ、設定した時刻（デフォルト9時／20時）に自動で通知判定が走ります。
**通知させたい日は、その時刻にアプリを起動しておく必要があります。**

夜閉店時にアプリを終了するなら、20時以降に動かしておくと記入漏れ通知が確実に届きます。

### 通知のテスト
ブラウザの「設定」タブから：
- 「通知を送信」 → 実際に Chatwork にテストメッセージが届く
- 「アラートチェック実行」 → 今すぐアラート判定を走らせる
- 「送信なし」のボタンは Chatwork に投げず結果だけ確認できるドライラン

## ファイル構成

```
leopard-manager/
├── server.js              ... Express サーバ + 内蔵スケジューラ
├── package.json           ... 依存ライブラリ定義
├── .env.example           ... 設定テンプレート
├── db/schema.sql          ... DB スキーマ
├── lib/
│   ├── db.js              ... DB 接続
│   ├── repository.js      ... SQL クエリ集約
│   ├── chatwork.js        ... Chatwork API クライアント
│   ├── alerts.js          ... アラート判定
│   └── csvExport.js       ... CSV 出力
├── public/
│   ├── index.html         ... 入力画面（メイン）
│   ├── history.html       ... カレンダー履歴
│   ├── individual.html    ... 個体別履歴・体重グラフ
│   ├── settings.html      ... 設定・マスタ管理
│   ├── styles.css
│   └── app.js
├── scripts/
│   ├── init-db.js         ... DB 初期化
│   ├── import-excel.js    ... 既存 Excel インポート
│   └── test-notify.js     ... Chatwork 通知テスト
└── data/
    └── animals.db         ... SQLite DB（初回起動時に作成）
```

## カスタマイズ

- **餌・個体・担当者の追加**：ブラウザの「設定」タブから追加可能
- **通知時刻**：`.env` の `NOTIFY_MORNING_CRON` / `NOTIFY_EVENING_CRON` を cron 形式で編集
  - 例: `30 21 * * *` → 21:30 に実行
- **アラートしきい値**：「7日間給餌なし」のしきい値は `/api/alerts/long-term?days=10` のように URL で指定可能。固定値変更は `lib/alerts.js` の `days` を編集

## トラブルシュート

### `npm install` で `better-sqlite3` がエラー
```bash
xcode-select --install   # macOS の場合
```
その後もう一度 `npm install`

### ブラウザで `localhost:3000` が開かない
- ターミナルに「Leopard Manager 起動」が出ているか確認
- 別の `PORT` を使いたい場合は `.env` で `PORT=3001` のように設定

### Chatwork に届かない
- 「設定」タブの「通知を送信」を押して結果を確認
- `.env` の `CHATWORK_API_TOKEN` と `CHATWORK_ROOM_ID` を再確認
- API トークンは Chatwork のプランによっては利用できない場合があります

## データのバックアップ

`data/animals.db` を定期的にコピーしてください。SQLite なのでファイル1つで完結します。

```bash
cp data/animals.db data/animals.backup.$(date +%Y%m%d).db
```
