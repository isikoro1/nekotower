# Firebase setup checklist

オンライン対戦の実動作に必要な、ユーザー側のFirebase設定チェックリストです。
このリポジトリには実際のFirebase設定値をコミットしません。

## 作成するもの

- Firebase project
- Web app
- Realtime Database
- Anonymous Authentication

## 安全の前提

- 料金プランは Spark のままにする。
- Blaze へアップグレードしない。
- 自宅PCをサーバーとして公開しない。
- Firebase config は秘密鍵ではないが、`src/online/firebase-config.js` はコミットしない。
- Database Rules を未設定のまま公開しない。

## 取得する設定値

`src/firebase-config.js` に入れる値:

```js
window.NEKO_TOWER_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID",
};
```

この値はフロントエンドに置く前提の識別情報です。
ただし、Database Rulesを緩くすると危険です。

実装上の配置先は `src/online/firebase-config.js` です。
雛形として `src/online/firebase-config.example.js` をコミットしています。
`src/online/firebase-config.js` は `.gitignore` に入っているためコミットしません。

## Database Rules

Realtime Database の Rules には、リポジトリ直下の `firebase-database.rules.json` の内容を貼り付ける。

このルールは、匿名ログイン済みユーザーだけを許可し、待機列、ルーム、プレイヤー入力の形を最低限チェックする。
オンライン対戦の同期を増やす場合は、このルールも一緒に更新する。

## 課金リスクを下げる設定

- Blazeに上げない。Spark無料枠で試す。
- 公開初期は最大同時対戦数を低めにする。
- ルーム寿命を短くする。
- スナップショット送信頻度を上げすぎない。

## 実装者へ渡すもの

- Firebase config
- Database URL
- テスト用プロジェクトか本番用プロジェクトか
- 公開するドメイン

## 現在のリポジトリ状態

- `src/online/firebase-config.example.js`: コミット済みの雛形
- `src/online/firebase-config.js`: 実設定用。コミット禁止
- `src/online/online-bootstrap.js`: Firebase未設定時はオンライン機能を無効化し、設定ありなら接続確認を行う

## 接続確認

1. Firebase Consoleでプロジェクトを作る。Google Analytics は不要。
2. 料金プランが Spark であることを確認する。
3. Web appを追加して、Firebase configを取得する。
4. AuthenticationでAnonymous providerを有効化する。
5. Realtime Databaseを作成する。
6. Realtime DatabaseのRulesに `firebase-database.rules.json` の内容を貼り付ける。
7. `src/online/firebase-config.example.js` を `src/online/firebase-config.js` にコピーする。
8. Firebase ConsoleのWeb app設定値に置き換える。
9. ローカル起動後、タイトルの「オンライン対戦」を押す。
10. 1台目で「対戦相手を待っています...」が出ることを確認する。
11. 2台目または別ブラウザで同じ操作をする。
12. 「マッチしました。対戦同期は次に実装します」と出れば、Firebase初期化、匿名ログイン、待機キュー、ルーム作成は成功。

現在のSDK読み込みは、Firebase公式ドキュメントのブラウザモジュール形式に合わせて `https://www.gstatic.com/firebasejs/12.15.0/` を使う。

この段階では、まだ実際の対戦画面同期は始まらない。
確認できるのはマッチング成立まで。
